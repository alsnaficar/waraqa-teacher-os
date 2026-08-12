/**
 * Browser automation boundary.
 *
 * The rest of Waraqa must never import Playwright/Puppeteer types.
 * When a real browser package is approved and installed later, implement
 * this interface inside the Madrasati browser adapter package only.
 *
 * Playwright and Puppeteer are NOT installed in this repository today.
 * Do not invent DOM selectors or navigate to Madrasati from this module.
 */

export type BrowserAutomationKind = "none" | "playwright" | "puppeteer";

export class BrowserAutomationUnavailableError extends Error {
  readonly missingPackage: string;

  constructor(
    missingPackage = "playwright",
    message = "Browser automation is not available. Install and wire a server-side package before enabling Madrasati browser sync.",
  ) {
    super(message);
    this.name = "BrowserAutomationUnavailableError";
    this.missingPackage = missingPackage;
  }
}

/**
 * Opaque server-side browser session handle.
 * Must never be serialized to the client or logged with cookies.
 */
export type BrowserSessionHandle = {
  readonly id: string;
};

export interface BrowserAutomation {
  readonly kind: BrowserAutomationKind;

  /** Throws if the underlying package/binary is not available. */
  assertAvailable(): Promise<void>;

  /**
   * Opens an isolated browser context for Madrasati work.
   * Implementations must keep cookies server-side only.
   */
  openSession(): Promise<BrowserSessionHandle>;

  closeSession(session: BrowserSessionHandle): Promise<void>;
}

/**
 * Default automation backend until Playwright/Puppeteer is deliberately added.
 */
export class UnavailableBrowserAutomation implements BrowserAutomation {
  readonly kind = "none" as const;

  async assertAvailable(): Promise<void> {
    throw new BrowserAutomationUnavailableError(
      "playwright",
      "Neither Playwright nor Puppeteer is installed. Madrasati browser sync cannot run until a browser automation package is approved and installed server-side.",
    );
  }

  async openSession(): Promise<BrowserSessionHandle> {
    await this.assertAvailable();
    throw new BrowserAutomationUnavailableError("playwright");
  }

  async closeSession(_session: BrowserSessionHandle): Promise<void> {
    // No-op when unavailable.
  }
}
