import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

export const DELETE_PREPARATION_DIALOG_TITLE = "حذف التحضير؟";

export const DELETE_PREPARATION_DIALOG_DESCRIPTION =
  "سيتم حذف التحضير الحالي فقط. ستعود الحصة إلى حالة «مجدولة». لن يتم حذف الحصة من الجدول. لن يتم حذف المنهج. لن يتم حذف الواجب المرتبط بالحصة. سجل التحضير السابق بالذكاء الاصطناعي محفوظ.";

export const DELETE_PREPARATION_CONFIRM_LABEL = "حذف التحضير";

export const DELETE_PREPARATION_CANCEL_LABEL = "إلغاء";

export const DELETE_PREPARATION_SUCCESS_TOAST =
  "تم حذف التحضير وإعادة الحصة إلى الحالة المجدولة.";

export interface DeletePreparationDialogProps {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Caller performs resetPreparation — this dialog never touches the database. */
  onConfirm: () => void;
}

export function DeletePreparationDialog({
  open,
  pending = false,
  onOpenChange,
  onConfirm,
}: DeletePreparationDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{DELETE_PREPARATION_DIALOG_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{DELETE_PREPARATION_DIALOG_DESCRIPTION}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            className="min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "جاري الحذف…" : DELETE_PREPARATION_CONFIRM_LABEL}
          </AlertDialogAction>
          <AlertDialogCancel className="min-h-11 w-full" disabled={pending}>
            {DELETE_PREPARATION_CANCEL_LABEL}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
