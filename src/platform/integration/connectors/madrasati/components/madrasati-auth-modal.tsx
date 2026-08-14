import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Info, Loader2, School } from "lucide-react";
import { toast } from "sonner";
import { MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE } from "@/platform/integration/connectors/madrasati/madrasati-status";
import {
  MADRASATI_DRY_RUN_DISCLAIMER,
  previewMadrasatiSync,
  type MadrasatiDryRunPreviewResult,
} from "@/platform/integration/connectors/madrasati/madrasati.functions";

interface MadrasatiAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept for call-site compatibility; never invoked (no real sync runs). */
  onSyncSuccess?: () => Promise<void>;
}

/**
 * Madrasati status + mock dry-run preview dialog.
 * Never collects credentials and never claims a live Madrasati connection.
 */
export function MadrasatiAuthModal({ open, onOpenChange }: MadrasatiAuthModalProps) {
  const previewFn = useServerFn(previewMadrasatiSync);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MadrasatiDryRunPreviewResult | null>(null);

  async function handlePreview() {
    setLoading(true);
    try {
      const result = await previewFn();
      setPreview(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تنفيذ معاينة مزامنة مدرستي.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPreview(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-md max-h-[90vh] overflow-y-auto p-6 rounded-2xl border-primary/10 shadow-xl"
      >
        <DialogHeader className="text-right pb-4 border-b border-muted">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center dark:bg-amber-950/30 dark:text-amber-400">
              <School className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-foreground">
                مزامنة منصة مدرستي
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-medium">
                الحالة الحالية ومعاينة تجريبية فقط
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 flex gap-2.5 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs leading-relaxed font-medium">
              <p className="font-bold">{MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE}</p>
              <p>{MADRASATI_DRY_RUN_DISCLAIMER}</p>
              <p className="text-amber-800/90 dark:text-amber-400/90">
                لا نطلب بيانات دخول مدرستي داخل ورقاء. لا يوجد ربط نشط بمنصة مدرستي حالياً.
              </p>
            </div>
          </div>

          <Button
            type="button"
            className="w-full h-11 font-bold text-sm gap-2"
            disabled={loading}
            onClick={() => void handlePreview()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            معاينة مزامنة مدرستي
          </Button>

          {preview ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 text-xs dark:bg-slate-900/40 dark:border-slate-800">
              <p className="font-bold text-amber-800 dark:text-amber-300">{preview.disclaimer}</p>
              <p className="text-muted-foreground">
                dryRun={String(preview.dryRun)} · mock={String(preview.isMockPreview)} · اكتشف{" "}
                {preview.counts.discovered} · مقبول {preview.timetable.accepted.length} · مرفوض{" "}
                {preview.counts.rejected}
              </p>
              {preview.teacher ? (
                <p>
                  <span className="font-bold">المعلم (اختبار):</span> {preview.teacher.displayName}
                </p>
              ) : null}
              <p>
                <span className="font-bold">المواد:</span>{" "}
                {preview.subjects.map((s) => s.name).join("، ") || "—"}
              </p>
              <p>
                <span className="font-bold">الفصول:</span>{" "}
                {preview.classes.map((c) => `${c.grade} / ${c.className}`).join("، ") || "—"}
              </p>
              <div>
                <p className="font-bold mb-1">حصص المعاينة:</p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {preview.timetable.accepted.map((row) => (
                    <li
                      key={`${row.dayOfWeek}-${row.period}-${row.className}-${row.subject}`}
                      className="rounded-lg border bg-white px-2 py-1.5 dark:bg-slate-950/40"
                    >
                      يوم {row.dayOfWeek + 1} · حصة {row.period} · {row.subject} · {row.grade} /{" "}
                      {row.className}
                    </li>
                  ))}
                </ul>
              </div>
              {preview.warnings.length > 0 ? (
                <p className="text-muted-foreground">تحذيرات: {preview.warnings.length}</p>
              ) : null}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 font-bold text-sm"
            onClick={() => onOpenChange(false)}
          >
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
