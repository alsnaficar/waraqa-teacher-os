/**
 * Browser automation boundary.
 *
 * Playwright/Puppeteer types must never escape this boundary.
 * Cookies, browser contexts and pages remain server-side.
 */

export type BrowserAutomationKind = "none" | "playwright" | "puppeteer";

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

  openSession(): Promise<BrowserSessionHandle>;

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

  async openSession(): Promise<BrowserSessionHandle> {
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
}
