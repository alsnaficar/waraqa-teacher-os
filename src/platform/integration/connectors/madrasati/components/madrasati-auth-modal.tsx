import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useNavigate } from "@tanstack/react-router";
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
  Loader2,
  School,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  clickMadrasatiAuthentication,
  closeMadrasatiAuthentication,
  inspectMadrasatiAuthentication,
  inspectMadrasatiAuthenticationFocus,
  pressMadrasatiAuthenticationKey,
  previewMadrasatiSync,
  startMadrasatiAuthentication,
  typeMadrasatiAuthentication,
  waitForMadrasatiAuthenticationLiveFrame,
  type MadrasatiAuthenticationFocusResult,
  type MadrasatiDryRunPreviewResult,
  MADRASATI_DRY_RUN_DISCLAIMER,
} from "@/platform/integration/connectors/madrasati/madrasati.functions";
import { consumeMadrasatiLiveFrames } from "@/platform/integration/connectors/madrasati/madrasati-live-frame-client";

interface MadrasatiAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncSuccess?: () => Promise<void>;
}

type AuthenticationState = "not_authenticated" | "authenticated" | "unknown";

const INSPECT_INTERVAL_MS = 3000;

const RETURNING_HOME_MESSAGE =
  "تم تسجيل الدخول إلى مدرستي بنجاح، جارٍ العودة إلى ورقة...";

export function MadrasatiAuthModal({
  open,
  onOpenChange,
  onSyncSuccess,
}: MadrasatiAuthModalProps) {
  const navigate = useNavigate();
  const startFn = useServerFn(startMadrasatiAuthentication);
  const inspectFn = useServerFn(inspectMadrasatiAuthentication);
  const waitFrameFn = useServerFn(waitForMadrasatiAuthenticationLiveFrame);
  const focusFn = useServerFn(inspectMadrasatiAuthenticationFocus);
  const closeFn = useServerFn(closeMadrasatiAuthentication);
  const previewFn = useServerFn(previewMadrasatiSync);
  const clickFn = useServerFn(clickMadrasatiAuthentication);
  const typeFn = useServerFn(typeMadrasatiAuthentication);
  const pressKeyFn = useServerFn(pressMadrasatiAuthenticationKey);

  const screenshotRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const writeQueueRef = useRef(Promise.resolve());
  const composingRef = useRef(false);
  const returningHomeRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(390);
  const [viewportHeight, setViewportHeight] = useState(844);
  const [url, setUrl] = useState<string | null>(null);
  const [authenticationState, setAuthenticationState] =
    useState<AuthenticationState>("unknown");
  const [message, setMessage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] =
    useState<MadrasatiDryRunPreviewResult | null>(null);
  const [clickBusy, setClickBusy] = useState(false);
  const [focus, setFocus] = useState<MadrasatiAuthenticationFocusResult>({
    isEditable: false,
    inputType: "none",
  });
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [returningHome, setReturningHome] = useState(false);

  function enqueueWrite(task: () => Promise<void>) {
    writeQueueRef.current = writeQueueRef.current
      .then(task)
      .catch((error) => {
        const text =
          error instanceof Error
            ? error.message
            : "تعذر إرسال الإدخال إلى جلسة مدرستي.";

        toast.error(text);
      });
  }

  function focusNativeInput() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function applyLiveFrame(frame: {
    mimeType: "image/jpeg" | "image/png";
    base64: string;
    viewportWidth: number;
    viewportHeight: number;
  }) {
    setViewportWidth(frame.viewportWidth);
    setViewportHeight(frame.viewportHeight);
    setScreenshot(`data:${frame.mimeType};base64,${frame.base64}`);
  }

  async function refreshSession(currentSessionId: string) {
    setRefreshing(true);

    try {
      const inspection = await inspectFn({
        data: {
          sessionId: currentSessionId,
        },
      });

      setUrl(inspection.url);
      setAuthenticationState(inspection.authenticationState);
      setMessage(
        inspection.authenticationState === "authenticated"
          ? RETURNING_HOME_MESSAGE
          : inspection.title || inspection.url,
      );
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

  async function handleLiveViewPointer(
    event: PointerEvent<HTMLImageElement>,
  ) {
    if (!sessionId || !screenshotRef.current || clickBusy) {
      return;
    }

    const image = screenshotRef.current;
    const rect = image.getBoundingClientRect();

    if (!rect.width || !rect.height || !viewportWidth || !viewportHeight) {
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * viewportWidth;
    const y = ((event.clientY - rect.top) / rect.height) * viewportHeight;

    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      return;
    }

    setClickBusy(true);
    focusNativeInput();

    try {
      await clickFn({
        data: {
          sessionId,
          x,
          y,
        },
      });

      const nextFocus = await focusFn({
        data: {
          sessionId,
        },
      });

      setFocus(nextFocus);
      focusNativeInput();
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "تعذر النقر داخل جلسة مدرستي.";

      toast.error(text);
    } finally {
      setClickBusy(false);
      focusNativeInput();
    }
  }

  function flushNativeInput(target: HTMLInputElement) {
    if (!sessionId || composingRef.current) {
      return;
    }

    const text = target.value;

    if (!text) {
      return;
    }

    target.value = "";

    enqueueWrite(async () => {
      await typeFn({
        data: {
          sessionId,
          text,
        },
      });
    });
  }

  function handleRemoteKey(event: KeyboardEvent<HTMLInputElement>) {
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

    if (event.key === "Backspace" && event.currentTarget.value) {
      return;
    }

    event.preventDefault();

    enqueueWrite(async () => {
      await pressKeyFn({
        data: {
          sessionId,
          key: event.key,
        },
      });
    });
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
      setFocus({ isEditable: false, inputType: "none" });
      focusNativeInput();

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
      setFocus({ isEditable: false, inputType: "none" });
      setReturningHome(false);
      returningHomeRef.current = false;

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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarsePointer(media.matches);

    sync();
    media.addEventListener("change", sync);

    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open || !sessionId || !coarsePointer || typeof window === "undefined") {
      setKeyboardInset(0);
      return;
    }

    const viewport = window.visualViewport;

    if (!viewport) {
      setKeyboardInset(0);
      return;
    }

    const sync = () => {
      setKeyboardInset(
        Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop)),
      );
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);

    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [open, sessionId, coarsePointer]);

  useEffect(() => {
    if (!open || !sessionId) {
      return;
    }

    const controller = new AbortController();

    void consumeMadrasatiLiveFrames({
      sessionId,
      signal: controller.signal,
      onFrame: (update) => {
        applyLiveFrame(update.frame);
      },
      waitForFrame: async ({ sessionId: ownedSessionId, sinceSeq }) =>
        waitFrameFn({
          data: {
            sessionId: ownedSessionId,
            sinceSeq,
          },
        }),
    }).catch(() => undefined);

    const inspectTimer = window.setInterval(() => {
      void inspectFn({
        data: {
          sessionId,
        },
      })
        .then((inspection) => {
          if (returningHomeRef.current) {
            return;
          }

          setUrl(inspection.url);
          setAuthenticationState(inspection.authenticationState);
          setMessage(
            inspection.authenticationState === "authenticated"
              ? RETURNING_HOME_MESSAGE
              : inspection.title || inspection.url,
          );
        })
        .catch(() => undefined);
    }, INSPECT_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(inspectTimer);
    };
  }, [open, sessionId, inspectFn, waitFrameFn]);

  useEffect(() => {
    if (open) {
      return;
    }

    setSessionId(null);
    setScreenshot(null);
    setUrl(null);
    setMessage(null);
    setAuthenticationState("unknown");
    setFocus({ isEditable: false, inputType: "none" });
    setKeyboardInset(0);
    setReturningHome(false);
    returningHomeRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || authenticationState !== "authenticated" || returningHomeRef.current) {
      return;
    }

    if (typeof navigate !== "function") {
      return;
    }

    returningHomeRef.current = true;
    setReturningHome(true);
    setMessage(RETURNING_HOME_MESSAGE);
    toast.success(RETURNING_HOME_MESSAGE);

    void (async () => {
      try {
        if (sessionId) {
          await closeFn({
            data: {
              sessionId,
            },
          });
        }

        setSessionId(null);
        onOpenChange(false);
        await navigate({ to: "/dashboard" });

        if (onSyncSuccess) {
          await onSyncSuccess();
        }
      } catch (error) {
        returningHomeRef.current = false;
        setReturningHome(false);

        const text =
          error instanceof Error
            ? error.message
            : "تعذر العودة إلى ورقة.";

        toast.error(text);
      }
    })();
  }, [
    open,
    authenticationState,
    sessionId,
    navigate,
    closeFn,
    onOpenChange,
    onSyncSuccess,
  ]);

  const popupStyle =
    coarsePointer && keyboardInset > 40
      ? {
          top: "auto",
          bottom: `calc(${keyboardInset}px + 8px)`,
          transform: "translate(-50%, 0)",
          maxHeight: `calc(100dvh - ${keyboardInset}px - 16px)`,
        }
      : undefined;

  const liveViewMaxHeight = `min(58vh, calc(100dvh - ${keyboardInset}px - 11rem))`;

  const statusLabel = returningHome
    ? RETURNING_HOME_MESSAGE
    : authenticationState === "authenticated"
      ? "تم تسجيل الدخول"
      : sessionId
        ? "بانتظار تسجيل الدخول"
        : "جلسة آمنة داخل ورقة";

  const keyboardBar = sessionId ? (
    <div className="space-y-2 rounded-xl bg-muted/40 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          اضغط الحقل داخل الشاشة ثم اكتب.
        </p>

        {focus.isEditable ? (
          <span className="text-[11px] font-semibold text-green-600">
            {focus.inputType === "protected"
              ? "حقل محمي نشط"
              : "الحقل محدد"}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-[44px]"
          disabled={!sessionId}
          onClick={() => focusNativeInput()}
        >
          كتابة
        </Button>
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
            className="h-11 min-h-[44px]"
            disabled={!sessionId}
            onClick={() => {
              focusNativeInput();

              enqueueWrite(async () => {
                await pressKeyFn({
                  data: {
                    sessionId: sessionId!,
                    key,
                  },
                });
              });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  ) : null;

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
        style={popupStyle}
        className="flex max-h-[min(92dvh,100svh)] w-[calc(100vw-16px)] max-w-[720px] flex-col gap-2 overflow-y-auto rounded-2xl border-primary/10 p-3 shadow-2xl sm:rounded-2xl sm:p-4"
      >
        <DialogHeader className="space-y-0 pr-8 text-right">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              <School className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-bold leading-6 text-foreground">
                {sessionId ? "متصفح مدرستي" : "تسجيل الدخول إلى مدرستي"}
              </DialogTitle>

              <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium leading-snug text-muted-foreground">
                {sessionId ? (
                  <>
                    {authenticationState === "authenticated" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    )}
                    <span className="min-w-0">{statusLabel}</span>
                  </>
                ) : (
                  <span>جلسة متصفح آمنة داخل ورقة</span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {!sessionId ? (
            <>
              <Button
                type="button"
                className="h-11 w-full gap-2 text-sm font-bold"
                disabled={loading}
                onClick={() => void handleStart()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                فتح جلسة مدرستي
              </Button>

              <details className="rounded-xl bg-muted/30 px-3 py-1 text-xs">
                <summary className="flex h-11 min-h-[44px] cursor-pointer list-none items-center font-semibold text-muted-foreground">
                  معاينة مزامنة مدرستي
                </summary>

                <div className="space-y-2 pb-2">
                  <p className="leading-relaxed text-muted-foreground">
                    {MADRASATI_DRY_RUN_DISCLAIMER}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full gap-2 bg-background text-sm font-bold"
                    disabled={previewLoading}
                    onClick={() => void handlePreview()}
                  >
                    {previewLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    معاينة مزامنة مدرستي
                  </Button>

                  {preview ? (
                    <div className="space-y-1 rounded-lg bg-background/70 p-2">
                      <p className="font-semibold">{preview.disclaimer}</p>
                      <p>
                        اكتشف {preview.counts.discovered} · مقبول{" "}
                        {preview.timetable.accepted.length} · مرفوض{" "}
                        {preview.counts.rejected}
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 items-center justify-center">
                {screenshot ? (
                  <div
                    className={[
                      "relative overflow-hidden rounded-xl bg-black shadow-sm",
                      clickBusy ? "cursor-wait" : "cursor-crosshair",
                    ].join(" ")}
                  >
                    <img
                      ref={screenshotRef}
                      src={screenshot}
                      alt="شاشة جلسة تسجيل الدخول إلى مدرستي"
                      className="mx-auto block h-auto max-h-[58vh] max-w-full w-auto select-none"
                      style={{ maxHeight: liveViewMaxHeight }}
                      draggable={false}
                      onPointerUp={(event) => void handleLiveViewPointer(event)}
                    />

                    <input
                      ref={inputRef}
                      type="text"
                      inputMode={focus.inputType === "email" ? "email" : "text"}
                      enterKeyHint="next"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-label="إدخال إلى متصفح مدرستي"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-12 min-h-[48px] w-full caret-transparent opacity-[0.02] text-base"
                      disabled={!sessionId}
                      onCompositionStart={() => {
                        composingRef.current = true;
                      }}
                      onCompositionEnd={(event) => {
                        composingRef.current = false;
                        flushNativeInput(event.currentTarget);
                      }}
                      onInput={(event) => {
                        flushNativeInput(event.currentTarget);
                      }}
                      onKeyDown={(event) => handleRemoteKey(event)}
                    />

                    {clickBusy ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="rounded-full bg-background/90 p-3 shadow-lg">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      </div>
                    ) : null}

                    {returningHome ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-4 text-center text-sm font-semibold">
                        {RETURNING_HOME_MESSAGE}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mx-auto flex h-36 w-full max-w-[220px] flex-col items-center justify-center gap-2 rounded-xl bg-zinc-900 text-zinc-200">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="px-3 text-center text-[11px] leading-relaxed">
                      جارٍ تحميل شاشة مدرستي...
                    </span>
                  </div>
                )}
              </div>

              {keyboardBar}

              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-sm font-medium text-muted-foreground"
                disabled={closing || returningHome}
                onClick={() => void handleCloseSession()}
              >
                {closing ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : null}
                إغلاق جلسة مدرستي
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
