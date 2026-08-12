/**
 * Process-local concurrency + cooldown guard for curriculum PDF → Gemini
 * extraction (Phase 5.1 Hotfix #2.3.2).
 *
 * Topology assumption: single Node/PM2 fork. This state does NOT coordinate
 * across multiple processes/instances.
 *
 * Rejection precedence (checked before mutate):
 * 1. per-admin in-flight → admin_busy
 * 2. global capacity full → global_busy
 * 3. per-admin cooldown → cooldown
 * 4. acquire (updates in-flight, global count, lastStartAt)
 *
 * Cooldown / lastStartAt updates ONLY on accepted acquire.
 */

export const MAX_CONCURRENT_PDF_EXTRACTIONS_PER_ADMIN = 1;
export const MAX_GLOBAL_CONCURRENT_PDF_EXTRACTIONS = 3;
export const PDF_EXTRACTION_COOLDOWN_MS = 30_000;

export const CURRICULUM_PDF_ADMIN_BUSY_MESSAGE =
  "جاري استخراج ملف آخر. انتظر حتى ينتهي ثم حاول مرة أخرى.";

export const CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE =
  "جميع عمليات استخراج المناهج مشغولة حالياً. حاول مرة أخرى بعد قليل.";

export const CURRICULUM_PDF_COOLDOWN_MESSAGE =
  "تم تجاوز الحد المسموح لطلبات الاستخراج. حاول مرة أخرى لاحقاً.";

export type CurriculumPdfGuardReason = "admin_busy" | "global_busy" | "cooldown";

export type CurriculumPdfGuardAcquireResult =
  { ok: true; release: () => void } | { ok: false; reason: CurriculumPdfGuardReason };

const adminInFlight = new Set<string>();
const adminLastStartAt = new Map<string, number>();
let globalInFlight = 0;
let nowFn: () => number = () => Date.now();

export function curriculumPdfGuardReasonMessage(reason: CurriculumPdfGuardReason): string {
  switch (reason) {
    case "admin_busy":
      return CURRICULUM_PDF_ADMIN_BUSY_MESSAGE;
    case "global_busy":
      return CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE;
    case "cooldown":
      return CURRICULUM_PDF_COOLDOWN_MESSAGE;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/**
 * Synchronously acquire an extraction slot for the JWT-derived admin userId.
 * Rejected acquires do not mutate in-flight or cooldown state.
 */
export function acquireCurriculumPdfExtraction(userId: string): CurriculumPdfGuardAcquireResult {
  if (!userId) {
    return { ok: false, reason: "admin_busy" };
  }

  if (adminInFlight.has(userId)) {
    return { ok: false, reason: "admin_busy" };
  }

  if (globalInFlight >= MAX_GLOBAL_CONCURRENT_PDF_EXTRACTIONS) {
    return { ok: false, reason: "global_busy" };
  }

  const lastStart = adminLastStartAt.get(userId);
  const now = nowFn();
  if (lastStart != null && now - lastStart < PDF_EXTRACTION_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }

  // Atomic within the synchronous event-loop turn.
  adminInFlight.add(userId);
  globalInFlight += 1;
  adminLastStartAt.set(userId, now);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    adminInFlight.delete(userId);
    globalInFlight = Math.max(0, globalInFlight - 1);
  };

  return { ok: true, release };
}

/** Test-only: clear process-local guard state and restore the clock. */
export function resetCurriculumPdfExtractionGuardForTests(): void {
  adminInFlight.clear();
  adminLastStartAt.clear();
  globalInFlight = 0;
  nowFn = () => Date.now();
}

/** Test-only: override Date.now for deterministic cooldown tests. */
export function setCurriculumPdfGuardNowForTests(fn: () => number): void {
  nowFn = fn;
}

/** Test-only introspection helpers (do not expose via server endpoints). */
export function getCurriculumPdfGuardSnapshotForTests(): {
  globalInFlight: number;
  adminInFlight: string[];
  lastStartAt: Record<string, number>;
} {
  return {
    globalInFlight,
    adminInFlight: [...adminInFlight],
    lastStartAt: Object.fromEntries(adminLastStartAt),
  };
}
