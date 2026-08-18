import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/shared/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  clickMadrasatiAuthentication,
  closeMadrasatiAuthentication,
  inspectMadrasatiAuthentication,
  inspectMadrasatiAuthenticationFocus,
  pressMadrasatiAuthenticationKey,
  startMadrasatiAuthentication,
  typeMadrasatiAuthentication,
  waitForMadrasatiAuthenticationLiveFrame,
  type MadrasatiAuthenticationFocusResult,
} from "@/platform/integration/connectors/madrasati/madrasati.functions";
import { consumeMadrasatiLiveFrames } from "@/platform/integration/connectors/madrasati/madrasati-live-frame-client";

type AuthenticationState = "not_authenticated" | "authenticated" | "unknown";

const INSPECT_INTERVAL_MS = 3000;

const RETURNING_HOME_MESSAGE =
  "تم تسجيل الدخول إلى مدرستي بنجاح، جارٍ العودة إلى ورقة...";

interface MadrasatiAuthPageProps {
  onSyncSuccess?: () => Promise<void>;
}

export function MadrasatiAuthPage({ onSyncSuccess }: MadrasatiAuthPageProps) {
  const navigate = useNavigate();
  const startFn = useServerFn(startMadrasatiAuthentication);
  const inspectFn = useServerFn(inspectMadrasatiAuthentication);
  const waitFrameFn = useServerFn(waitForMadrasatiAuthenticationLiveFrame);
  const focusFn = useServerFn(inspectMadrasatiAuthenticationFocus);
  const closeFn = useServerFn(closeMadrasatiAuthentication);
  const clickFn = useServerFn(clickMadrasatiAuthentication);
  const typeFn = useServerFn(typeMadrasatiAuthentication);
  const pressKeyFn = useServerFn(pressMadrasatiAuthenticationKey);

  const screenshotRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const writeQueueRef = useRef(Promise.resolve());
  const composingRef = useRef(false);
  const returningHomeRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(390);
  const [viewportHeight, setViewportHeight] = useState(844);
  const [authenticationState, setAuthenticationState] =
    useState<AuthenticationState>("unknown");
  const [clickBusy, setClickBusy] = useState(false);
  const [focus, setFocus] = useState<MadrasatiAuthenticationFocusResult>({
    isEditable: false,
    inputType: "none",
  });
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [returningHome, setReturningHome] = useState(false);

  sessionIdRef.current = sessionId;

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
    inputRef.current?.focus();
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

  async function handleLiveViewPointer(
    event: PointerEvent<HTMLElement>,
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

    focusNativeInput();
    setClickBusy(true);

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

  async function closeOwnedSession(currentSessionId: string) {
    await closeFn({
      data: {
        sessionId: currentSessionId,
      },
    });
  }

  function clearLocalSession() {
    sessionIdRef.current = null;
    setSessionId(null);
    setScreenshot(null);
    setAuthenticationState("unknown");
    setFocus({ isEditable: false, inputType: "none" });
  }

  async function handleExit() {
    if (returningHomeRef.current) {
      return;
    }

    setClosing(true);

    try {
      const ownedSessionId = sessionIdRef.current;

      if (ownedSessionId) {
        await closeOwnedSession(ownedSessionId);
      }

      clearLocalSession();

      if (typeof navigate === "function") {
        await navigate({ to: "/dashboard" });
      }
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
    let cancelled = false;

    async function startSession() {
      setLoading(true);

      try {
        const result = await startFn();

        if (cancelled) {
          await closeOwnedSession(result.session.sessionId);
          return;
        }

        sessionIdRef.current = result.session.sessionId;
        setSessionId(result.session.sessionId);
        setAuthenticationState(result.authenticationState);
        setFocus({ isEditable: false, inputType: "none" });
        focusNativeInput();
      } catch (error) {
        if (cancelled) {
          return;
        }

        const text =
          error instanceof Error
            ? error.message
            : "تعذر فتح جلسة متصفح مدرستي.";

        toast.error(text);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void startSession();

    return () => {
      cancelled = true;
    };
  }, [startFn, closeFn]);

  useEffect(() => {
    return () => {
      const ownedSessionId = sessionIdRef.current;

      if (!ownedSessionId || returningHomeRef.current) {
        return;
      }

      void closeFn({
        data: {
          sessionId: ownedSessionId,
        },
      });
    };
  }, [closeFn]);

  useEffect(() => {
    if (!sessionId || !coarsePointer || typeof window === "undefined") {
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
  }, [sessionId, coarsePointer]);

  useEffect(() => {
    if (!sessionId) {
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

          setAuthenticationState(inspection.authenticationState);
        })
        .catch(() => undefined);
    }, INSPECT_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(inspectTimer);
    };
  }, [sessionId, inspectFn, waitFrameFn]);

  useEffect(() => {
    if (authenticationState !== "authenticated" || returningHomeRef.current) {
      return;
    }

    if (typeof navigate !== "function") {
      return;
    }

    returningHomeRef.current = true;
    setReturningHome(true);
    toast.success(RETURNING_HOME_MESSAGE);

    void (async () => {
      try {
        const ownedSessionId = sessionIdRef.current;

        if (ownedSessionId) {
          await closeOwnedSession(ownedSessionId);
        }

        clearLocalSession();
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
  }, [authenticationState, navigate, closeFn, onSyncSuccess]);

  const statusLabel = returningHome
    ? RETURNING_HOME_MESSAGE
    : authenticationState === "authenticated"
      ? "تم تسجيل الدخول"
      : sessionId
        ? "بانتظار تسجيل الدخول"
        : loading
          ? "جارٍ فتح الجلسة..."
          : "تعذر فتح الجلسة";

  const keyboardButtons = [
    ["Tab", "Tab"],
    ["كتابة", "focus"],
    ["⌫", "Backspace"],
    ["Enter", "Enter"],
    ["Esc", "Escape"],
  ] as const;

  const keyboardBar = sessionId ? (
    <div
      className="shrink-0 border-t bg-background px-1.5 pt-1"
      style={{
        paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {focus.isEditable ? (
        <p className="mb-1 truncate px-1 text-center text-[10px] font-semibold leading-none text-green-600">
          {focus.inputType === "protected" ? "حقل محمي نشط" : "الحقل محدد"}
        </p>
      ) : null}

      <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5">
        {keyboardButtons.map(([label, key]) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            className="h-11 min-h-[44px] min-w-[44px] flex-1 px-1.5 text-[11px] font-semibold sm:text-xs"
            disabled={!sessionId}
            onClick={() => {
              if (key === "focus") {
                focusNativeInput();
                return;
              }

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
    <div
      dir="rtl"
      className="flex overflow-hidden bg-background"
      style={{
        height: `calc(100dvh - ${keyboardInset}px)`,
        maxHeight: `calc(100dvh - ${keyboardInset}px)`,
      }}
    >
      <div className="flex min-h-0 w-full flex-col">
        <header className="flex h-12 min-h-[48px] shrink-0 items-center gap-1.5 border-b px-1.5 sm:h-14 sm:min-h-[56px] sm:px-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-h-[44px] shrink-0 gap-1 px-2 text-sm font-medium"
            disabled={closing || returningHome}
            onClick={() => void handleExit()}
          >
            {closing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            العودة إلى ورقة
          </Button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold leading-6">
              تسجيل الدخول إلى مدرستي
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium leading-snug text-muted-foreground">
              {authenticationState === "authenticated" || returningHome ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              )}
              <span className="min-w-0">{statusLabel}</span>
            </p>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-zinc-950">
          {screenshot ? (
            <div
              className={[
                "relative flex h-full min-h-0 w-full min-w-0 items-center justify-center",
                clickBusy ? "cursor-wait" : "cursor-crosshair",
              ].join(" ")}
            >
              <div className="relative z-10 inline-block max-h-full max-w-full">
                <img
                  ref={screenshotRef}
                  src={screenshot}
                  alt="شاشة جلسة تسجيل الدخول إلى مدرستي"
                  className="mx-auto block h-auto max-h-full max-w-full w-auto object-contain select-none md:max-h-[min(100%,820px)]"
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
                  className="absolute inset-0 z-10 h-full min-h-[44px] w-full bg-transparent text-base text-transparent caret-transparent outline-none"
                  disabled={!sessionId}
                  onPointerDown={() => {
                    focusNativeInput();
                  }}
                  onPointerUp={(event) => {
                    void handleLiveViewPointer(event);
                  }}
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
              </div>

              {clickBusy ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="rounded-full bg-background/90 p-3 shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                </div>
              ) : null}

              {returningHome ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 p-4 text-center text-sm font-semibold">
                  {RETURNING_HOME_MESSAGE}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-6 text-zinc-200">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-center text-xs leading-relaxed">
                جارٍ تحميل شاشة مدرستي...
              </span>
            </div>
          )}
        </div>

        {keyboardBar}
      </div>
    </div>
  );
}
