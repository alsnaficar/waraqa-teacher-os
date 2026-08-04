import { Button } from "@/shared/ui/button";
import { ArrowLeft } from "lucide-react";

type LandingHeroProps = {
  onPricing: () => void;
};

export function LandingHero({ onPricing }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden pt-36 pb-24">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-50 via-white to-white" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* النص */}

          <div className="text-center lg:text-right">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
              مستقبل التخطيط التعليمي
            </div>

            <h1 className="mt-8 text-5xl font-black leading-tight tracking-tight text-zinc-900 lg:text-7xl">
              علّم بذكاء...
              <br />
              وخطط بثوانٍ.
            </h1>

            <p className="mt-8 text-xl leading-9 text-zinc-600">
              ورقة منصة سعودية تساعد المعلمين على إدارة المناهج، التخطيط الأسبوعي واليومي، وإنشاء
              المحتوى التعليمي بالذكاء الاصطناعي.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-4 lg:justify-start">
              <Button size="lg" onClick={onPricing} className="rounded-xl px-8">
                الاشتراكات
              </Button>

              <Button variant="outline" size="lg" className="rounded-xl px-8">
                شاهد المزايا
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mockup */}

          <div className="relative">
            <div className="rounded-3xl border border-zinc-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 border-b px-5 py-4">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />

                <div className="mr-6 h-8 flex-1 rounded-lg bg-zinc-100" />
              </div>

              <div className="grid grid-cols-12">
                <aside className="col-span-3 border-l bg-zinc-50 p-5 space-y-4">
                  <div className="h-10 rounded-xl bg-emerald-500" />
                  <div className="h-10 rounded-xl bg-white border" />
                  <div className="h-10 rounded-xl bg-white border" />
                  <div className="h-10 rounded-xl bg-white border" />
                </aside>

                <main className="col-span-9 p-6 space-y-5">
                  <div className="h-8 w-52 rounded-lg bg-zinc-200" />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-28 rounded-2xl bg-emerald-100" />
                    <div className="h-28 rounded-2xl bg-teal-100" />
                  </div>

                  <div className="h-60 rounded-2xl border bg-zinc-50" />
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
