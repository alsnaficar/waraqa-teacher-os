import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  closeMadrasatiLoginWindow,
  getMadrasatiOfficialLoginStatus,
  MADRASATI_OFFICIAL_LOGIN_COPY,
  openMadrasatiLoginWindow,
  type MadrasatiLoginWindowHandle,
  type MadrasatiOfficialLoginPhase,
} from "@/platform/integration/connectors/madrasati/madrasati-official-login";

const copy = MADRASATI_OFFICIAL_LOGIN_COPY;

export function MadrasatiOfficialLoginPage() {
  const navigate = useNavigate();
  const popupRef = useRef<MadrasatiLoginWindowHandle | null>(null);
  const [phase, setPhase] = useState<MadrasatiOfficialLoginPhase>("ready");
  const [closeHint, setCloseHint] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      popupRef.current = null;
    };
  }, []);

  function openMadrasati() {
    const result = openMadrasatiLoginWindow(popupRef.current, (url, name, features) =>
      window.open(url, name, features),
    );

    popupRef.current = result.popup;
    setCloseHint(null);

    if (result.status === "blocked") {
      setPhase("blocked");
      return;
    }

    setPhase("opened");
  }

  function returnToWaraqa() {
    const closeResult = closeMadrasatiLoginWindow(popupRef.current);
    popupRef.current = null;

    try {
      window.focus();
    } catch {
      // Focusing the opener is best-effort.
    }

    setCloseHint(closeResult === "blocked" ? copy.closeBlocked : null);
    setPhase("returned");
  }

  function leaveForSettings() {
    closeMadrasatiLoginWindow(popupRef.current);
    popupRef.current = null;
    void navigate({ to: "/settings" });
  }

  const status = getMadrasatiOfficialLoginStatus(phase);
  const opened = phase === "opened";
  const returned = phase === "returned";

  return (
    <div className="min-h-dvh bg-background px-4 py-6" dir="rtl">
      <Dialog
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            leaveForSettings();
          }
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[min(100dvh-24px,100%)] w-[calc(100vw-24px)] gap-4 overflow-y-auto sm:max-w-md"
        >
          <DialogHeader className="space-y-2 pr-10 text-start sm:text-start">
            <DialogTitle className="text-xl font-bold leading-snug">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {copy.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">{copy.securityNotice}</p>
          </div>

          <div
            className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground"
            role="status"
            aria-live="polite"
          >
            {opened ? <p className="font-semibold">{copy.openedHeading}</p> : null}
            <p>{status}</p>
          </div>

          {closeHint ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{closeHint}</p>
          ) : null}

          {returned ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {copy.verificationNote}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 min-h-[44px] w-full whitespace-normal font-bold"
              onClick={openMadrasati}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              {copy.openButton}
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="h-11 min-h-[44px] w-full whitespace-normal font-bold"
              disabled={!opened && !returned}
              onClick={returnToWaraqa}
            >
              {copy.confirmButton}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-[44px] w-full whitespace-normal font-bold"
              onClick={leaveForSettings}
            >
              {copy.backButton}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
