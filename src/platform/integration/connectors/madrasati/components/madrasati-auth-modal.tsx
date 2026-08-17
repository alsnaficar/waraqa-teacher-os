import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import {
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  School,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  clickMadrasatiAuthentication,
  closeMadrasatiAuthentication,
  inspectMadrasatiAuthentication,
  pressMadrasatiAuthenticationKey,
  previewMadrasatiSync,
  screenshotMadrasatiAuthentication,
  startMadrasatiAuthentication,
  typeMadrasatiAuthentication,
  type MadrasatiDryRunPreviewResult,
  MADRASATI_DRY_RUN_DISCLAIMER,
} from "@/platform/integration/connectors/madrasati/madrasati.functions";

interface MadrasatiAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncSuccess?: () => Promise<void>;
}

type AuthenticationState = "not_authenticated" | "authenticated" | "unknown";

export function MadrasatiAuthModal({
  open,
  onOpenChange,
}: MadrasatiAuthModalProps) {
  const startFn = useServerFn(startMadrasatiAuthentication);
  const inspectFn = useServerFn(inspectMadrasatiAuthentication);
  const screenshotFn = useServerFn(screenshotMadrasatiAuthentication);
  const closeFn = useServerFn(closeMadrasatiAuthentication);
  const previewFn = useServerFn(previewMadrasatiSync);
  const clickFn = useServerFn(clickMadrasatiAuthentication);
  const typeFn = useServerFn(typeMadrasatiAuthentication);
  const pressKeyFn = useServerFn(pressMadrasatiAuthenticationKey);

  const screenshotRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [authenticationState, setAuthenticationState] =
    useState<AuthenticationState>("unknown");
  const [message, setMessage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] =
    useState<MadrasatiDryRunPreviewResult | null>(null);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [remoteInputActive, setRemoteInputActive] = useState(false);

  async function refreshSession(currentSessionId: string) {
    setRefreshing(true);

    try {
      const [inspection, image] = await Promise.all([
        inspectFn({
          data: {
            sessionId: currentSessionId,
          },
        }),
        screenshotFn({
          data: {
            sessionId: currentSessionId,
          },
        }),
      ]);

      setUrl(inspection.url);
      setAuthenticationState(inspection.authenticationState);
      setMessage(inspection.title || inspection.url);
      setScreenshot(`data:image/png;base64,${image}`);

      if (inspection.authenticationState === "authenticated") {
        toast.success("تم اكتشاف تسجيل الدخول إلى منصة مدرستي.");
      }
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "تعذر تحديث جلسة مدرستي.";

      toast.error(text);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleScreenshotClick(
    event: MouseEvent<HTMLImageElement>,
  ) {
    if (!sessionId || !screenshotRef.current || interactionBusy) {
      return;
    }

    const image = screenshotRef.current;
    const rect = image.getBoundingClientRect();

    if (!rect.width || !rect.height || !image.naturalWidth || !image.naturalHeight) {
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * image.naturalWidth;
    const y = ((event.clientY - rect.top) / rect.height) * image.naturalHeight;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    setInteractionBusy(true);

    try {
      await clickFn({
        data: {
          sessionId,
          x,
          y,
        },
      });

      setRemoteInputActive(true);

      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "تعذر النقر داخل جلسة مدرستي.";

      toast.error(text);
    } finally {
      setInteractionBusy(false);
    }
  }

  async function handleRemoteInput(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (!sessionId || interactionBusy) {
      return;
    }

    const text = event.target.value;

    if (!text) {
      return;
    }

    event.target.value = "";
    setInteractionBusy(true);

    try {
      await typeFn({
        data: {
          sessionId,
          text,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذر إرسال النص إلى جلسة مدرستي.";

      toast.error(message);
    } finally {
      setInteractionBusy(false);

      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  async function handleRemoteKey(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (!sessionId) {
      return;
    }

    const supportedKeys = new Set([
      "Enter",
      "Tab",
      "Backspace",
      "Delete",
      "Escape",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ]);

    if (!supportedKeys.has(event.key)) {
      return;
    }

    event.preventDefault();

    if (interactionBusy) {
      return;
    }

    setInteractionBusy(true);

    try {
      await pressKeyFn({
        data: {
          sessionId,
          key: event.key,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذر إرسال المفتاح إلى جلسة مدرستي.";

      toast.error(message);
    } finally {
      setInteractionBusy(false);

      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  async function handlePreview() {
    setPreviewLoading(true);

    try {
      const result = await previewFn();
      setPreview(result);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "تعذر تنفيذ معاينة مزامنة مدرستي.";

      toast.error(text);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleStart() {
    setLoading(true);

    try {
      const result = await startFn();

      setSessionId(result.session.sessionId);
      setUrl(result.url);
      setAuthenticationState(result.authenticationState);
      setMessage(result.message);

      const image = await screenshotFn({
        data: {
          sessionId: result.session.sessionId,
        },
      });

      setScreenshot(`data:image/png;base64,${image}`);

      toast.success("تم فتح جلسة متصفح مدرستي على الخادم.");
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "تعذر فتح جلسة متصفح مدرستي.";

      toast.error(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseSession() {
    if (!sessionId) {
      onOpenChange(false);
      return;
    }

    setClosing(true);

    try {
      await closeFn({
        data: {
          sessionId,
        },
      });

      setSessionId(null);
      setScreenshot(null);
      setUrl(null);
      setMessage(null);
      setAuthenticationState("unknown");

      onOpenChange(false);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "تعذر إغلاق جلسة مدرستي.";

      toast.error(text);
    } finally {
      setClosing(false);
    }
  }

  useEffect(() => {
    if (!open || !sessionId) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshSession(sessionId);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [open, sessionId]);

  useEffect(() => {
    if (open) {
      return;
    }

    setSessionId(null);
    setScreenshot(null);
    setUrl(null);
    setMessage(null);
    setAuthenticationState("unknown");
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && sessionId) {
          void handleCloseSession();
          return;
        }

        onOpenChange(next);
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-3xl max-h-[92vh] overflow-y-auto p-6 rounded-2xl border-primary/10 shadow-xl"
      >
        <DialogHeader className="text-right pb-4 border-b border-muted">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center dark:bg-amber-950/30 dark:text-amber-400">
              <School className="h-5 w-5" />
            </div>

            <div>
              <DialogTitle className="text-lg font-black text-foreground">
                تسجيل الدخول إلى منصة مدرستي
              </DialogTitle>

              <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-medium">
                جلسة متصفح آمنة تعمل على خادم ورقة
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-3 text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-300">
            <div className="flex items-start gap-2.5">
              <Info className="h-5 w-5 shrink-0 mt-0.5" />

              <div className="space-y-1.5 text-xs leading-relaxed">
                <p className="font-bold">معاينة مزامنة مدرستي</p>
                <p>{MADRASATI_DRY_RUN_DISCLAIMER}</p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10 font-bold text-sm gap-2 bg-background"
              disabled={previewLoading}
              onClick={() => void handlePreview()}
            >
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              معاينة مزامنة مدرستي
            </Button>

            {preview ? (
              <div className="rounded-lg border bg-background/70 p-3 space-y-2 text-xs">
                <p className="font-bold">{preview.disclaimer}</p>
                <p>
                  اكتشف {preview.counts.discovered} · مقبول{" "}
                  {preview.timetable.accepted.length} · مرفوض{" "}
                  {preview.counts.rejected}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 flex gap-2.5 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />

            <div className="space-y-2 text-xs leading-relaxed font-medium">
              <p>
                تسجيل الدخول يتم داخل جلسة المتصفح الموجودة على خادم ورقة.
              </p>

              <p>
                بيانات الاعتماد وملفات Cookies لا يتم حفظها في قاعدة بيانات ورقة.
              </p>

              <p>
                هذه المرحلة تعرض جلسة المتصفح وحالتها فقط.
              </p>
            </div>
          </div>

          {!sessionId ? (
            <Button
              type="button"
              className="w-full h-11 font-bold text-sm gap-2"
              disabled={loading}
              onClick={() => void handleStart()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              فتح جلسة مدرستي
            </Button>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold">
                  {authenticationState === "authenticated" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-amber-600" />
                  )}

                  <span>
                    {authenticationState === "authenticated"
                      ? "تم تسجيل الدخول"
                      : "بانتظار تسجيل الدخول"}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={refreshing}
                  onClick={() => void refreshSession(sessionId)}
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="mr-2">تحديث</span>
                </Button>
              </div>

              {url ? (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs break-all">
                  <span className="font-bold">العنوان الحالي:</span>{" "}
                  {url}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  {message}
                </div>
              ) : null}

              {screenshot ? (
                <>
                  <div
                    className={[
                      "relative rounded-xl border overflow-hidden bg-black",
                      interactionBusy
                        ? "cursor-wait"
                        : "cursor-crosshair",
                    ].join(" ")}
                  >
                    <img
                      ref={screenshotRef}
                      src={screenshot}
                      alt="شاشة جلسة تسجيل الدخول إلى مدرستي"
                      className="block w-full h-auto select-none"
                      draggable={false}
                      onClick={(event) => void handleScreenshotClick(event)}
                    />

                    {interactionBusy ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="rounded-full bg-background/90 p-3 shadow-lg">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-primary/10 bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">
                          التحكم في المتصفح
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          اضغط على الحقل داخل الشاشة أولًا، ثم اكتب من لوحة مفاتيح جوالك.
                        </p>
                      </div>

                      {remoteInputActive ? (
                        <span className="text-[11px] font-bold text-green-600">
                          الحقل محدد
                        </span>
                      ) : null}
                    </div>

                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-label="إدخال إلى متصفح مدرستي"
                      placeholder="اضغط على حقل في الشاشة ثم اكتب هنا..."
                      className="w-full h-11 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      disabled={!sessionId || interactionBusy}
                      onChange={(event) => void handleRemoteInput(event)}
                      onKeyDown={(event) => void handleRemoteKey(event)}
                    />

                    <div className="grid grid-cols-4 gap-2">
                      {[
                        ["Tab", "Tab"],
                        ["Enter", "Enter"],
                        ["⌫", "Backspace"],
                        ["Esc", "Escape"],
                      ].map(([label, key]) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!sessionId || interactionBusy}
                          onClick={() => {
                            inputRef.current?.focus();

                            void pressKeyFn({
                              data: {
                                sessionId: sessionId!,
                                key,
                              },
                            }).catch((error) => {
                              const text =
                                error instanceof Error
                                  ? error.message
                                  : "تعذر إرسال المفتاح إلى جلسة مدرستي.";

                              toast.error(text);
                            });
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border bg-muted/20 min-h-64 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-300">
                <p className="font-bold mb-1">
                  طريقة الاستخدام
                </p>
                <p>
                  اضغط مباشرة على الحقل المطلوب داخل شاشة
                  مدرستي، ثم اكتب في مربع الإدخال أسفل الشاشة. الإدخال يُرسل
                  إلى جلسة المتصفح الموجودة على خادم ورقة ولا يتم حفظه في قاعدة
                  بيانات ورقة.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 font-bold text-sm"
                disabled={closing}
                onClick={() => void handleCloseSession()}
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : null}
                إغلاق جلسة مدرستي
              </Button>
            </>
          )}

          {!sessionId ? (
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 font-bold text-sm"
              onClick={() => onOpenChange(false)}
            >
              إغلاق
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
