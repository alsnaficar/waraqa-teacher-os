import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publishTarget: string;
  setPublishTarget: (target: string) => void;
  onConfirm: () => void;
}

export function PublishModal({
  open,
  onOpenChange,
  publishTarget,
  setPublishTarget,
  onConfirm,
}: PublishModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>نشر الخطة الأسبوعية</DialogTitle>
        </DialogHeader>
        <RadioGroup
          value={publishTarget}
          onValueChange={setPublishTarget}
          className="space-y-2 mt-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id="publish-madrasati" value="madrasati" />
            <Label htmlFor="publish-madrasati">منصة مدرستي</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="publish-pdf" value="pdf" />
            <Label htmlFor="publish-pdf">ملف PDF لأولياء الأمور</Label>
          </div>
        </RadioGroup>
        <DialogFooter className="gap-2 sm:justify-start mt-4">
          <Button onClick={onConfirm}>تأكيد النشر</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
