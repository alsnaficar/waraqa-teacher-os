import { Link } from "@tanstack/react-router";
import { Button } from "@/shared/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";

type HeaderProps = {
  authenticated: boolean;
  onSignIn: () => void;
  onPricing: () => void;
};

export function LandingHeader({ authenticated, onSignIn, onPricing }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <BrandLogo size="sm" />
        </Link>

        <nav className="hidden md:flex items-center gap-10 text-sm font-medium">
          <a href="#features" className="hover:text-teal-600 transition">
            المنتج
          </a>

          {authenticated ? (
            <Link to="/subscription" className="hover:text-teal-600 transition">
              الأسعار
            </Link>
          ) : (
            <button type="button" onClick={onPricing} className="hover:text-teal-600 transition">
              الأسعار
            </button>
          )}

          <a href="#features" className="hover:text-teal-600 transition">
            الأسئلة
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <Button asChild>
              <Link to="/dashboard">لوحة التحكم</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onSignIn}>
                تسجيل الدخول
              </Button>

              <Button onClick={onPricing}>الاشتراكات</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
