import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
} from "./browser-automation.ts";

class InspectionAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private readonly page: BrowserPageHandle = Object.freeze({ id: "page-1" });
  private readonly session: BrowserSessionHandle = Object.freeze({
    id: "session-1",
  });

  async assertAvailable(): Promise<void> {}

  async openSession(): Promise<BrowserSessionHandle> {
    return this.session;
  }

  async closeSession(_session: BrowserSessionHandle): Promise<void> {}

  async openPage(_session: BrowserSessionHandle): Promise<BrowserPageHandle> {
    return this.page;
  }

  async closePage(_page: BrowserPageHandle): Promise<void> {}

  async goto(): Promise<void> {}

  async getPageUrl(): Promise<string> {
    return "https://schools.madrasati.sa/";
  }

  async getPageTitle(): Promise<string> {
    return "مدرستي";
  }

  async getPageText(): Promise<string> {
    return "لوحة التحكم الرئيسية";
  }

  async getPageScreenshot(): Promise<Uint8Array> {
    return new Uint8Array([137, 80, 78, 71]);
  }

  async clickPage(
    _page: BrowserPageHandle,
    _x: number,
    _y: number,
  ): Promise<void> {}

  async typePage(
    _page: BrowserPageHandle,
    _text: string,
  ): Promise<void> {}

  async pressPageKey(
    _page: BrowserPageHandle,
    _key: string,
  ): Promise<void> {}
}

describe("Madrasati browser authentication inspection", () => {
  it("reports authenticated when the inspected page is an authenticated Madrasati landing page", async () => {
    const provider = new MadrasatiBrowserAdapter(new InspectionAutomation());

    await provider.connect();

    const page = await provider.inspectAuthenticationPage();

    assert.equal(page.authenticationState, "authenticated");
    assert.equal(page.url, "https://schools.madrasati.sa/");
  });
});
