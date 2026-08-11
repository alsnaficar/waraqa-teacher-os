import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { BillingAccessError, BillingError } from "./types.ts";
import {
  activateSubscriptionOp,
  attachPaymentReceiptInputSchema,
  attachPaymentReceiptOp,
  getAdminReceiptUrlInputSchema,
  getAdminReceiptUrlOp,
  listAdminSubmittedPaymentsOp,
} from "./billing.operations.ts";
import { loadOpenCheckout } from "./billing.functions.ts";
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  type ReceiptStorage,
} from "./receipt.ts";
import { registerPaymentProvider } from "./providers/payment-provider.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATIONS_FILE = join(ROOT, "features/billing/billing.operations.ts");
const FUNCTIONS_FILE = join(ROOT, "features/billing/billing.functions.ts");
const PAYMENTS_ROUTE = join(ROOT, "routes/_authenticated/admin/payments.tsx");
const SUBSCRIPTION_ROUTE = join(ROOT, "routes/_authenticated/subscription.tsx");

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_SEM = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "33333333-3333-4333-8333-333333333333";
const SEM_ID = "44444444-4444-4444-8444-444444444444";
const SUB_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PAY_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAY_UNKNOWN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

registerPaymentProvider({
  id: "manual",
  label: "تحويل بنكي",
  async createCheckout(request) {
    return { kind: "manual", reference: `WRQ-${request.paymentId.slice(0, 8)}`, message: "حوّل" };
  },
  async confirmPayment() {
    return { settled: false, reference: null };
  },
});

type Row = Record<string, unknown>;
type Filter = { column: string; op: string; value: unknown };

function jpegBytes(size = 32): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function pdfBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from("%PDF-1.4 hello"));
}

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set(Buffer.from("RIFF"), 0);
  bytes.set(Buffer.from("WEBP"), 8);
  return bytes;
}

function svgBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"));
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (filter.op === "neq") return actual !== filter.value;
    if (filter.op === "in") {
      return Array.isArray(filter.value) && filter.value.includes(actual);
    }
    return true;
  });
}

function seedDb(overrides: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    user_roles: [{ user_id: ADMIN, role: "admin" }],
    profiles: [{ id: USER_A, full_name: "سارة المعلم" }],
    plans: [
      {
        id: PLAN_SEM,
        code: "core_standard_semester",
        name: "فصل دراسي",
        price: 40,
        price_sar: 40,
        starts_with: "semester",
        is_active: true,
        term_kind: "semester",
      },
    ],
    billing_academic_years: [
      { id: YEAR_ID, starts_on: "2026-08-23", ends_on: "2027-06-30", is_current: true },
    ],
    billing_semesters: [
      {
        id: SEM_ID,
        academic_year_id: YEAR_ID,
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        is_current: true,
        sequence: 1,
      },
    ],
    subscriptions: [
      {
        id: SUB_A,
        user_id: USER_A,
        plan_id: PLAN_SEM,
        status: "pending_payment",
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        starts_at: "2026-08-23",
        expires_at: "2027-01-07",
        billing_academic_year_id: YEAR_ID,
        billing_semester_id: SEM_ID,
        created_from_payment_id: PAY_A,
        created_at: "2026-08-11T00:00:00Z",
      },
    ],
    payments: [
      {
        id: PAY_A,
        user_id: USER_A,
        subscription_id: SUB_A,
        amount: 40,
        amount_sar: 40,
        discount_sar: 0,
        net_sar: 40,
        currency: "SAR",
        status: "created",
        transfer_reference: null,
        transaction_number: null,
        receipt_path: null,
        created_at: "2026-08-11T10:00:00Z",
        paid_at: null,
        verified_at: null,
      },
    ],
    subscription_logs: [],
    billing_audit_log: [],
    ...overrides,
  };
}

function createMockClient(db: Record<string, Row[]>) {
  const client = {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: { users: [{ id: USER_A, email: "sara@example.com" }] },
            error: null,
          };
        },
      },
    },
    from(table: string) {
      const filters: Filter[] = [];
      let pendingUpdate: Row | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitN = Number.POSITIVE_INFINITY;

      const runSelect = () => {
        let rows = (db[table] ?? []).filter((row) => matches(row, filters));
        if (orderCol) {
          const column = orderCol;
          rows = [...rows].sort((a, b) => {
            const left = String(a[column] ?? "");
            const right = String(b[column] ?? "");
            return orderAsc ? left.localeCompare(right) : right.localeCompare(left);
          });
        }
        return rows.slice(0, limitN);
      };

      const execute = async (mode: "many" | "maybe") => {
        if (pendingUpdate) {
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) Object.assign(row, pendingUpdate);
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
        }
        const rows = runSelect();
        if (mode === "many") return { data: rows, error: null };
        return { data: rows[0] ?? null, error: null };
      };

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        update(row: Row) {
          pendingUpdate = row;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, op: "in", value });
          return api;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderCol = column;
          orderAsc = options?.ascending !== false;
          return api;
        },
        limit(n: number) {
          limitN = n;
          return api;
        },
        maybeSingle() {
          return execute("maybe");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
  return { client, db };
}

function createMockStorage(options: { failRemove?: (path: string) => boolean } = {}) {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const removed: string[] = [];
  const signed: Array<{ path: string; expiresIn: number }> = [];
  const storage: ReceiptStorage = {
    async upload(path, body, contentType) {
      objects.set(path, { body, contentType });
    },
    async remove(path) {
      if (options.failRemove?.(path)) {
        throw new Error("cleanup failed");
      }
      objects.delete(path);
      removed.push(path);
    },
    async createSignedUrl(path, expiresIn) {
      signed.push({ path, expiresIn });
      return `https://signed.example/receipt?ttl=${expiresIn}`;
    },
  };
  return { storage, objects, removed, signed };
}

async function attach(
  db: Record<string, Row[]>,
  input: {
    userId?: string;
    paymentId?: string;
    bytes?: Uint8Array;
    declaredMime?: string;
    declaredName?: string;
  } = {},
  storageOptions?: { failRemove?: (path: string) => boolean },
) {
  const { client } = createMockClient(db);
  const mock = createMockStorage(storageOptions);
  const result = await attachPaymentReceiptOp(
    client as never,
    {
      userId: input.userId ?? USER_A,
      paymentId: input.paymentId ?? PAY_A,
      bytes: input.bytes ?? jpegBytes(),
      declaredMime: input.declaredMime ?? "image/jpeg",
      declaredName: input.declaredName ?? "receipt.jpg",
    },
    mock.storage,
  );
  return { result, db, mock };
}

function assertBillingError(err: unknown, code: string) {
  assert.equal(err instanceof BillingError, true);
  assert.equal((err as BillingError).code, code);
}

describe("attachPaymentReceiptOp", () => {
  it("A. owner uploads created payment", async () => {
    const { result, db, mock } = await attach(seedDb());
    assert.deepEqual(result, { ok: true, hasReceipt: true });
    const payment = db.payments[0];
    const path = String(payment.receipt_path);
    assert.equal(path.startsWith(`${USER_A}/`), true);
    assert.equal(path.includes(PAY_A), true);
    assert.equal(mock.objects.has(path), true);
    assert.equal("receipt_path" in result, false);
  });

  it("B. owner uploads submitted payment", async () => {
    const db = seedDb();
    db.payments[0].status = "submitted";
    const { result, mock } = await attach(db);
    assert.equal(result.hasReceipt, true);
    assert.equal(mock.objects.size, 1);
  });

  it("C. second upload replaces receipt", async () => {
    const db = seedDb();
    const first = await attach(db, { declaredName: "one.jpg" });
    const oldPath = String(db.payments[0].receipt_path);
    const second = await attach(db, {
      bytes: pngBytes(),
      declaredMime: "image/png",
      declaredName: "two.png",
    });
    const newPath = String(db.payments[0].receipt_path);
    assert.notEqual(newPath, oldPath);
    assert.equal(second.mock.objects.has(newPath), true);
    assert.equal(second.mock.removed.includes(oldPath), true);
    assert.equal(first.result.hasReceipt, true);
  });

  it("D. verified denied", async () => {
    const db = seedDb();
    db.payments[0].status = "verified";
    await assert.rejects(
      () => attach(db),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("E. rejected payment can replace receipt without reopening", async () => {
    const db = seedDb();
    db.payments[0].status = "rejected";
    db.payments[0].rejection_reason = "المبلغ غير مطابق";
    const { result } = await attach(db);
    assert.equal(result.hasReceipt, true);
    assert.equal(db.payments[0].status, "rejected");
    assert.equal(db.payments[0].rejection_reason, "المبلغ غير مطابق");
  });

  it("F. scheduled/active subscription denied", async () => {
    for (const status of ["scheduled", "active"]) {
      const db = seedDb();
      db.subscriptions[0].status = status;
      await assert.rejects(
        () => attach(db),
        (err) => {
          assertBillingError(err, "INVALID_PAYMENT");
          return true;
        },
      );
    }
  });

  it("G. other user denied", async () => {
    await assert.rejects(
      () => attach(seedDb(), { userId: USER_B }),
      (err) => {
        assert.equal(err instanceof BillingAccessError, true);
        return true;
      },
    );
  });

  it("H. wrong subscription ownership denied", async () => {
    const db = seedDb();
    db.subscriptions[0].user_id = USER_B;
    await assert.rejects(
      () => attach(db),
      (err) => {
        assert.equal(err instanceof BillingAccessError, true);
        return true;
      },
    );
  });

  it("I. invalid MIME denied", async () => {
    await assert.rejects(
      () =>
        attach(seedDb(), {
          bytes: svgBytes(),
          declaredMime: "image/svg+xml",
          declaredName: "x.svg",
        }),
      (err) => {
        assertBillingError(err, "INVALID_RECEIPT");
        return true;
      },
    );
  });

  it("J. invalid extension denied", async () => {
    await assert.rejects(
      () => attach(seedDb(), { declaredName: "malware.exe" }),
      (err) => {
        assertBillingError(err, "INVALID_RECEIPT");
        return true;
      },
    );
  });

  it("K. MIME/extension mismatch denied", async () => {
    await assert.rejects(
      () =>
        attach(seedDb(), {
          bytes: jpegBytes(),
          declaredMime: "image/png",
          declaredName: "receipt.png",
        }),
      (err) => {
        assertBillingError(err, "INVALID_RECEIPT");
        return true;
      },
    );
  });

  it("L. >5 MB denied", async () => {
    await assert.rejects(
      () => attach(seedDb(), { bytes: jpegBytes(RECEIPT_MAX_BYTES + 1) }),
      (err) => {
        assertBillingError(err, "INVALID_RECEIPT");
        return true;
      },
    );
  });

  it("M/N. generated path begins with user id and contains payment id", async () => {
    const { db } = await attach(seedDb());
    const path = String(db.payments[0].receipt_path);
    assert.equal(path.startsWith(`${USER_A}/${PAY_A}/`), true);
    assert.match(path, /\.jpg$/);
  });

  it("O. client cannot provide receipt_path", () => {
    assert.throws(() =>
      attachPaymentReceiptInputSchema.parse({
        paymentId: PAY_A,
        contentBase64: "abc",
        receipt_path: `${USER_B}/evil.jpg`,
      }),
    );
    assert.throws(() =>
      attachPaymentReceiptInputSchema.parse({
        paymentId: PAY_A,
        contentBase64: "abc",
        userId: USER_B,
      }),
    );
  });

  it("P. failed CAS cleans new object", async () => {
    const db = seedDb();
    const { client } = createMockClient(db);
    const mock = createMockStorage();
    mock.storage.upload = async (path, body, contentType) => {
      db.payments[0].status = "verified";
      mock.objects.set(path, { body, contentType });
    };
    await assert.rejects(
      () =>
        attachPaymentReceiptOp(
          client as never,
          {
            userId: USER_A,
            paymentId: PAY_A,
            bytes: jpegBytes(),
            declaredMime: "image/jpeg",
            declaredName: "receipt.jpg",
          },
          mock.storage,
        ),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
    assert.equal(mock.objects.size, 0);
    assert.equal(mock.removed.length, 1);
    assert.equal(db.payments[0].receipt_path, null);
  });

  it("Q. old receipt cleanup failure does not corrupt DB state", async () => {
    const db = seedDb();
    const first = await attach(db);
    const oldPath = String(db.payments[0].receipt_path);
    const second = await attach(
      db,
      { bytes: pngBytes(), declaredMime: "image/png", declaredName: "two.png" },
      { failRemove: (path) => path === oldPath },
    );
    const newPath = String(db.payments[0].receipt_path);
    assert.notEqual(newPath, oldPath);
    assert.equal(db.payments[0].receipt_path, newPath);
    assert.equal(second.mock.objects.has(newPath), true);
    assert.equal(first.result.ok, true);
  });

  it("U. unknown payment denied", async () => {
    await assert.rejects(
      () => attach(seedDb(), { paymentId: PAY_UNKNOWN }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("accepts PDF and WebP magic bytes", async () => {
    const pdf = await attach(seedDb(), {
      bytes: pdfBytes(),
      declaredMime: "application/pdf",
      declaredName: "receipt.pdf",
    });
    assert.match(String(pdf.db.payments[0].receipt_path), /\.pdf$/);

    const webpDb = seedDb();
    const webp = await attach(webpDb, {
      bytes: webpBytes(),
      declaredMime: "image/webp",
      declaredName: "receipt.webp",
    });
    assert.match(String(webp.db.payments[0].receipt_path), /\.webp$/);
  });
});

describe("loadOpenCheckout receipt projection", () => {
  it("R. returns hasReceipt only, never receipt_path", async () => {
    const storedPath = `${USER_A}/${PAY_A}/secret-receipt.jpg`;
    const db = seedDb();
    db.payments[0].receipt_path = storedPath;
    const { client } = createMockClient(db);
    const open = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: {
        BILLING_BANK_NAME: "Test Bank",
        BILLING_BANK_BENEFICIARY: "Waraqa Test",
        BILLING_BANK_IBAN: "SA0000000000000000000000",
      },
    });
    assert.equal(open?.hasReceipt, true);
    assert.equal(open && "receipt_path" in open, false);
    const serialized = JSON.stringify(open);
    assert.equal(serialized.includes("receipt_path"), false);
    assert.equal(serialized.includes(storedPath), false);
    assert.equal(serialized.includes("secret-receipt"), false);
  });

  it("hasReceipt is false when no receipt is stored", async () => {
    const { client } = createMockClient(seedDb());
    const open = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
    });
    assert.equal(open?.hasReceipt, false);
  });
});

describe("getAdminReceiptUrlOp", () => {
  it("S. admin signed URL allowed", async () => {
    const storedPath = `${USER_A}/${PAY_A}/abc.jpg`;
    const db = seedDb();
    db.payments[0].status = "submitted";
    db.payments[0].receipt_path = storedPath;
    const { client } = createMockClient(db);
    const mock = createMockStorage();
    const result = await getAdminReceiptUrlOp(
      client as never,
      { actorId: ADMIN, paymentId: PAY_A },
      mock.storage,
    );
    assert.equal(
      result.url,
      `https://signed.example/receipt?ttl=${RECEIPT_SIGNED_URL_TTL_SECONDS}`,
    );
    assert.equal(result.expiresIn, RECEIPT_SIGNED_URL_TTL_SECONDS);
    assert.equal("path" in result, false);
    assert.equal(result.url.includes(storedPath), false);
    assert.deepEqual(mock.signed, [
      { path: storedPath, expiresIn: RECEIPT_SIGNED_URL_TTL_SECONDS },
    ]);
  });

  it("T. teacher signed URL denied", async () => {
    const db = seedDb();
    db.payments[0].receipt_path = `${USER_A}/${PAY_A}/abc.jpg`;
    const { client } = createMockClient(db);
    const mock = createMockStorage();
    await assert.rejects(
      () =>
        getAdminReceiptUrlOp(client as never, { actorId: USER_A, paymentId: PAY_A }, mock.storage),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(mock.signed.length, 0);
  });

  it("unknown payment denied for admin", async () => {
    const { client } = createMockClient(seedDb());
    const mock = createMockStorage();
    await assert.rejects(
      () =>
        getAdminReceiptUrlOp(
          client as never,
          { actorId: ADMIN, paymentId: PAY_UNKNOWN },
          mock.storage,
        ),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });
});

describe("admin queue receipt flag", () => {
  it("projects hasReceipt without receipt_path", async () => {
    const db = seedDb();
    db.payments[0].status = "submitted";
    db.payments[0].transfer_reference = "WRQ-1";
    db.payments[0].receipt_path = `${USER_A}/${PAY_A}/hidden.jpg`;
    const { client } = createMockClient(db);
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hasReceipt, true);
    assert.equal("receipt_path" in rows[0], false);
    assert.equal(JSON.stringify(rows[0]).includes("hidden.jpg"), false);
  });
});

describe("receipt contracts", () => {
  it("V. no public URL or path exposure in functions/UI", () => {
    const functionsSrc = readFileSync(FUNCTIONS_FILE, "utf8");
    const opsSrc = readFileSync(OPERATIONS_FILE, "utf8");
    const adminSrc = readFileSync(PAYMENTS_ROUTE, "utf8");
    const subscriptionSrc = readFileSync(SUBSCRIPTION_ROUTE, "utf8");
    assert.doesNotMatch(functionsSrc, /getPublicUrl/);
    assert.doesNotMatch(opsSrc, /getPublicUrl/);
    assert.doesNotMatch(adminSrc, /getPublicUrl/);
    assert.doesNotMatch(adminSrc, /receipt_path/);
    assert.doesNotMatch(subscriptionSrc, /receipt_path/);
    assert.match(functionsSrc, /createSignedUrl|getAdminReceiptUrlOp/);
    assert.match(adminSrc, /عرض الإيصال/);
    assert.match(subscriptionSrc, /رفع إيصال التحويل/);
  });

  it("W. activateSubscription remains unchanged and does not require receipt", () => {
    const ops = readFileSync(OPERATIONS_FILE, "utf8");
    const fns = readFileSync(FUNCTIONS_FILE, "utf8");
    const activateOp = ops.slice(ops.indexOf("export async function activateSubscriptionOp"));
    const listStart = activateOp.indexOf("export async function listAdminSubmittedPaymentsOp");
    const activateBody = listStart >= 0 ? activateOp.slice(0, listStart) : activateOp;
    assert.equal(activateBody.includes("receipt_path"), false);
    assert.equal(activateBody.includes("hasReceipt"), false);
    assert.equal(activateBody.includes("attachPaymentReceipt"), false);
    const activateFn = fns.slice(fns.indexOf("export const activateSubscription = createServerFn"));
    const next = activateFn.indexOf("export const listAdminSubmittedPayments");
    const fnBody = next >= 0 ? activateFn.slice(0, next) : activateFn;
    assert.equal(fnBody.includes("receipt"), false);
    assert.match(fnBody, /activateSubscriptionOp/);
  });

  it("server function schemas reject storage path and foreign identity", () => {
    assert.throws(() =>
      getAdminReceiptUrlInputSchema.parse({
        paymentId: PAY_A,
        receipt_path: "x",
      }),
    );
    assert.throws(() =>
      attachPaymentReceiptInputSchema.parse({
        paymentId: PAY_A,
        contentBase64: "abc",
        status: "verified",
      }),
    );
  });
});
