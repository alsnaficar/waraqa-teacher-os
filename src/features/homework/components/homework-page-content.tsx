import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/utils";

import { useHomework } from "../hooks/useHomework";
import type { Homework, HomeworkStatus } from "../services/homework.service";
import {
  HOMEWORK_EMPTY_DESCRIPTION,
  HOMEWORK_EMPTY_TITLE,
  HOMEWORK_ERROR_DESCRIPTION,
  HOMEWORK_ERROR_TITLE,
  HOMEWORK_STATUS_HINT,
  HOMEWORK_STATUS_OPTIONS,
  toHomeworkListItemView,
} from "../services/homework-ui.logic";
import { HomeworkFormDialog } from "./homework-form-dialog";
import { HomeworkReportsPanel } from "./homework-reports-panel";
import { HomeworkSubmissionsPanel } from "./homework-submissions-panel";
import { StudentsPanel } from "./students-panel";

export function HomeworkPageContent({
  initialHomeworkId,
}: {
  initialHomeworkId?: string;
} = {}) {
  const [tab, setTab] = useState("homework");
  const [statusFilter, setStatusFilter] = useState<HomeworkStatus | "all">("all");
  const filter = useMemo(
    () => (statusFilter === "all" ? {} : { status: statusFilter }),
    [statusFilter],
  );
  const { items, loading, error, refresh, create, update, remove } = useHomework(filter);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<Homework | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Homework | null>(null);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string | null>(
    initialHomeworkId ?? null,
  );

  useEffect(() => {
    if (initialHomeworkId) {
      setSelectedHomeworkId(initialHomeworkId);
    }
  }, [initialHomeworkId]);

  const views = items.map(toHomeworkListItemView);
  const selectedHomework = items.find((row) => row.id === selectedHomeworkId) ?? null;

  function openCreate() {
    setFormMode("create");
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(homework: Homework) {
    setFormMode("edit");
    setEditing(homework);
    setFormOpen(true);
  }

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-4">
        <TabsList className="flex h-auto min-h-11 w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="homework" className="min-h-11 flex-1 sm:flex-none">
            الواجبات
          </TabsTrigger>
          <TabsTrigger value="students" className="min-h-11 flex-1 sm:flex-none">
            الطلاب
          </TabsTrigger>
          <TabsTrigger value="reports" className="min-h-11 flex-1 sm:flex-none">
            التقارير
          </TabsTrigger>
        </TabsList>

        <TabsContent value="homework" className="mt-0 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold">إدارة الواجبات</h1>
                  <p className="mt-1 text-xs text-muted-foreground">
                    أنشئ وعدّل واجباتك، ثم افتح التسليمات وصحّحها يدوياً عند الحاجة.
                  </p>
                </div>
              </div>
              <Button type="button" className="min-h-11 gap-1" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                إضافة واجب
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
            {HOMEWORK_STATUS_OPTIONS.map((option) => (
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

          <p className="text-[11px] text-muted-foreground">{HOMEWORK_STATUS_HINT}</p>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={ClipboardList}
              title={HOMEWORK_ERROR_TITLE}
              description={error instanceof Error ? error.message : HOMEWORK_ERROR_DESCRIPTION}
              action={
                <Button className="min-h-11" onClick={() => void refresh()}>
                  إعادة المحاولة
                </Button>
              }
            />
          ) : views.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={HOMEWORK_EMPTY_TITLE}
              description={HOMEWORK_EMPTY_DESCRIPTION}
              action={
                <Button className="min-h-11 gap-1" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  إضافة واجب
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {items.map((homework, index) => {
                const view = views[index]!;
                const isSelected = selectedHomeworkId === homework.id;
                return (
                  <Card key={homework.id} className="min-w-0 overflow-hidden">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <h2 className="truncate text-base font-bold">{view.title}</h2>
                          <p className="text-xs text-muted-foreground">{view.metaLabel}</p>
                          <p className="text-xs text-muted-foreground">الموعد: {view.dueDateLabel}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{view.statusLabel}</Badge>
                          {view.hasLessonSession ? (
                            <Badge variant="secondary">مرتبط بحصة</Badge>
                          ) : null}
                        </div>
                      </div>

                      {homework.instructions ? (
                        <p className="line-clamp-3 text-sm text-muted-foreground">
                          {homework.instructions}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          className="min-h-11 flex-1 gap-1 sm:flex-none"
                          onClick={() =>
                            setSelectedHomeworkId(isSelected ? null : homework.id)
                          }
                        >
                          {isSelected ? "إخفاء التسليمات" : "التسليمات"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 flex-1 gap-1 sm:flex-none"
                          onClick={() => openEdit(homework)}
                        >
                          <Pencil className="h-4 w-4" />
                          تعديل
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "min-h-11 flex-1 gap-1 text-destructive sm:flex-none",
                          )}
                          onClick={() => setDeleteTarget(homework)}
                        >
                          <Trash2 className="h-4 w-4" />
                          حذف
                        </Button>
                      </div>

                      {isSelected && selectedHomework ? (
                        <HomeworkSubmissionsPanel
                          homeworkId={selectedHomework.id}
                          homeworkTitle={selectedHomework.title}
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-0">
          <StudentsPanel />
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <HomeworkReportsPanel />
        </TabsContent>
      </Tabs>

      <HomeworkFormDialog
        open={formOpen}
        mode={formMode}
        initial={editing}
        busy={create.isPending || update.isPending}
        onOpenChange={setFormOpen}
        onSubmit={async (input) => {
          if (formMode === "create") {
            await create.mutateAsync(input);
            toast.success("تمت إضافة الواجب.");
            return;
          }
          if (!editing) throw new Error("معرّف الواجب مفقود.");
          await update.mutateAsync({ id: editing.id, patch: input });
          toast.success("تم تحديث الواجب.");
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
            <AlertDialogTitle>حذف الواجب؟</AlertDialogTitle>
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
                    toast.success("تم حذف الواجب.");
                    if (selectedHomeworkId === deleteTarget.id) {
                      setSelectedHomeworkId(null);
                    }
                    setDeleteTarget(null);
                  },
                  (err) => {
                    toast.error(err instanceof Error ? err.message : "تعذر حذف الواجب.");
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
