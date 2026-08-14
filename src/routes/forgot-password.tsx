import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { BackButton } from "@/shared/components/back-button";

import { supabase } from "@/platform/database/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "استعادة كلمة المرور | ورقة" }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email) {
      toast.error("يرجى إدخال البريد الإلكتروني.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      "إذا كان البريد الإلكتروني مسجلاً، فسيتم إرسال رابط إعادة تعيين كلمة المرور إليه.",
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <BackButton />

          <h1 className="text-2xl font-bold">استعادة كلمة المرور</h1>

          <p className="text-sm text-muted-foreground">
            أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>

              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري الإرسال..." : "إرسال رابط إعادة التعيين"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
