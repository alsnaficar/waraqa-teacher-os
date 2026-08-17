import type { MadrasatiSyncResult } from "@/features/madrasati/sync/madrasati-sync.service";

export const MADRASATI_DRY_RUN_DISCLAIMER =
  "هذه معاينة تجريبية باستخدام بيانات اختبار، وليست مزامنة فعلية مع منصة مدرستي.";

export type MadrasatiDryRunPreviewResult = MadrasatiSyncResult & {
  isMockPreview: true;
  disclaimer: string;
};
