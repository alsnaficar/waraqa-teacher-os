import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/subscription")({
  component: SubscriptionPage,
});

function SubscriptionPage() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">الاشتراك</h1>
        <p className="mt-2 text-muted-foreground">
          إدارة الباقة والاشتراك والفواتير.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border p-6">
          <h2 className="font-semibold">الباقة الحالية</h2>
          <p className="mt-4 text-2xl font-bold">غير مشترك</p>
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="font-semibold">تاريخ الانتهاء</h2>
          <p className="mt-4 text-2xl font-bold">—</p>
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="font-semibold">الحالة</h2>
          <p className="mt-4 font-bold text-green-600">
            لا يوجد اشتراك
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border p-6">
        <button className="rounded-lg bg-primary px-6 py-3 text-primary-foreground">
          اشترك الآن
        </button>
      </div>
    </div>
  );
}
