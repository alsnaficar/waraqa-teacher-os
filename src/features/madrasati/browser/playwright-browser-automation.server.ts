import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";
import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
  BrowserSessionOpenOptions,
} from "./browser-automation.ts";
import {
  mapRemoteDomInputType,
  sanitizeFocusedControl,
  sanitizeLiveFrame,
  type MadrasatiFocusedControl,
  type MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";
import {
  sanitizePageLandmarks,
  type MadrasatiPageLandmarks,
} from "./madrasati-teacher-profile.ts";

type SessionRecord = {
  readonly context: BrowserContext;
  readonly pages: Map<string, Page>;
};

type LiveViewRecord = {
  readonly cdp: CDPSession;
  latestJpegBase64: string | null;
  lastEmittedAt: number;
  readonly listeners: Set<(frame: MadrasatiLiveFrame) => void>;
};

const MIN_LIVE_FRAME_GAP_MS = 80;

export class PlaywrightBrowserAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private browser: Browser | null = null;

  private readonly sessions = new Map<string, SessionRecord>();

  private readonly liveViews = new Map<string, LiveViewRecord>();

  async assertAvailable(): Promise<void> {
    await this.ensureBrowser();
  }

  async openSession(
    options: BrowserSessionOpenOptions = {},
  ): Promise<BrowserSessionHandle> {
    await this.ensureBrowser();

    const context = await this.browser!.newContext({
      viewport: options.viewport,
    });

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

    await Promise.allSettled(
      [...record.pages.keys()].map((pageId) =>
        this.stopPageLiveView(Object.freeze({ id: pageId })),
      ),
    );

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

    await this.stopPageLiveView(page);

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
    const pageObject = this.requirePage(page);
    const chunks: string[] = [];

    for (const frame of pageObject.frames()) {
      try {
        const text = await frame.locator("body").innerText({ timeout: 2500 });
        const trimmed = text.trim();

        if (trimmed) {
          chunks.push(trimmed);
        }
      } catch {
        // Cross-origin frames (Microsoft SSO) cannot be read. Skip them.
      }
    }

    return chunks.join("\n");
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

  async focusEditableControl(page: BrowserPageHandle): Promise<void> {
    const current = await this.inspectFocusedControl(page);

    if (
      current.isEditable &&
      current.inputType !== "protected" &&
      current.inputType !== "none"
    ) {
      return;
    }

    const pageObject = this.requirePage(page);

    for (const frame of pageObject.frames()) {
      try {
        const textboxes = frame.getByRole("textbox");
        const count = await textboxes.count();

        for (let index = 0; index < count; index += 1) {
          const box = textboxes.nth(index);

          if (!(await box.isVisible())) {
            continue;
          }

          const type = ((await box.getAttribute("type")) ?? "text").toLowerCase();

          if (type === "password" || type === "hidden") {
            continue;
          }

          await box.focus({ timeout: 2000 });
          return;
        }
      } catch {
        // Cross-origin frames are expected on Microsoft login.
      }
    }

    const fallbackSelectors = [
      'input[type="email"]',
      'input[name="loginfmt"]',
      'input[type="text"]',
      "input:not([type])",
      "textarea",
    ];

    for (const frame of pageObject.frames()) {
      for (const selector of fallbackSelectors) {
        try {
          const locator = frame.locator(selector).filter({ visible: true });
          const count = await locator.count();

          for (let index = 0; index < count; index += 1) {
            const candidate = locator.nth(index);
            const type = (
              (await candidate.getAttribute("type")) ?? "text"
            ).toLowerCase();

            if (
              type === "password" ||
              type === "hidden" ||
              type === "submit" ||
              type === "button"
            ) {
              continue;
            }

            if (await candidate.isDisabled()) {
              continue;
            }

            await candidate.focus({ timeout: 2000 });
            return;
          }
        } catch {
          // Try the next selector or frame.
        }
      }
    }

    throw new Error("No visible editable control is available to focus.");
  }

  async startPageLiveView(page: BrowserPageHandle): Promise<void> {
    if (this.liveViews.has(page.id)) {
      return;
    }

    const found = this.findPage(page);

    if (!found) {
      throw new Error(`Unknown browser page: ${page.id}`);
    }

    const cdp = await found.session.context.newCDPSession(found.pageObject);

    const record: LiveViewRecord = {
      cdp,
      latestJpegBase64: null,
      lastEmittedAt: 0,
      listeners: new Set(),
    };

    cdp.on("Page.screencastFrame", (event) => {
      record.latestJpegBase64 = event.data;

      void cdp
        .send("Page.screencastFrameAck", {
          sessionId: event.sessionId,
        })
        .catch(() => undefined);

      this.emitLiveFrame(page, record);
    });

    try {
      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 50,
        maxWidth: 720,
        maxHeight: 1560,
        everyNthFrame: 2,
      });
    } catch (error) {
      await cdp.detach().catch(() => undefined);
      throw error;
    }

    this.liveViews.set(page.id, record);
  }

  async stopPageLiveView(page: BrowserPageHandle): Promise<void> {
    const record = this.liveViews.get(page.id);

    if (!record) {
      return;
    }

    this.liveViews.delete(page.id);
    record.listeners.clear();

    await record.cdp.send("Page.stopScreencast").catch(() => undefined);
    await record.cdp.detach().catch(() => undefined);
  }

  async getPageLiveFrame(page: BrowserPageHandle): Promise<MadrasatiLiveFrame> {
    const pageObject = this.requirePage(page);
    const viewport = pageObject.viewportSize() ?? {
      width: 1280,
      height: 720,
    };
    const live = this.liveViews.get(page.id);

    if (live?.latestJpegBase64) {
      return sanitizeLiveFrame({
        mimeType: "image/jpeg",
        base64: live.latestJpegBase64,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });
    }

    const png = await this.getPageScreenshot(page);

    return sanitizeLiveFrame({
      mimeType: "image/png",
      base64: Buffer.from(png).toString("base64"),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
  }

  async inspectFocusedControl(
    page: BrowserPageHandle,
  ): Promise<MadrasatiFocusedControl> {
    const pageObject = this.requirePage(page);

    for (const frame of pageObject.frames()) {
      try {
        const raw = await frame.evaluate(() => {
          const el = document.activeElement;

          if (!(el instanceof HTMLElement)) {
            return { isEditable: false, inputType: "none" };
          }

          const tag = el.tagName.toLowerCase();

          if (tag === "input") {
            const input = el as HTMLInputElement;

            if (input.readOnly || input.disabled) {
              return { isEditable: false, inputType: "none" };
            }

            const domType = (input.getAttribute("type") || "text").toLowerCase();

            return {
              isEditable: true,
              inputType: domType,
            };
          }

          if (tag === "textarea") {
            const area = el as HTMLTextAreaElement;

            if (area.readOnly || area.disabled) {
              return { isEditable: false, inputType: "none" };
            }

            return { isEditable: true, inputType: "text" };
          }

          if (el.isContentEditable) {
            return { isEditable: true, inputType: "text" };
          }

          return { isEditable: false, inputType: "none" };
        });

        const sanitized = sanitizeFocusedControl({
          isEditable: raw.isEditable,
          inputType: mapRemoteDomInputType(String(raw.inputType)),
        });

        if (sanitized.isEditable) {
          return sanitized;
        }
      } catch {
        // Cross-origin frames are expected on Microsoft login. Skip them.
      }
    }

    return { isEditable: false, inputType: "none" };
  }

  async readPageLandmarks(
    page: BrowserPageHandle,
  ): Promise<MadrasatiPageLandmarks> {
    const pageObject = this.requirePage(page);
    const labeledValues: Array<{ label: string; value: string }> = [];
    const accessibleNames: string[] = [];
    const tableRows: Array<{ headers: string[]; cells: string[] }> = [];

    for (const frame of pageObject.frames()) {
      try {
        const part = (await frame.evaluate(`(() => {
          const names = [];
          const labeled = [];
          const rows = [];

          function clean(value) {
            return String(value || "").replace(/\\s+/g, " ").trim();
          }

          const controls = document.querySelectorAll(
            'a, button, [role="button"], [role="link"], [role="menuitem"]',
          );

          for (const el of controls) {
            if (!(el instanceof HTMLElement)) {
              continue;
            }
            const name = clean(el.getAttribute("aria-label") || el.innerText);
            if (name) {
              names.push(name.slice(0, 200));
            }
          }

          for (const dt of document.querySelectorAll("dt")) {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === "DD") {
              labeled.push({
                label: clean(dt.textContent),
                value: clean(dd.textContent),
              });
            }
          }

          for (const label of document.querySelectorAll("label")) {
            const text = clean(label.textContent);
            const controlId = label.getAttribute("for");
            const control = controlId ? document.getElementById(controlId) : null;
            const value =
              control instanceof HTMLInputElement ||
              control instanceof HTMLSelectElement ||
              control instanceof HTMLTextAreaElement
                ? control.value
                : (label.nextElementSibling && label.nextElementSibling.textContent) || "";
            if (text && value) {
              labeled.push({
                label: text,
                value: clean(value),
              });
            }
          }

          const tables = document.querySelectorAll("table");
          for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
            const table = tables[tableIndex];
            const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
            const headers = headerRow
              ? Array.from(headerRow.querySelectorAll("th, td")).map(function(el) {
                  return clean(el.textContent);
                })
              : [];
            const tableRowEls = table.querySelectorAll("tr");
            for (let rowIndex = 0; rowIndex < tableRowEls.length; rowIndex += 1) {
              const cells = Array.from(tableRowEls[rowIndex].querySelectorAll("th, td")).map(
                function(el) {
                  return clean(el.textContent);
                },
              );
              const isHeader =
                headers.length > 0 &&
                cells.length === headers.length &&
                cells.every(function(cell, index) {
                  return cell === headers[index];
                });
              if (isHeader || !cells.some(function(cell) { return cell.length > 0; })) {
                continue;
              }
              rows.push({ headers: headers, cells: cells });
            }
          }

          const grids = document.querySelectorAll('[role="table"], [role="grid"]');
          for (let gridIndex = 0; gridIndex < grids.length; gridIndex += 1) {
            const grid = grids[gridIndex];
            const headers = Array.from(grid.querySelectorAll('[role="columnheader"]')).map(
              function(el) {
                return clean(el.textContent);
              },
            );
            const gridRows = grid.querySelectorAll('[role="row"]');
            for (let rowIndex = 0; rowIndex < gridRows.length; rowIndex += 1) {
              const cells = Array.from(
                gridRows[rowIndex].querySelectorAll(
                  '[role="rowheader"], [role="cell"], [role="gridcell"]',
                ),
              ).map(function(el) {
                return clean(el.textContent);
              });
              if (!cells.some(function(cell) { return cell.length > 0; })) {
                continue;
              }
              rows.push({ headers: headers, cells: cells });
            }
          }

          return { accessibleNames: names, labeledValues: labeled, tableRows: rows };
        })()`)) as {
          accessibleNames: string[];
          labeledValues: Array<{ label: string; value: string }>;
          tableRows: Array<{ headers: string[]; cells: string[] }>;
        };

        accessibleNames.push(...part.accessibleNames);
        labeledValues.push(...part.labeledValues);
        tableRows.push(...(part.tableRows ?? []));
      } catch {
        // Cross-origin frames (Microsoft SSO) cannot be read.
      }
    }

    return sanitizePageLandmarks({
      url: pageObject.url(),
      title: await pageObject.title(),
      text: await this.getPageText(page),
      accessibleNames,
      labeledValues,
      tableRows,
    });
  }

  async clickControlByAccessibleName(
    page: BrowserPageHandle,
    names: readonly string[],
  ): Promise<boolean> {
    const pageObject = this.requirePage(page);
    const roles = ["button", "link", "menuitem"] as const;

    for (const name of names) {
      const needle = name.trim();
      if (!needle) {
        continue;
      }

      for (const frame of pageObject.frames()) {
        for (const role of roles) {
          try {
            const locator = frame.getByRole(role, { name: needle, exact: false });
            if ((await locator.count()) > 0) {
              await locator.first().click({ timeout: 4000 });
              return true;
            }
          } catch {
            // Try the next role or frame.
          }
        }
      }
    }

    return false;
  }

  async waitForPageText(
    page: BrowserPageHandle,
    needle: string,
    timeoutMs = 8000,
  ): Promise<boolean> {
    const pageObject = this.requirePage(page);
    const snippet = needle.trim();

    if (!snippet) {
      return false;
    }

    try {
      await pageObject.waitForFunction(
        (text: string) => (document.body?.innerText ?? "").includes(text),
        snippet,
        { timeout: Math.min(Math.max(timeoutMs, 250), 15000) },
      );
      return true;
    } catch {
      return false;
    }
  }

  subscribePageLiveFrame(
    page: BrowserPageHandle,
    listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void {
    const record = this.liveViews.get(page.id);

    if (!record) {
      return () => undefined;
    }

    record.listeners.add(listener);
    this.emitLiveFrame(page, record, true);

    return () => {
      record.listeners.delete(listener);
    };
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

  private emitLiveFrame(
    page: BrowserPageHandle,
    record: LiveViewRecord,
    force = false,
  ): void {
    if (!record.latestJpegBase64 || record.listeners.size === 0) {
      return;
    }

    const now = Date.now();

    if (!force && now - record.lastEmittedAt < MIN_LIVE_FRAME_GAP_MS) {
      return;
    }

    const found = this.findPage(page);

    if (!found) {
      return;
    }

    const viewport = found.pageObject.viewportSize() ?? {
      width: 390,
      height: 844,
    };

    try {
      const frame = sanitizeLiveFrame({
        mimeType: "image/jpeg",
        base64: record.latestJpegBase64,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });

      record.lastEmittedAt = now;

      for (const listener of record.listeners) {
        listener(frame);
      }
    } catch {
      // A bad frame must not take down the isolated session.
    }
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
