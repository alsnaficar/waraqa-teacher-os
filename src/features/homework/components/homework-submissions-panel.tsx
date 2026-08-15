import { FileCheck2, Plus, Trash2, Users } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/utils/utils";

import { useHomeworkSubmissions } from "../hooks/useHomeworkSubmissions";
import type { HomeworkSubmission } from "../services/homework-submission.service";
import {
  canOpenGradingDialog,
  gradingActionLabel,
  studentsWithoutSubmission,
  SUBMISSION_STATUS_HINT,
  SUBMISSIONS_EMPTY_DESCRIPTION,
  SUBMISSIONS_EMPTY_TITLE,
  SUBMISSIONS_ERROR_TITLE,
  toSubmissionListItemView,
} from "../services/students-ui.logic";
import { HomeworkBulkAssignDialog } from "./homework-bulk-assign-dialog";
import { HomeworkGradeDialog } from "./homework-grade-dialog";

export function HomeworkSubmissionsPanel({
  homeworkId,
  homeworkTitle,
  maxScore = null,
}: {
  homeworkId: string;
  homeworkTitle: string;
  /** Optional full score when homework defines one later; schema has no max_score yet. */
  maxScore?: number | null;
}) {
  const {
    submissions,
    students,
    classes,
    grades,
    loading,
    error,
    refresh,
    createPending,
    assignToClass,
    markSubmitted,
    grade,
    remove,
  } = useHomeworkSubmissions(homeworkId);

  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<HomeworkSubmission | null>(null);
  const [gradeTarget, setGradeTarget] = useState<HomeworkSubmission | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );
  const availableStudents = useMemo(
    () => studentsWithoutSubmission(students, submissions),
    [students, submissions],
  );
  const views = submissions.map((row) =>
    toSubmissionListItemView(row, studentById.get(row.studentId), { maxScore }),
  );

  async function handleCreatePending() {
    if (!selectedStudentId) {
      toast.error("اختر طالباً أولاً.");
      return;
    }
    try {
      await createPending.mutateAsync(selectedStudentId);
      setSelectedStudentId("");
      toast.success("تم إنشاء سجل تسليم (لم يسلّم).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء التسليم.");
    }
  }

  return (
    <div className="min-w-0 space-y-4 border-t pt-4" dir="rtl">
      <div className="space-y-1">
        <h3 className="text-base font-bold">تسليمات: {homeworkTitle}</h3>
        <p className="text-[11px] text-muted-foreground">{SUBMISSION_STATUS_HINT}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={selectedStudentId || undefined}
          onValueChange={setSelectedStudentId}
          disabled={availableStudents.length === 0}
        >
          <SelectTrigger className="min-h-11 min-w-0 flex-1 basis-full sm:basis-64">
            <SelectValue placeholder="اختر طالباً لإضافة تسليم…" />
          </SelectTrigger>
          <SelectContent>
            {availableStudents.map((student) => (
              <SelectItem key={student.id} value={student.id}>
                {student.fullName}
                {student.studentCode ? ` (${student.studentCode})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          className="min-h-11 gap-1"
          disabled={!selectedStudentId || createPending.isPending}
          onClick={() => void handleCreatePending()}
        >
          <Plus className="h-4 w-4" />
          إضافة تسليم
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-1"
          onClick={() => setBulkOpen(true)}
        >
          <Users className="h-4 w-4" />
          إسناد للفصل
        </Button>
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
          title={SUBMISSIONS_ERROR_TITLE}
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
          title={SUBMISSIONS_EMPTY_TITLE}
          description={SUBMISSIONS_EMPTY_DESCRIPTION}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-start font-medium">الطالب</th>
                  <th className="px-3 py-3 text-start font-medium">الرمز</th>
                  <th className="px-3 py-3 text-start font-medium">الحالة</th>
                  <th className="px-3 py-3 text-start font-medium">تاريخ التسليم</th>
                  <th className="px-3 py-3 text-start font-medium">الدرجة</th>
                  <th className="px-3 py-3 text-start font-medium">الملاحظات</th>
                  <th className="px-3 py-3 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission, index) => {
                  const view = views[index]!;
                  return (
                    <tr key={submission.id} className="border-t">
                      <td className="px-3 py-3 font-medium">{view.studentName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{view.studentCodeLabel}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{view.statusLabel}</Badge>
                      </td>
                      <td className="px-3 py-3">{view.submittedAtLabel}</td>
                      <td className="px-3 py-3">{view.scoreLabel}</td>
                      <td className="max-w-[12rem] truncate px-3 py-3">
                        {view.feedbackLabel}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {submission.status === "pending" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              disabled={markSubmitted.isPending}
                              onClick={() =>
                                void markSubmitted.mutateAsync(submission.id).then(
                                  () => toast.success("تم تعليم التسليم كمُسلّم."),
                                  (err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : "تعذر تحديث التسليم.",
                                    ),
                                )
                              }
                            >
                              تعليم كمُسلّم
                            </Button>
                          ) : null}
                          {canOpenGradingDialog(submission.status) ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => setGradeTarget(submission)}
                            >
                              {gradingActionLabel(submission.status)}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 text-destructive"
                            onClick={() => setDeleteTarget(submission)}
                          >
                            حذف
                          </Button>
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
                          الدرجة: {view.scoreLabel}
                          {view.feedbackLabel !== "—"
                            ? ` · ملاحظات: ${view.feedbackLabel}`
                            : ""}
                        </p>
                      </div>
                      <Badge variant="outline">{view.statusLabel}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {submission.status === "pending" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 flex-1"
                          disabled={markSubmitted.isPending}
                          onClick={() =>
                            void markSubmitted.mutateAsync(submission.id).then(
                              () => toast.success("تم تعليم التسليم كمُسلّم."),
                              (err) =>
                                toast.error(
                                  err instanceof Error ? err.message : "تعذر تحديث التسليم.",
                                ),
                            )
                          }
                        >
                          تعليم كمُسلّم
                        </Button>
                      ) : null}
                      {canOpenGradingDialog(submission.status) ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 flex-1"
                          onClick={() => setGradeTarget(submission)}
                        >
                          {gradingActionLabel(submission.status)}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className={cn("min-h-11 flex-1 gap-1 text-destructive")}
                        onClick={() => setDeleteTarget(submission)}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <HomeworkBulkAssignDialog
        open={bulkOpen}
        homeworkTitle={homeworkTitle}
        grades={grades}
        classes={classes}
        students={students}
        busy={assignToClass.isPending}
        onOpenChange={setBulkOpen}
        onAssign={(classId) => assignToClass.mutateAsync(classId)}
      />

      <HomeworkGradeDialog
        open={Boolean(gradeTarget)}
        submission={gradeTarget}
        studentName={
          gradeTarget
            ? (studentById.get(gradeTarget.studentId)?.fullName ?? "الطالب")
            : ""
        }
        maxScore={maxScore}
        busy={grade.isPending}
        onOpenChange={(open) => {
          if (!open) setGradeTarget(null);
        }}
        onSubmit={async (input) => {
          if (!gradeTarget) throw new Error("معرّف التسليم مفقود.");
          await grade.mutateAsync({ submissionId: gradeTarget.id, input });
          toast.success("تم حفظ التصحيح.");
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
              سيتم حذف سجل التسليم فقط. يمكنك إعادة إنشائه لاحقاً.
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
