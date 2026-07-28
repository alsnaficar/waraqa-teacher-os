import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarDays, Sparkles, Users, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ar } from "@/i18n/ar";

export const Route = createFileRoute("/")({
  component: Landing,
});

const features = [
  {
    icon: BookOpen,
    title: ar.landing.features.curriculumTitle,
    body: ar.landing.features.curriculumBody,
  },
  {
    icon: CalendarDays,
    title: ar.landing.features.plannerTitle,
    body: ar.landing.features.plannerBody,
  },
  { icon: Sparkles, title: ar.landing.features.aiTitle, body: ar.landing.features.aiBody },
  { icon: Users, title: ar.landing.features.collabTitle, body: ar.landing.features.collabBody },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4 md:p-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
            و
          </div>
          <div>
            <p className="text-lg font-bold leading-tight">{ar.app.name}</p>
            <p className="text-xs text-muted-foreground">{ar.app.tagline}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/auth">{ar.nav.signIn}</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">{ar.nav.signUp}</Link>
          </Button>
        </div>
      </header>

      <section className="gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center md:py-28">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground md:text-6xl">
            {ar.landing.heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {ar.landing.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" className="gap-2">
                {ar.landing.ctaPrimary}
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">{ar.landing.ctaSecondary}</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 text-center md:py-20">
        <h2 className="text-2xl font-bold text-foreground md:text-3xl">جاهز للانضمام؟</h2>
        <p className="mt-3 text-muted-foreground">ابدأ الآن في إدارة حصصك وتحضير دروسك بذكاء</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">{ar.nav.signUp}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">{ar.nav.signIn}</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-muted-foreground">
          {ar.landing.footer}
        </div>
      </footer>
    </div>
  );
}
