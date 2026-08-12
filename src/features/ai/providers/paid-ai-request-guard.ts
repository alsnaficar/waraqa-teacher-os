/**
 * Process-local concurrency + cooldown guard for paid teacher AI → Gemini
 * (Phase 5.2 Hotfix #2.6).
 *
 * Topology assumption: single Node/PM2 fork. This state does NOT coordinate
 * across multiple processes/instances.
 *
 * Independent from curriculum-pdf-guard.ts — PDF extraction must not share
 * counters or cooldowns with paid teacher AI.
 *
 * Rejection precedence (checked before mutate):
 * 1. per-user in-flight → user_busy
 * 2. global capacity full → global_busy
 * 3. per-user cooldown → cooldown
 * 4. acquire (updates in-flight, global count, lastStartAt)
 *
 * Cooldown / lastStartAt updates ONLY on accepted acquire.
 * Release clears in-flight only — lastStartAt is preserved.
 */

export const MAX_CONCURRENT_PAID_AI_PER_USER = 1;
export const MAX_GLOBAL_CONCURRENT_PAID_AI = 10;
export const PAID_AI_COOLDOWN_MS = 5_000;

export const PAID_AI_USER_BUSY_MESSAGE =
  "جاري إنشاء طلب ذكاء اصطناعي آخر. انتظر حتى يكتمل ثم حاول مرة أخرى.";

export const PAID_AI_GLOBAL_BUSY_MESSAGE = "الخدمة مشغولة حالياً. حاول مرة أخرى بعد قليل.";

export const PAID_AI_COOLDOWN_MESSAGE =
  "تم تنفيذ طلب ذكاء اصطناعي مؤخراً. انتظر قليلاً ثم حاول مرة أخرى.";

export type PaidAiGuardReason = "user_busy" | "global_busy" | "cooldown";

export type PaidAiGuardAcquireResult =
  { ok: true; release: () => void } | { ok: false; reason: PaidAiGuardReason };

const userInFlight = new Set<string>();
const userLastStartAt = new Map<string, number>();
let globalInFlight = 0;
let nowFn: () => number = () => Date.now();

export function paidAiGuardReasonMessage(reason: PaidAiGuardReason): string {
  switch (reason) {
    case "user_busy":
      return PAID_AI_USER_BUSY_MESSAGE;
    case "global_busy":
      return PAID_AI_GLOBAL_BUSY_MESSAGE;
    case "cooldown":
      return PAID_AI_COOLDOWN_MESSAGE;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/**
 * Synchronously acquire a paid AI slot for the JWT-derived teacher userId.
 * Rejected acquires do not mutate in-flight or cooldown state.
 */
export function acquirePaidAiRequest(userId: string): PaidAiGuardAcquireResult {
  if (!userId) {
    return { ok: false, reason: "user_busy" };
  }

  if (userInFlight.has(userId)) {
    return { ok: false, reason: "user_busy" };
  }

  if (globalInFlight >= MAX_GLOBAL_CONCURRENT_PAID_AI) {
    return { ok: false, reason: "global_busy" };
  }

  const lastStart = userLastStartAt.get(userId);
  const now = nowFn();
  if (lastStart != null && now - lastStart < PAID_AI_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }

  // Atomic within the synchronous event-loop turn.
  userInFlight.add(userId);
  globalInFlight += 1;
  userLastStartAt.set(userId, now);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    userInFlight.delete(userId);
    globalInFlight = Math.max(0, globalInFlight - 1);
  };

  return { ok: true, release };
}

/** Test-only: clear process-local guard state and restore the clock. */
export function resetPaidAiRequestGuardForTests(): void {
  userInFlight.clear();
  userLastStartAt.clear();
  globalInFlight = 0;
  nowFn = () => Date.now();
}

/** Test-only: override Date.now for deterministic cooldown tests. */
export function setPaidAiGuardNowForTests(fn: () => number): void {
  nowFn = fn;
}

/** Test-only introspection helpers (do not expose via server endpoints). */
export function getPaidAiGuardSnapshotForTests(): {
  globalInFlight: number;
  userInFlight: string[];
  lastStartAt: Record<string, number>;
} {
  return {
    globalInFlight,
    userInFlight: [...userInFlight],
    lastStartAt: Object.fromEntries(userLastStartAt),
  };
}
