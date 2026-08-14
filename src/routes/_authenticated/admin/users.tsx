import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, UserCog, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  listAdminUsers,
  setUserRole,
  type AdminUserListItem,
  type AdminUsersRoleFilter,
  type AppRole,
} from "@/platform/auth/admin-users.functions";
import { SectionHeader } from "@/shared/components/section-header";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
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
import { Skeleton } from "@/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { cn } from "@/shared/utils/utils";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

const ROLE_FILTERS: Array<{ value: AdminUsersRoleFilter; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "admin", label: "مدير" },
  { value: "teacher", label: "معلم" },
];

function roleLabel(role: AppRole | null): string {
  if (role === "admin") return "مدير";
  if (role === "teacher") return "معلم";
  return "غير محدد";
}

function displayName(user: AdminUserListItem): string {
  const name = user.fullName?.trim();
  if (name) return name;
  const email = user.email?.trim();
  return email || "بدون اسم";
}

function displayEmail(user: AdminUserListItem): string {
  const email = user.email?.trim();
  return email || "بدون بريد";
}

function userInitials(user: AdminUserListItem): string {
  const name = user.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user.email?.trim();
  if (email) return email.slice(0, 2).toUpperCase();
  return "؟";
}

/** Presentation-only mapping of known server messages to polished Arabic copy. */
function toAdminUsersErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const upper = raw.toUpperCase();

  if (
    upper.includes("LAST_ADMIN") ||
    raw.includes("آخر مدير") ||
    raw.includes("مدير واحد على الأقل")
  ) {
    return "لا يمكن تغيير الدور لأن النظام يجب أن يحتوي على مدير واحد على الأقل.";
  }
  if (
    upper.includes("SELF_ROLE_CHANGE") ||
    raw.includes("حسابك الإداري") ||
    raw.includes("بنفسك")
  ) {
    return "لا يمكنك تغيير دور حسابك بنفسك.";
  }
  if (
    upper.includes("ADMIN_REQUIRED") ||
    upper.includes("NOT_AUTHENTICATED") ||
    raw.includes("غير مصرح") ||
    raw.includes("Administrators")
  ) {
    return "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
  }
  if (
    upper.includes("USER_NOT_FOUND") ||
    upper.includes("INVALID_TARGET") ||
    raw.includes("غير موجود")
  ) {
    return "المستخدم غير موجود.";
  }
  if (upper.includes("INVALID_ROLE") || raw.includes("غير صالح")) {
    return "الدور المحدد غير صالح.";
  }
  if (!raw.trim()) return "تعذر تنفيذ العملية. حاول مرة أخرى.";
  // Prefer generic fallback over leaking technical detail when message looks internal.
  if (/[A-Z_]{4,}/.test(raw) && !/[\u0600-\u06FF]/.test(raw)) {
    return "تعذر تنفيذ العملية. حاول مرة أخرى.";
  }
  return raw;
}

function RoleBadge({ role }: { role: AppRole | null }) {
  if (role === "admin") {
    return (
      <Badge className="max-w-full whitespace-normal border-transparent bg-primary/15 text-primary hover:bg-primary/20">
        مدير
      </Badge>
    );
  }
  if (role === "teacher") {
    return (
      <Badge variant="secondary" className="max-w-full whitespace-normal">
        معلم
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="max-w-full whitespace-normal text-muted-foreground">
      غير محدد
    </Badge>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل المستخدمين">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background px-4 py-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-14 rounded-md sm:block" />
          <Skeleton className="h-10 w-24 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const routeContext = Route.useRouteContext() as {
    adminUserId?: string;
    user?: { id?: string } | null;
  };
  const currentAdminId = routeContext.adminUserId ?? routeContext.user?.id ?? null;

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminUsersRoleFilter>("all");
  const [dialogUser, setDialogUser] = useState<AdminUserListItem | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<AppRole>("teacher");

  const queryKey = useMemo(
    () => ["admin-users", appliedSearch, roleFilter] as const,
    [appliedSearch, roleFilter],
  );

  const filtersActive = appliedSearch.length > 0 || roleFilter !== "all";

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      listAdminUsers({
        data: {
          search: appliedSearch,
          roleFilter,
        },
      }),
    staleTime: 15_000,
  });

  const mutation = useMutation({
    mutationFn: (payload: { targetUserId: string; newRole: AppRole }) =>
      setUserRole({ data: payload }),
    onSuccess: async (_result, variables) => {
      toast.success("تم تحديث دور المستخدم بنجاح");
      setDialogUser(null);
      queryClient.setQueriesData<{ users: AdminUserListItem[] }>(
        { queryKey: ["admin-users"] },
        (prev) => {
          if (!prev?.users) return prev;
          return {
            users: prev.users.map((u) =>
              u.id === variables.targetUserId ? { ...u, role: variables.newRole } : u,
            ),
          };
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: unknown) => {
      toast.error(toAdminUsersErrorMessage(err));
    },
  });

  function applySearch() {
    setAppliedSearch(searchInput.trim());
  }

  function clearFilters() {
    setSearchInput("");
    setAppliedSearch("");
    setRoleFilter("all");
  }

  function openRoleDialog(user: AdminUserListItem) {
    if (currentAdminId && user.id === currentAdminId) return;
    const nextRole: AppRole = user.role === "admin" ? "teacher" : "admin";
    setSelectedNewRole(nextRole);
    setDialogUser(user);
  }

  function isSelf(user: AdminUserListItem): boolean {
    return currentAdminId != null && user.id === currentAdminId;
  }

  const users = data?.users ?? [];
  const confirmationDisabled =
    mutation.isPending ||
    !dialogUser ||
    dialogUser.role === selectedNewRole ||
    (selectedNewRole !== "admin" && selectedNewRole !== "teacher");

  return (
    <div className="min-w-0 max-w-full space-y-5 md:space-y-6">
      <div className="min-w-0 space-y-3">
        <nav aria-label="مسار التنقل" className="text-sm text-muted-foreground">
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
            <li>
              <Link to="/admin" className="hover:text-foreground hover:underline">
                لوحة الإدارة
              </Link>
            </li>
            <li aria-hidden className="text-zinc-300">
              /
            </li>
            <li className="font-medium text-foreground">المستخدمون</li>
          </ol>
        </nav>

        <SectionHeader
          title="إدارة المستخدمين"
          description="إدارة حسابات المعلمين والمديرين وصلاحيات الوصول."
          action={
            <Button
              variant="outline"
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              تحديث
            </Button>
          }
        />
      </div>

      <Card className="min-w-0 border-zinc-200/80 shadow-sm">
        <CardContent className="min-w-0 space-y-5 p-4 md:p-5">
          {/* Toolbar */}
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-zinc-50/80 p-3 dark:bg-zinc-900/40">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-[16rem]">
                <Search
                  className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  placeholder="البحث بالاسم أو البريد الإلكتروني..."
                  className="h-11 min-h-[44px] w-full min-w-0 border-zinc-200 bg-white pe-10 dark:bg-zinc-950"
                  aria-label="البحث بالاسم أو البريد الإلكتروني"
                />
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <Button
                  className="h-11 min-h-[44px] flex-1 whitespace-normal sm:flex-none"
                  onClick={applySearch}
                >
                  بحث
                </Button>
                {filtersActive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 min-h-[44px] flex-1 gap-1.5 whitespace-normal text-muted-foreground sm:flex-none"
                    onClick={clearFilters}
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                    مسح الفلاتر
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="تصفية حسب الدور">
              {ROLE_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  variant={roleFilter === filter.value ? "default" : "outline"}
                  className="h-11 min-h-[44px] min-w-0 flex-1 whitespace-normal sm:flex-none"
                  onClick={() => setRoleFilter(filter.value)}
                  aria-pressed={roleFilter === filter.value}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? <UsersTableSkeleton /> : null}

          {isError ? (
            <div className="min-w-0 space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
              <p className="break-words text-sm text-destructive">تعذّر تحميل قائمة المستخدمين.</p>
              <Button
                className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
                onClick={() => refetch()}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : null}

          {!isLoading && !isError && users.length === 0 ? (
            <div className="flex min-h-[200px] min-w-0 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              {filtersActive ? (
                <>
                  <p className="text-base font-semibold text-foreground">لا توجد نتائج مطابقة</p>
                  <p className="max-w-sm break-words text-sm text-muted-foreground">
                    جرّب تغيير كلمات البحث أو الفلاتر.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2 h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
                    onClick={clearFilters}
                  >
                    مسح الفلاتر
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-foreground">لا يوجد مستخدمون</p>
                  <p className="max-w-sm break-words text-sm text-muted-foreground">
                    لم يتم العثور على أي حسابات مطابقة.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {!isLoading && !isError && users.length > 0 ? (
            <>
              {/* Cards through lg — covers phones + 800 landscape + iPad widths */}
              <ul className="grid min-w-0 gap-3 lg:hidden">
                {users.map((user) => {
                  const selfRow = isSelf(user);
                  return (
                    <li key={user.id} className="min-w-0">
                      <article className="min-w-0 rounded-xl border border-border bg-background p-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <Avatar className="h-11 w-11 shrink-0 border border-border">
                            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                              {userInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 max-w-full flex-1 basis-[10rem]">
                                <p className="break-words font-semibold leading-snug text-foreground">
                                  {displayName(user)}
                                </p>
                                <p className="break-all text-sm text-muted-foreground">
                                  {displayEmail(user)}
                                </p>
                              </div>
                              <RoleBadge role={user.role} />
                            </div>
                            {selfRow ? (
                              <p className="mt-3 break-words rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                                لا يمكن تغيير دور حسابك من هذه الصفحة.
                              </p>
                            ) : (
                              <Button
                                variant="outline"
                                className="mt-3 h-11 min-h-[44px] w-full gap-2 whitespace-normal"
                                disabled={mutation.isPending}
                                onClick={() => openRoleDialog(user)}
                              >
                                <UserCog className="h-4 w-4 shrink-0" aria-hidden />
                                تغيير الدور
                              </Button>
                            )}
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table from lg up */}
              <div className="hidden min-w-0 rounded-xl border border-border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        المستخدم
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        البريد الإلكتروني
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        الدور
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        الإجراءات
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const selfRow = isSelf(user);
                      return (
                        <TableRow
                          key={user.id}
                          className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                        >
                          <TableCell className="max-w-0 py-3.5 align-top">
                            <div className="flex min-w-0 items-start gap-3">
                              <Avatar className="h-10 w-10 shrink-0 border border-border">
                                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                  {userInitials(user)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="min-w-0 break-words font-medium leading-snug text-foreground">
                                {displayName(user)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[18rem] break-all py-3.5 align-top text-muted-foreground">
                            {displayEmail(user)}
                          </TableCell>
                          <TableCell className="py-3.5 align-top">
                            <RoleBadge role={user.role} />
                          </TableCell>
                          <TableCell className="py-3.5 align-top">
                            {selfRow ? (
                              <span className="break-words text-sm text-muted-foreground">
                                حسابك الحالي
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-11 min-h-[44px] gap-2 whitespace-normal"
                                disabled={mutation.isPending}
                                onClick={() => openRoleDialog(user)}
                                aria-label={`تغيير دور ${displayName(user)}`}
                              >
                                <UserCog className="h-4 w-4 shrink-0" aria-hidden />
                                تغيير الدور
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={dialogUser != null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDialogUser(null);
        }}
      >
        <DialogContent dir="rtl" className="min-w-0 sm:max-w-md">
          <DialogHeader className="min-w-0 space-y-1 text-right sm:text-right">
            <DialogTitle className="break-words">تغيير دور المستخدم</DialogTitle>
            <DialogDescription className="break-words text-right">
              سيتم تطبيق التغيير عبر الخادم بعد التأكيد.
            </DialogDescription>
          </DialogHeader>

          {dialogUser ? (
            <div className="min-w-0 space-y-4 py-1">
              <div className="min-w-0 rounded-xl border border-border bg-zinc-50/80 p-3 dark:bg-zinc-900/40">
                <p className="text-xs text-muted-foreground">المستخدم</p>
                <p className="mt-0.5 break-words font-semibold leading-snug text-foreground">
                  {displayName(dialogUser)}
                </p>
                <p className="break-all text-sm text-muted-foreground">
                  {displayEmail(dialogUser)}
                </p>
              </div>

              <div className="grid min-w-0 gap-3">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">الدور الحالي</Label>
                  <div className="flex min-h-11 items-center">
                    <RoleBadge role={dialogUser.role} />
                  </div>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="new-role">الدور الجديد</Label>
                  <div
                    id="new-role"
                    className="flex min-w-0 flex-wrap gap-2"
                    role="radiogroup"
                    aria-label="الدور الجديد"
                  >
                    {(["admin", "teacher"] as const).map((role) => (
                      <Button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={selectedNewRole === role}
                        variant={selectedNewRole === role ? "default" : "outline"}
                        className={cn(
                          "h-11 min-h-[44px] min-w-0 flex-1 basis-[calc(50%-0.25rem)] whitespace-normal",
                        )}
                        disabled={mutation.isPending}
                        onClick={() => setSelectedNewRole(role)}
                      >
                        {roleLabel(role)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {dialogUser.role === selectedNewRole ? (
                <p className="break-words rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  هذا المستخدم معيَّن بالفعل لهذا الدور.
                </p>
              ) : null}

              {selectedNewRole === "teacher" && dialogUser.role === "admin" ? (
                <p className="break-words rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                  تخفيض مدير إلى معلم يتطلب بقاء مدير واحد على الأقل في النظام.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              disabled={confirmationDisabled}
              onClick={() => {
                if (!dialogUser || confirmationDisabled) return;
                mutation.mutate({
                  targetUserId: dialogUser.id,
                  newRole: selectedNewRole,
                });
              }}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  جارٍ الحفظ...
                </>
              ) : (
                "تأكيد التغيير"
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              disabled={mutation.isPending}
              onClick={() => setDialogUser(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
