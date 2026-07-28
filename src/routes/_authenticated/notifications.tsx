import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <PageShell>
      <SectionHeader title="الإشعارات" description="آخر التحديثات والتنبيهات." />
      <EmptyState
        icon={Bell}
        title="لا توجد إشعارات"
        description="ستظهر تنبيهاتك هنا فور توفرها."
      />
    </PageShell>
  );
}
