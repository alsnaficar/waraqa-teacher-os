import { FileCheck2, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/shared/components/empty-state";
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
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/utils/utils";

import { useTestSubmissions } from "../hooks/useTestSubmissions";
import type { TestStatus } from "../services/test.service";
import type { TestSubmission } from "../services/test-submission.service";
import {
  canAssignTestSubmissions,
  filterAssignableStudents,
  TEST_SUBMISSIONS_EMPTY_DESCRIPTION,
  TEST_SUBMISSIONS_EMPTY_TITLE,
  TEST_SUBMISSIONS_ERROR_TITLE,
  TEST_SUBMISSIONS_HINT,
  toggleStudentSelection,
  toTestSubmissionListItemView,
} from "../services/tests-submissions-ui.logic";
import { TestAnswerEntryDialog } from "./test-answer-entry-dialog";
import { TestFeedbackDialog } from "./test-feedback-dialog";

const ALL_CLASSES = "all";

export function TestSubmissionsPanel({
  testId,
  testTitle,
  testStatus,
}: {
  testId: string;
  testTitle: string;
  testStatus: TestStatus;
}) {
  const {
    submissions,
    students,
    classes,
    questions,
    questionsLoading,
    loading,
    error,
    refresh,
    assignPending,
    remove,
    gradeSubmission,
    saveAnswersAndSubmit,
    saveAnswersSubmitAndGrade,
    setFeedback,
  } = useTestSubmissions(testId);

  const canAssign = canAssignTestSubmissions(testStatus);
  const [assignOpen, setAssignOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>(ALL_CLASSES);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<TestSubmission | null>(null);
  const [answerTarget, setAnswerTarget] = useState<TestSubmission | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<TestSubmission | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);

  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );

  const assignable = useMemo(
    () =>
      filterAssignableStudents(students, {
        search,
        classId: classFilter,
        submissions,
      }),
    [students, search, classFilter, submissions],
  );

  const views = submissions.map((row) =>
    toTestSubmissionListItemView(row, studentById.get(row.studentId), testStatus),
  );

  const answerBusy =
    saveAnswersAndSubmit.isPending || saveAnswersSubmitAndGrade.isPending;

  function openAssign() {
    setSearch("");
    setClassFilter(ALL_CLASSES);
    setSelectedIds([]);
    setAssignOpen(true);
  }

  async function handleAssign() {
    if (selectedIds.length === 0) {
      toast.error("اختر طالباً واحداً على الأقل.");
      return;
    }

    setAssigning(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const studentId of selectedIds) {
        try {
          await assignPending.mutateAsync(studentId);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0) {
        toast.success(`تم إسناد الاختبار إلى ${ok} طالب.`);
      }
      if (failed > 0) {
        toast.error(`تعذر إسناد ${failed} طالب (قد يكون مسنداً مسبقاً).`);
      }
      setAssignOpen(false);
      setSelectedIds([]);
    } finally {
      setAssigning(false);
    }
  }

  async function handleAutoGrade(submission: TestSubmission) {
    setGradingId(submission.id);
    try {
      await gradeSubmission.mutateAsync(submission.id);
      toast.success("تم التصحيح التلقائي.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر التصحيح التلقائي.");
    } finally {
      setGradingId(null);
    }
  }

  return (
    <div className="min-w-0 space-y-4 border-t pt-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-bold">التسليمات</h3>
          <p className="text-xs text-muted-foreground truncate">{testTitle}</p>
          <p className="text-[11px] text-muted-foreground">{TEST_SUBMISSIONS_HINT}</p>
        </div>
        {canAssign ? (
          <Button type="button" className="min-h-11 gap-1" onClick={openAssign}>
            <UserPlus className="h-4 w-4" />
            إسناد للطلاب
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {testStatus === "closed" ? "عرض فقط — الاختبار مغلق." : "الإسناد غير متاح."}
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={FileCheck2}
          title={TEST_SUBMISSIONS_ERROR_TITLE}
          description={error instanceof Error ? error.message : "حدث خطأ غير متوقع."}
          action={
            <Button className="min-h-11" onClick={() => void refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : views.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={TEST_SUBMISSIONS_EMPTY_TITLE}
          description={TEST_SUBMISSIONS_EMPTY_DESCRIPTION}
          action={
            canAssign ? (
              <Button className="min-h-11 gap-1" onClick={openAssign}>
                <UserPlus className="h-4 w-4" />
                إسناد للطلاب
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden min-w-0 overflow-x-auto rounded-xl border md:block">
            <table className="w-full min-w-0 text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-start font-medium">الطالب</th>
                  <th className="px-3 py-3 text-start font-medium">الرقم</th>
                  <th className="px-3 py-3 text-start font-medium">الحالة</th>
                  <th className="px-3 py-3 text-start font-medium">الدرجة</th>
                  <th className="px-3 py-3 text-start font-medium">الملاحظات</th>
                  <th className="px-3 py-3 text-start font-medium">تاريخ التسليم</th>
                  <th className="px-3 py-3 text-start font-medium">تاريخ التصحيح</th>
                  <th className="px-3 py-3 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission, index) => {
                  const view = views[index]!;
                  return (
                    <tr key={submission.id} className="border-t">
                      <td className="px-3 py-3 font-medium">{view.studentName}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {view.studentCodeLabel}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{view.statusLabel}</Badge>
                      </td>
                      <td className="px-3 py-3">{view.scoreLabel}</td>
                      <td className="max-w-[10rem] truncate px-3 py-3">{view.feedbackLabel}</td>
                      <td className="px-3 py-3">{view.submittedAtLabel}</td>
                      <td className="px-3 py-3">{view.gradedAtLabel}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {view.canEnterAnswers || view.status !== "pending" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => setAnswerTarget(submission)}
                            >
                              {view.answerEntryActionLabel}
                            </Button>
                          ) : null}
                          {view.canAutoGrade ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              disabled={gradingId === submission.id || gradeSubmission.isPending}
                              onClick={() => void handleAutoGrade(submission)}
                            >
                              {gradingId === submission.id
                                ? "جاري التصحيح…"
                                : view.autoGradeActionLabel}
                            </Button>
                          ) : null}
                          {view.canEditFeedback ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => setFeedbackTarget(submission)}
                            >
                              {view.feedbackActionLabel}
                            </Button>
                          ) : null}
                          {canAssign ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11 text-destructive"
                              onClick={() => setDeleteTarget(submission)}
                            >
                              حذف
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {submissions.map((submission, index) => {
              const view = views[index]!;
              return (
                <Card key={submission.id} className="min-w-0 overflow-hidden">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <h4 className="truncate text-base font-bold">{view.studentName}</h4>
                        <p className="text-xs text-muted-foreground">{view.studentCodeLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          التسليم: {view.submittedAtLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          التصحيح: {view.gradedAtLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          الدرجة: {view.scoreLabel}
                          {view.feedbackLabel !== "—"
                            ? ` · ملاحظات: ${view.feedbackLabel}`
                            : ""}
                        </p>
                      </div>
                      <Badge variant="outline">{view.statusLabel}</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      {view.canEnterAnswers || view.status !== "pending" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 w-full"
                          onClick={() => setAnswerTarget(submission)}
                        >
                          {view.answerEntryActionLabel}
                        </Button>
                      ) : null}
                      {view.canAutoGrade ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 w-full"
                          disabled={gradingId === submission.id || gradeSubmission.isPending}
                          onClick={() => void handleAutoGrade(submission)}
                        >
                          {gradingId === submission.id
                            ? "جاري التصحيح…"
                            : view.autoGradeActionLabel}
                        </Button>
                      ) : null}
                      {view.canEditFeedback ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 w-full"
                          onClick={() => setFeedbackTarget(submission)}
                        >
                          {view.feedbackActionLabel}
                        </Button>
                      ) : null}
                      {canAssign ? (
                        <Button
                          type="button"
                          variant="outline"
                          className={cn("min-h-11 w-full gap-1 text-destructive")}
                          onClick={() => setDeleteTarget(submission)}
                        >
                          <Trash2 className="h-4 w-4" />
                          حذف
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>إسناد الاختبار للطلاب</DialogTitle>
            <DialogDescription>
              يظهر الطلاب النشطون غير المسندين فقط. الإسناد ينشئ تسليماً بحالة «لم يبدأ» فقط.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-search">بحث</Label>
              <Input
                id="assign-search"
                className="min-h-11"
                placeholder="الاسم أو الرمز…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>الفصل</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="كل الفصول" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>كل الفصول</SelectItem>
                  {classes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              المحدد: {selectedIds.length} · المتاح: {assignable.length}
            </p>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-2">
              {assignable.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  لا يوجد طلاب مطابقون للإسناد.
                </p>
              ) : (
                assignable.map((student) => {
                  const checked = selectedIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setSelectedIds((current) =>
                            toggleStudentSelection(current, student.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {student.fullName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {student.studentCode?.trim() || "بدون رمز"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="min-h-11 w-full"
              disabled={assigning || selectedIds.length === 0}
              onClick={() => void handleAssign()}
            >
              {assigning ? "جاري الإسناد…" : `إسناد (${selectedIds.length})`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={assigning}
              onClick={() => setAssignOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TestAnswerEntryDialog
        open={Boolean(answerTarget)}
        submission={answerTarget}
        studentName={
          answerTarget
            ? studentById.get(answerTarget.studentId)?.fullName ?? "طالب غير معروف"
            : ""
        }
        questions={questions}
        questionsLoading={questionsLoading}
        busy={answerBusy}
        onOpenChange={(open) => {
          if (!open) setAnswerTarget(null);
        }}
        onSaveAndSubmit={async (draft) => {
          if (!answerTarget) return;
          await saveAnswersAndSubmit.mutateAsync({
            submissionId: answerTarget.id,
            draft,
          });
        }}
        onSaveSubmitAndGrade={async (draft) => {
          if (!answerTarget) return;
          await saveAnswersSubmitAndGrade.mutateAsync({
            submissionId: answerTarget.id,
            draft,
          });
        }}
      />

      <TestFeedbackDialog
        open={Boolean(feedbackTarget)}
        submission={
          feedbackTarget
            ? (submissions.find((row) => row.id === feedbackTarget.id) ?? feedbackTarget)
            : null
        }
        studentName={
          feedbackTarget
            ? studentById.get(feedbackTarget.studentId)?.fullName ?? "طالب غير معروف"
            : ""
        }
        testTitle={testTitle}
        busy={setFeedback.isPending}
        onOpenChange={(open) => {
          if (!open) setFeedbackTarget(null);
        }}
        onSubmit={async (feedback) => {
          if (!feedbackTarget) return;
          await setFeedback.mutateAsync({
            submissionId: feedbackTarget.id,
            feedback,
          });
        }}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف سجل التسليم؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف سجل الإسناد فقط. يمكنك إعادة الإسناد لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget) return;
                void remove.mutateAsync(deleteTarget.id).then(
                  () => {
                    toast.success("تم حذف سجل التسليم.");
                    setDeleteTarget(null);
                  },
                  (err) => {
                    toast.error(err instanceof Error ? err.message : "تعذر حذف التسليم.");
                  },
                );
              }}
            >
              {remove.isPending ? "جاري الحذف…" : "تأكيد الحذف"}
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-11 w-full" disabled={remove.isPending}>
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
