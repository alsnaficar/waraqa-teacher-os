/**
 * In-memory stand-in for public.try_insert_coupon_redemption.
 * Mirrors SQL: coupon lock → payment ownership → same-payment exists →
 * per-user quota → insert.
 */

export type CouponRedemptionRpcResult = "inserted" | "existing" | "per_user_exhausted";

type Row = Record<string, unknown>;

const couponLocks = new Map<string, Promise<unknown>>();

async function withCouponLock<T>(couponId: string, fn: () => Promise<T>): Promise<T> {
  const previous = couponLocks.get(couponId) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  couponLocks.set(
    couponId,
    previous.then(
      () => held,
      () => held,
    ),
  );
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export type TryInsertCouponRedemptionArgs = {
  p_coupon_id: string;
  p_user_id: string;
  p_payment_id: string;
};

export async function mockTryInsertCouponRedemption(
  db: Record<string, Row[]>,
  args: TryInsertCouponRedemptionArgs,
  options: { failRedemptionInsert?: boolean; nextId?: () => string } = {},
): Promise<{ data: CouponRedemptionRpcResult | null; error: { message: string } | null }> {
  const couponId = args.p_coupon_id;
  const userId = args.p_user_id;
  const paymentId = args.p_payment_id;

  if (!couponId || !userId || !paymentId) {
    return { data: null, error: { message: "INVALID_COUPON_REDEMPTION_ARGS" } };
  }

  return withCouponLock(couponId, async () => {
    if (options.failRedemptionInsert) {
      return { data: null, error: { message: "insert failed" } };
    }

    const coupon = (db.coupons ?? []).find((row) => row.id === couponId);
    if (!coupon) {
      return { data: null, error: { message: "COUPON_NOT_FOUND" } };
    }

    const paymentOwned = (db.payments ?? []).some(
      (row) => row.id === paymentId && row.user_id === userId,
    );
    if (!paymentOwned) {
      return { data: null, error: { message: "PAYMENT_OWNER_MISMATCH" } };
    }

    const redemptions = db.coupon_redemptions ?? [];
    if (redemptions.some((row) => row.coupon_id === couponId && row.payment_id === paymentId)) {
      return { data: "existing", error: null };
    }

    const rawLimit = coupon.max_redemptions_per_user;
    const limit = rawLimit == null ? 1 : Number(rawLimit);

    if (limit > 0) {
      const count = redemptions.filter(
        (row) => row.coupon_id === couponId && row.user_id === userId,
      ).length;
      if (count >= limit) {
        return { data: "per_user_exhausted", error: null };
      }
    }

    const saved = {
      id: options.nextId?.() ?? `id-coupon_redemptions-${Date.now()}-${Math.random()}`,
      created_at: "2026-08-11T00:00:00Z",
      coupon_id: couponId,
      user_id: userId,
      payment_id: paymentId,
    };
    db.coupon_redemptions = [...redemptions, saved];
    return { data: "inserted", error: null };
  });
}

type RpcClient = {
  rpc: (
    name: string,
    args: TryInsertCouponRedemptionArgs,
  ) => Promise<{ data: CouponRedemptionRpcResult | null; error: { message: string } | null }>;
};

export function attachTryInsertCouponRedemptionRpc(
  client: object,
  db: Record<string, Row[]>,
  options: { failRedemptionInsert?: boolean; nextId?: () => string } = {},
): void {
  (client as RpcClient).rpc = async (name, args) => {
    if (name !== "try_insert_coupon_redemption") {
      return { data: null, error: { message: `unknown rpc: ${name}` } };
    }
    return mockTryInsertCouponRedemption(db, args, options);
  };
}
