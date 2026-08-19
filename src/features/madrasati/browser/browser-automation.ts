/**
 * Browser automation boundary.
 *
 * Playwright/Puppeteer types must never escape this boundary.
 * Cookies, browser contexts and pages remain server-side.
 */

import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";
import type { MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

export type BrowserAutomationKind = "none" | "playwright" | "puppeteer";

export type BrowserSessionOpenOptions = {
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
};

export class BrowserAutomationUnavailableError extends Error {
  readonly missingPackage: string;

  constructor(
    missingPackage = "playwright",
    message = "Browser automation is not available.",
  ) {
    super(message);
    this.name = "BrowserAutomationUnavailableError";
    this.missingPackage = missingPackage;
  }
}

/**
 * Opaque server-side browser session handle.
 * Never serialize this with browser state, cookies or page objects.
 */
export type BrowserSessionHandle = {
  readonly id: string;
};

/**
 * Opaque server-side page handle.
 * Never expose Playwright Page objects outside the browser adapter.
 */
export type BrowserPageHandle = {
  readonly id: string;
};

export interface BrowserAutomation {
  readonly kind: BrowserAutomationKind;

  assertAvailable(): Promise<void>;

  openSession(
    options?: BrowserSessionOpenOptions,
  ): Promise<BrowserSessionHandle>;

  closeSession(session: BrowserSessionHandle): Promise<void>;

  openPage(session: BrowserSessionHandle): Promise<BrowserPageHandle>;

  closePage(page: BrowserPageHandle): Promise<void>;

  goto(
    page: BrowserPageHandle,
    url: string,
    options?: {
      timeoutMs?: number;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    },
  ): Promise<void>;

  getPageUrl(page: BrowserPageHandle): Promise<string>;

  getPageTitle(page: BrowserPageHandle): Promise<string>;

  getPageText(page: BrowserPageHandle): Promise<string>;

  /**
   * Returns a PNG screenshot of the current server-side page.
   *
   * Browser/page objects and cookies remain server-side.
   */
  getPageScreenshot(page: BrowserPageHandle): Promise<Uint8Array>;
  clickPage(
    page: BrowserPageHandle,
    x: number,
    y: number,
  ): Promise<void>;

  typePage(
    page: BrowserPageHandle,
    text: string,
  ): Promise<void>;

  pressPageKey(
    page: BrowserPageHandle,
    key: string,
  ): Promise<void>;

  /**
   * Focuses a visible editable control.
   * A visible password is used when no visible email/text field remains
   * (Microsoft password step). Otherwise email/text is preferred.
   * Must never return the control value, HTML, cookies, or Playwright objects.
   */
  focusEditableControl(page: BrowserPageHandle): Promise<void>;

  /**
   * Starts Chromium CDP screencast for the page when the backend supports it.
   * Fail-soft: callers may fall back to PNG screenshots.
   */
  startPageLiveView(page: BrowserPageHandle): Promise<void>;

  stopPageLiveView(page: BrowserPageHandle): Promise<void>;

  getPageLiveFrame(page: BrowserPageHandle): Promise<MadrasatiLiveFrame>;

  /**
   * Describes the currently focused control. Must never include the value,
   * cookies, HTML, or credentials.
   */
  inspectFocusedControl(
    page: BrowserPageHandle,
  ): Promise<MadrasatiFocusedControl>;

  /**
   * Semantic landmarks for the current page: visible text, accessible names,
   * and labeled values. Never includes HTML, cookies, or Playwright objects.
   */
  readPageLandmarks(page: BrowserPageHandle): Promise<MadrasatiPageLandmarks>;

  /**
   * Clicks the first control whose accessible name matches one of the names.
   * Returns false when none are present.
   */
  clickControlByAccessibleName(
    page: BrowserPageHandle,
    names: readonly string[],
  ): Promise<boolean>;

  /**
   * Waits until the page's visible text includes the needle.
   */
  waitForPageText(
    page: BrowserPageHandle,
    needle: string,
    timeoutMs?: number,
  ): Promise<boolean>;

  /**
   * Subscribes to live JPEG frames for a page. The unsubscribe function
   * must be called on page/session close.
   */
  subscribePageLiveFrame(
    page: BrowserPageHandle,
    listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void;
}

/**
 * Fail-closed implementation used when no browser backend is available.
 */
export class UnavailableBrowserAutomation implements BrowserAutomation {
  readonly kind = "none" as const;

  async assertAvailable(): Promise<void> {
    throw new BrowserAutomationUnavailableError(
      "playwright",
      "Browser automation is not available. Install and wire a server-side browser backend before enabling Madrasati browser sync.",
    );
  }

  async openSession(
    _options?: BrowserSessionOpenOptions,
  ): Promise<BrowserSessionHandle> {
    await this.assertAvailable();
    throw new BrowserAutomationUnavailableError("playwright");
  }

  async closeSession(_session: BrowserSessionHandle): Promise<void> {
    // No-op.
  }

  async openPage(
    _session: BrowserSessionHandle,
  ): Promise<BrowserPageHandle> {
    await this.assertAvailable();
    throw new BrowserAutomationUnavailableError("playwright");
  }

  async closePage(_page: BrowserPageHandle): Promise<void> {
    // No-op.
  }

  async goto(
    _page: BrowserPageHandle,
    _url: string,
  ): Promise<void> {
    await this.assertAvailable();
  }

  async getPageUrl(_page: BrowserPageHandle): Promise<string> {
    await this.assertAvailable();
    return "";
  }

  async getPageTitle(_page: BrowserPageHandle): Promise<string> {
    await this.assertAvailable();
    return "";
  }

  async getPageText(_page: BrowserPageHandle): Promise<string> {
    await this.assertAvailable();
    return "";
  }

  async getPageScreenshot(_page: BrowserPageHandle): Promise<Uint8Array> {
    await this.assertAvailable();
    return new Uint8Array();
  }

  async clickPage(
    _page: BrowserPageHandle,
    _x: number,
    _y: number,
  ): Promise<void> {
    await this.assertAvailable();
  }

  async typePage(
    _page: BrowserPageHandle,
    _text: string,
  ): Promise<void> {
    await this.assertAvailable();
  }

  async pressPageKey(
    _page: BrowserPageHandle,
    _key: string,
  ): Promise<void> {
    await this.assertAvailable();
  }

  async focusEditableControl(_page: BrowserPageHandle): Promise<void> {
    await this.assertAvailable();
  }

  async startPageLiveView(_page: BrowserPageHandle): Promise<void> {
    await this.assertAvailable();
  }

  async stopPageLiveView(_page: BrowserPageHandle): Promise<void> {
    // No-op.
  }

  async getPageLiveFrame(
    _page: BrowserPageHandle,
  ): Promise<MadrasatiLiveFrame> {
    await this.assertAvailable();
    throw new BrowserAutomationUnavailableError("playwright");
  }

  async inspectFocusedControl(
    _page: BrowserPageHandle,
  ): Promise<MadrasatiFocusedControl> {
    await this.assertAvailable();
    return { isEditable: false, inputType: "none" };
  }

  async readPageLandmarks(
    _page: BrowserPageHandle,
  ): Promise<MadrasatiPageLandmarks> {
    await this.assertAvailable();
    throw new BrowserAutomationUnavailableError("playwright");
  }

  async clickControlByAccessibleName(
    _page: BrowserPageHandle,
    _names: readonly string[],
  ): Promise<boolean> {
    await this.assertAvailable();
    return false;
  }

  async waitForPageText(
    _page: BrowserPageHandle,
    _needle: string,
    _timeoutMs?: number,
  ): Promise<boolean> {
    await this.assertAvailable();
    return false;
  }

  subscribePageLiveFrame(
    _page: BrowserPageHandle,
    _listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void {
    return () => undefined;
  }
}
