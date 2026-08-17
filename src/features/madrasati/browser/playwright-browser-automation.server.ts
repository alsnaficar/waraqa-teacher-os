import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
} from "./browser-automation.ts";

type SessionRecord = {
  readonly context: BrowserContext;
  readonly pages: Map<string, Page>;
};

export class PlaywrightBrowserAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private browser: Browser | null = null;

  private readonly sessions = new Map<string, SessionRecord>();

  async assertAvailable(): Promise<void> {
    await this.ensureBrowser();
  }

  async openSession(): Promise<BrowserSessionHandle> {
    await this.ensureBrowser();

    const context = await this.browser!.newContext();

    const id = randomUUID();

    this.sessions.set(id, {
      context,
      pages: new Map(),
    });

    return Object.freeze({ id });
  }

  async closeSession(session: BrowserSessionHandle): Promise<void> {
    const record = this.sessions.get(session.id);

    if (!record) return;

    this.sessions.delete(session.id);

    await Promise.allSettled([...record.pages.values()].map((page) => page.close()));

    await record.context.close();
  }

  async openPage(session: BrowserSessionHandle): Promise<BrowserPageHandle> {
    const record = this.requireSession(session);

    const page = await record.context.newPage();

    const id = randomUUID();

    record.pages.set(id, page);

    return Object.freeze({ id });
  }

  async closePage(page: BrowserPageHandle): Promise<void> {
    const record = this.findPage(page);

    if (!record) return;

    const { session, pageObject } = record;

    session.pages.delete(page.id);

    await pageObject.close();
  }

  async goto(
    page: BrowserPageHandle,
    url: string,
    options: {
      timeoutMs?: number;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    } = {},
  ): Promise<void> {
    const pageObject = this.requirePage(page);

    await pageObject.goto(url, {
      timeout: options.timeoutMs ?? 30000,
      waitUntil: options.waitUntil ?? "domcontentloaded",
    });
  }

  async getPageUrl(page: BrowserPageHandle): Promise<string> {
    return this.requirePage(page).url();
  }

  async getPageTitle(page: BrowserPageHandle): Promise<string> {
    return this.requirePage(page).title();
  }

  async getPageText(page: BrowserPageHandle): Promise<string> {
    return this.requirePage(page).locator("body").innerText();
  }

  async getPageScreenshot(page: BrowserPageHandle): Promise<Uint8Array> {
    const buffer = await this.requirePage(page).screenshot({
      type: "png",
      fullPage: false,
    });

    return new Uint8Array(buffer);
  }

  async clickPage(
    page: BrowserPageHandle,
    x: number,
    y: number,
  ): Promise<void> {
    const pageObject = this.requirePage(page);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("Browser click coordinates must be finite numbers.");
    }

    if (x < 0 || y < 0) {
      throw new Error("Browser click coordinates cannot be negative.");
    }

    await pageObject.mouse.click(x, y);
  }

  async typePage(
    page: BrowserPageHandle,
    text: string,
  ): Promise<void> {
    const pageObject = this.requirePage(page);

    if (typeof text !== "string") {
      throw new Error("Browser text input must be a string.");
    }

    await pageObject.keyboard.insertText(text);
  }

  async pressPageKey(
    page: BrowserPageHandle,
    key: string,
  ): Promise<void> {
    const pageObject = this.requirePage(page);

    const normalizedKey = key?.trim();

    if (!normalizedKey) {
      throw new Error("Browser key is required.");
    }

    await pageObject.keyboard.press(normalizedKey);
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.keys()];

    await Promise.allSettled(sessions.map((id) => this.closeSession(Object.freeze({ id }))));

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser) return;

    const resolverIp = await this.resolveMadrasatiEndpoint();

    this.browser = await chromium.launch({
      headless: true,
      args: [`--host-resolver-rules=MAP schools.madrasati.sa ${resolverIp}`],
    });
  }

  private async resolveMadrasatiEndpoint(): Promise<string> {
    const configuredIp = process.env.MADRASATI_ENDPOINT_IP?.trim();

    if (configuredIp) {
      return configuredIp;
    }

    const endpointHosts = [
      "uaenemadrasatiw03.uaenorth.cloudapp.azure.com",
      "uaenemadrasatiw10.uaenorth.cloudapp.azure.com",
    ];

    for (const hostname of endpointHosts) {
      try {
        const result = await lookup(hostname, {
          family: 4,
        });

        if (result.address) {
          return result.address;
        }
      } catch {
        // Try the next known Madrasati endpoint.
      }
    }

    throw new Error("تعذر اكتشاف عنوان خادم منصة مدرستي تلقائيًا.");
  }

  private requireSession(session: BrowserSessionHandle): SessionRecord {
    const record = this.sessions.get(session.id);

    if (!record) {
      throw new Error(`Unknown browser session: ${session.id}`);
    }

    return record;
  }

  private requirePage(page: BrowserPageHandle): Page {
    const found = this.findPage(page);

    if (!found) {
      throw new Error(`Unknown browser page: ${page.id}`);
    }

    return found.pageObject;
  }

  private findPage(page: BrowserPageHandle): {
    session: SessionRecord;
    pageObject: Page;
  } | null {
    for (const session of this.sessions.values()) {
      const pageObject = session.pages.get(page.id);

      if (pageObject) {
        return {
          session,
          pageObject,
        };
      }
    }

    return null;
  }
}
