import { APPROVED_FEATURE_KEYS, type FeatureKey } from "./entitlement.logic";

export type EntitlementMockSubscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  starts_on: string;
  ends_on: string;
  starts_at?: string | null;
  expires_at?: string | null;
  activated_at?: string | null;
  product: string;
  created_at: string | null;
  billing_academic_year_id?: string | null;
  billing_semester_id?: string | null;
  academic_year_id?: string | null;
  semester_id?: string | null;
};

export type EntitlementMockTables = {
  subscriptions: EntitlementMockSubscription[];
  plans: Array<{
    id: string;
    is_active: boolean;
    code?: string;
    name?: string;
    price?: number;
    starts_with?: string;
  }>;
  plan_entitlements: Array<{ plan_id: string; feature_key: string }>;
  billing_audit_log?: Array<Record<string, unknown>>;
};

export const ENTITLEMENT_TEST_TODAY = "2026-08-11";
export const ENTITLEMENT_TEST_PLAN_ID = "11111111-1111-4111-8111-111111111111";
export const ENTITLEMENT_TEST_SUB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export function allowEntitlementTables(
  userId: string,
  options: {
    featureKeys?: readonly FeatureKey[];
    subscriptionId?: string;
    planId?: string;
    startsOn?: string;
    endsOn?: string;
    status?: string;
    product?: string;
    planActive?: boolean;
    activatedAt?: string | null;
  } = {},
): EntitlementMockTables {
  const planId = options.planId ?? ENTITLEMENT_TEST_PLAN_ID;
  const featureKeys = options.featureKeys ?? APPROVED_FEATURE_KEYS;
  const startsOn = options.startsOn ?? "2026-08-01";
  const endsOn = options.endsOn ?? "2027-06-24";
  return {
    subscriptions: [
      {
        id: options.subscriptionId ?? ENTITLEMENT_TEST_SUB_ID,
        user_id: userId,
        plan_id: planId,
        status: options.status ?? "active",
        starts_on: startsOn,
        ends_on: endsOn,
        starts_at: startsOn,
        expires_at: endsOn,
        activated_at:
          options.activatedAt ??
          (options.status === "scheduled" ? null : "2026-08-01T00:00:00.000Z"),
        product: options.product ?? "core",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
    plans: [
      {
        id: planId,
        is_active: options.planActive ?? true,
        code: "core_standard_semester",
        name: "فصل دراسي",
        price: 40,
        starts_with: "semester",
      },
    ],
    plan_entitlements: featureKeys.map((feature_key) => ({
      plan_id: planId,
      feature_key,
    })),
    billing_audit_log: [],
  };
}

export function emptyEntitlementTables(): EntitlementMockTables {
  return { subscriptions: [], plans: [], plan_entitlements: [], billing_audit_log: [] };
}

type Filter = { column: string; op: "eq" | "lte" | "gte"; value: unknown };

function rowMatches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (actual == null) return false;
    const left = String(actual);
    const right = String(filter.value);
    if (filter.op === "lte") return left <= right;
    if (filter.op === "gte") return left >= right;
    return true;
  });
}

/**
 * Minimal thenable/maybeSingle chain for subscriptions, plans, plan_entitlements,
 * and billing_audit_log. Supports CAS-style update + lte/gte.
 */
export function createEntitlementTableHandler(tables: EntitlementMockTables) {
  return function billingFrom(table: string): Record<string, unknown> | null {
    if (
      table !== "subscriptions" &&
      table !== "plans" &&
      table !== "plan_entitlements" &&
      table !== "billing_audit_log"
    ) {
      return null;
    }

    const filters: Filter[] = [];
    let pendingUpdate: Record<string, unknown> | null = null;
    let pendingInsert: Record<string, unknown>[] | null = null;
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN = Number.POSITIVE_INFINITY;

    const sourceRows = (): Record<string, unknown>[] => {
      if (table === "subscriptions")
        return tables.subscriptions as unknown as Record<string, unknown>[];
      if (table === "plans") return tables.plans as unknown as Record<string, unknown>[];
      if (table === "plan_entitlements") {
        return tables.plan_entitlements as unknown as Record<string, unknown>[];
      }
      return (tables.billing_audit_log ??= []) as Record<string, unknown>[];
    };

    const rowsFor = (): Record<string, unknown>[] => {
      let rows = sourceRows().filter((row) => rowMatches(row, filters));
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
      if (pendingInsert) {
        const bucket = table === "billing_audit_log" ? (tables.billing_audit_log ??= []) : null;
        if (bucket) {
          bucket.push(...pendingInsert);
        }
        const data = mode === "many" ? pendingInsert : (pendingInsert[0] ?? null);
        return { data, error: null };
      }

      if (pendingUpdate) {
        const matched = sourceRows().filter((row) => rowMatches(row, filters));
        for (const row of matched) {
          Object.assign(row, pendingUpdate);
        }
        return { data: mode === "many" ? matched : (matched[0] ?? null), error: null };
      }

      const rows = rowsFor();
      if (mode === "many") return { data: rows, error: null };
      return { data: rows[0] ?? null, error: null };
    };

    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      insert(row: Record<string, unknown> | Record<string, unknown>[]) {
        pendingInsert = Array.isArray(row) ? row : [row];
        return api;
      },
      update(row: Record<string, unknown>) {
        pendingUpdate = row;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, op: "eq", value });
        return api;
      },
      lte(column: string, value: unknown) {
        filters.push({ column, op: "lte", value });
        return api;
      },
      gte(column: string, value: unknown) {
        filters.push({ column, op: "gte", value });
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
  };
}
