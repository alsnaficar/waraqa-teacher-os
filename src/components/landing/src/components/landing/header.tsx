import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/shared/ui/button";

type Props = {
  authenticated: boolean;
  onLogin: () => void;
  onPricing: () => void;
};

export function LandingHeader({
  authenticated,
  onLogin,
  onPricing,
}: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-zinc-200/50">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">

        <Link to="/">
          <BrandLogo size="sm" />
        </Link>

        <nav className="hidden lg:flex items-center gap-10 text-sm font-medium text-zinc-700">
          <a href="#product" className="hover:text-black transition">
            المنتج
          </a>

          <a href="#pricing" className="hover:text-black transition">
            الأسعار
          </a>

          <a href="#faq" className="hover:text-black transition">
            الأسئلة
          </a>
        </nav>

        <div className="flex items-center gap-3">

          {authenticated ? (
            <Button asChild>
              <Link to="/dashboard">
                لوحة التحكم
              </Link>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={onLogin}
              >
                تسجيل الدخول
              </Button>

              <Button
                onClick={onPricing}
              >
                الاشتراكات
              </Button>
            </>
          )}

        </div>

      </div>
    </header>
  );
}
