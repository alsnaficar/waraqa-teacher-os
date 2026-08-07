import { useRef } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

interface SemesterPlanPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  includeSchoolLogo: boolean;
  onIncludeSchoolLogoChange: (value: boolean) => void;
  schoolLogoUrl: string | null;
  onSchoolLogoUrlChange: (value: string | null) => void;
  includeQr: boolean;
  onIncludeQrChange: (value: boolean) => void;
  onPrint: () => void;
}

export function SemesterPlanPrintDialog({
  open,
  onOpenChange,
  includeSchoolLogo,
  onIncludeSchoolLogoChange,
  schoolLogoUrl,
  onSchoolLogoUrlChange,
  includeQr,
  onIncludeQrChange,
  onPrint,
}: SemesterPlanPrintDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,480px)]">
        <DialogHeader>
          <DialogTitle>طباعة خطة الفصل</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="rounded-xl border border-border bg-muted/40 p-3">
            شعار وزارة التعليم يظهر دائماً في أعلى المستند المطبوع.
          </p>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={includeSchoolLogo}
              onChange={(event) => {
                onIncludeSchoolLogoChange(event.target.checked);
                if (!event.target.checked) {
                  onSchoolLogoUrlChange(null);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
            <span>إظهار شعار المدرسة</span>
          </label>

          {includeSchoolLogo ? (
            <div className="space-y-2">
              <Label htmlFor="school-logo-file">رفع شعار المدرسة (اختياري)</Label>
              <Input
                id="school-logo-file"
                ref={fileRef}
                type="file"
                accept="image/*"
                className="h-11"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    onSchoolLogoUrlChange(null);
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => onSchoolLogoUrlChange(String(reader.result || ""));
                  reader.readAsDataURL(file);
                }}
              />
              {schoolLogoUrl ? (
                <img
                  src={schoolLogoUrl}
                  alt="معاينة شعار المدرسة"
                  className="h-16 w-16 rounded-md border border-border object-contain"
                />
              ) : null}
            </div>
          ) : null}

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={includeQr}
              onChange={(event) => onIncludeQrChange(event.target.checked)}
            />
            <span>إظهار رمز QR (اختياري)</span>
          </label>
        </div>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button className="h-11 w-full sm:w-auto" onClick={onPrint}>
            <Printer className="ml-2 h-4 w-4" />
            طباعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
