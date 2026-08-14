import { Eye, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/utils";

import { useTestQuestions } from "../hooks/useTestQuestions";
import { useTests } from "../hooks/useTests";
import type { TeacherTest, TestStatus } from "../services/test.service";
import {
  filterTestsByTitle,
  TEST_EMPTY_DESCRIPTION,
  TEST_EMPTY_TITLE,
  TEST_ERROR_DESCRIPTION,
  TEST_ERROR_TITLE,
  TEST_STATUS_HINT,
  TEST_STATUS_OPTIONS,
  toTestListItemView,
} from "../services/tests-ui.logic";
import { TestFormDialog, type TestFormMode } from "./test-form-dialog";
import { TestQuestionBuilder } from "./test-question-builder";
import { TestReportsPanel } from "./test-reports-panel";
import { TestSubmissionsPanel } from "./test-submissions-panel";
import { canViewTestSubmissions } from "../services/tests-submissions-ui.logic";

export function TestsPageContent({ initialTestId }: { initialTestId?: string } = {}) {
  const [tab, setTab] = useState("tests");
  const [statusFilter, setStatusFilter] = useState<TestStatus | "all">("all");
  const [titleQuery, setTitleQuery] = useState("");
  const filter = useMemo(
    () => (statusFilter === "all" ? {} : { status: statusFilter }),
    [statusFilter],
  );
  const { items, loading, error, refresh, create, update, remove, publish, close } =
    useTests(filter);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<TestFormMode>("create");
  const [editing, setEditing] = useState<TeacherTest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherTest | null>(null);
  const [publishTarget, setPublishTarget] = useState<TeacherTest | null>(null);
  const [closeTarget, setCloseTarget] = useState<TeacherTest | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(initialTestId ?? null);

  useEffect(() => {
    if (initialTestId) {
      setSelectedTestId(initialTestId);
    }
  }, [initialTestId]);

  const filtered = useMemo(
    () => filterTestsByTitle(items, titleQuery),
    [items, titleQuery],
  );
  const views = filtered.map(toTestListItemView);
  const selectedTest = filtered.find((row) => row.id === selectedTestId) ?? null;

  function openCreate() {
    setFormMode("create");
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(test: TeacherTest) {
    setFormMode("edit");
    setEditing(test);
    setFormOpen(true);
  }

  function openView(test: TeacherTest) {
    setFormMode("view");
    setEditing(test);
    setFormOpen(true);
  }

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-4">
        <TabsList className="flex h-auto min-h-11 w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="tests" className="min-h-11 flex-1 sm:flex-none">
            الاختبارات
          </TabsTrigger>
          <TabsTrigger value="reports" className="min-h-11 flex-1 sm:flex-none">
            التقارير
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tests" className="mt-0 space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">إدارة الاختبارات</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                أنشئ اختبارات مسودة، أضف الأسئلة، ثم انشرها أو أغلقها عند الحاجة.
              </p>
            </div>
          </div>
          <Button type="button" className="min-h-11 gap-1" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            إضافة اختبار
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={statusFilter === "all" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setStatusFilter("all")}
        >
          الكل
        </Button>
        {TEST_STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={statusFilter === option.value ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setStatusFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Input
        className="min-h-11"
        placeholder="بحث بالعنوان…"
        value={titleQuery}
        onChange={(e) => setTitleQuery(e.target.value)}
        aria-label="بحث بالعنوان"
      />

      <p className="text-[11px] text-muted-foreground">{TEST_STATUS_HINT}</p>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={FlaskConical}
          title={TEST_ERROR_TITLE}
          description={error instanceof Error ? error.message : TEST_ERROR_DESCRIPTION}
          action={
            <Button className="min-h-11" onClick={() => void refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : views.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title={TEST_EMPTY_TITLE}
          description={TEST_EMPTY_DESCRIPTION}
          action={
            <Button className="min-h-11 gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              إضافة اختبار
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((test, index) => {
            const view = views[index]!;
            const isSelected = selectedTestId === test.id;
            return (
              <Card key={test.id} className="min-w-0 overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <h2 className="truncate text-base font-bold">{view.title}</h2>
                      <p className="text-xs text-muted-foreground">{view.metaLabel}</p>
                      <p className="text-xs text-muted-foreground">الموعد: {view.dueDateLabel}</p>
                      {isSelected ? <QuestionCountHint testId={test.id} /> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{view.statusLabel}</Badge>
                      {view.hasLessonSession ? (
                        <Badge variant="secondary">مرتبط بحصة</Badge>
                      ) : null}
                    </div>
                  </div>

                  {test.instructions ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {test.instructions}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className="min-h-11 flex-1 gap-1 sm:flex-none"
                      onClick={() => setSelectedTestId(isSelected ? null : test.id)}
                    >
                      {isSelected
                        ? "إخفاء الأسئلة"
                        : view.canManageQuestions
                          ? "الأسئلة"
                          : "عرض الأسئلة"}
                    </Button>

                    {view.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 gap-1 sm:flex-none"
                        onClick={() => openEdit(test)}
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 gap-1 sm:flex-none"
                        onClick={() => openView(test)}
                      >
                        <Eye className="h-4 w-4" />
                        عرض
                      </Button>
                    )}

                    {view.canPublish ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 sm:flex-none"
                        onClick={() => setPublishTarget(test)}
                      >
                        نشر
                      </Button>
                    ) : null}

                    {view.canClose ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 sm:flex-none"
                        onClick={() => setCloseTarget(test)}
                      >
                        إغلاق
                      </Button>
                    ) : null}

                    {view.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "min-h-11 flex-1 gap-1 text-destructive sm:flex-none",
                        )}
                        onClick={() => setDeleteTarget(test)}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    ) : null}
                  </div>

                  {isSelected && selectedTest ? (
                    <>
                      <TestQuestionBuilder
                        testId={selectedTest.id}
                        testTitle={selectedTest.title}
                        readOnly={!view.canManageQuestions}
                      />
                      {canViewTestSubmissions(selectedTest.status) ? (
                        <TestSubmissionsPanel
                          testId={selectedTest.id}
                          testTitle={selectedTest.title}
                          testStatus={selectedTest.status}
                        />
                      ) : null}
                    </>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TestFormDialog
        open={formOpen}
        mode={formMode}
        initial={editing}
        busy={create.isPending || update.isPending}
        onOpenChange={setFormOpen}
        onSubmit={async (input) => {
          if (formMode === "view") return;
          if (formMode === "create") {
            await create.mutateAsync(input);
            toast.success("تمت إضافة الاختبار.");
            return;
          }
          if (!editing) throw new Error("معرّف الاختبار مفقود.");
          await update.mutateAsync({ id: editing.id, patch: input });
          toast.success("تم تحديث الاختبار.");
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
            <AlertDialogTitle>حذف الاختبار؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteTarget?.title}» نهائياً. لا يمكن التراجع عن هذا الإجراء.
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
                    toast.success("تم حذف الاختبار.");
                    if (selectedTestId === deleteTarget.id) {
                      setSelectedTestId(null);
                    }
                    setDeleteTarget(null);
                  },
                  (err) => {
                    toast.error(err instanceof Error ? err.message : "تعذر حذف الاختبار.");
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

      <AlertDialog
        open={Boolean(publishTarget)}
        onOpenChange={(open) => {
          if (!open) setPublishTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>نشر الاختبار؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم نشر «{publishTarget?.title}». بعد النشر يمكن إغلاقه لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="min-h-11 w-full"
              disabled={publish.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!publishTarget) return;
                void publish.mutateAsync(publishTarget.id).then(
                  () => {
                    toast.success("تم نشر الاختبار.");
                    setPublishTarget(null);
                  },
                  (err) => {
                    toast.error(err instanceof Error ? err.message : "تعذر نشر الاختبار.");
                  },
                );
              }}
            >
              {publish.isPending ? "جاري النشر…" : "تأكيد النشر"}
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-11 w-full" disabled={publish.isPending}>
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إغلاق الاختبار؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إغلاق «{closeTarget?.title}». الاختبار المغلق للعرض فقط.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="min-h-11 w-full"
              disabled={close.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!closeTarget) return;
                void close.mutateAsync(closeTarget.id).then(
                  () => {
                    toast.success("تم إغلاق الاختبار.");
                    setCloseTarget(null);
                  },
                  (err) => {
                    toast.error(err instanceof Error ? err.message : "تعذر إغلاق الاختبار.");
                  },
                );
              }}
            >
              {close.isPending ? "جاري الإغلاق…" : "تأكيد الإغلاق"}
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-11 w-full" disabled={close.isPending}>
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="reports" className="mt-0 space-y-4">
          <TestReportsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuestionCountHint({ testId }: { testId: string }) {
  const { items, loading } = useTestQuestions(testId);
  if (loading) {
    return <p className="text-xs text-muted-foreground">جاري عدّ الأسئلة…</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      عدد الأسئلة: {items.length}
    </p>
  );
}
