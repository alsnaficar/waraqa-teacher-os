import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
  BrowserSessionOpenOptions,
} from "./browser-automation.ts";
import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";

class InspectionAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private readonly page: BrowserPageHandle = Object.freeze({ id: "page-1" });
  private readonly session: BrowserSessionHandle = Object.freeze({
    id: "session-1",
  });

  async assertAvailable(): Promise<void> {}

  async openSession(
    _options?: BrowserSessionOpenOptions,
  ): Promise<BrowserSessionHandle> {
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

  async focusEditableControl(_page: BrowserPageHandle): Promise<void> {}

  async startPageLiveView(_page: BrowserPageHandle): Promise<void> {}

  async stopPageLiveView(_page: BrowserPageHandle): Promise<void> {}

  async getPageLiveFrame(_page: BrowserPageHandle): Promise<MadrasatiLiveFrame> {
    return {
      mimeType: "image/png",
      base64: "iVBORw0KGgo=",
      viewportWidth: 390,
      viewportHeight: 844,
    };
  }

  async inspectFocusedControl(
    _page: BrowserPageHandle,
  ): Promise<MadrasatiFocusedControl> {
    return { isEditable: false, inputType: "none" };
  }

  async readPageLandmarks(_page: BrowserPageHandle) {
    return {
      url: await this.getPageUrl(),
      title: await this.getPageTitle(),
      text: await this.getPageText(),
      accessibleNames: [] as string[],
      labeledValues: [] as Array<{ label: string; value: string }>,
      tableRows: [] as Array<{ headers: string[]; cells: string[] }>,
    };
  }

  async clickControlByAccessibleName(
    _page: BrowserPageHandle,
    _names: readonly string[],
  ): Promise<boolean> {
    return false;
  }

  async waitForPageText(
    _page: BrowserPageHandle,
    _needle: string,
    _timeoutMs?: number,
  ): Promise<boolean> {
    return false;
  }

  subscribePageLiveFrame(
    _page: BrowserPageHandle,
    _listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void {
    return () => undefined;
  }
}

describe("Madrasati browser authentication inspection", () => {
  it("reports authenticated when the inspected page is an authenticated Madrasati landing page", async () => {
    const provider = new MadrasatiBrowserAdapter(new InspectionAutomation());

    await provider.connect();

    const page = await provider.inspectAuthenticationPage();

    assert.equal(page.authenticationState, "authenticated");
    assert.equal(page.url, "https://schools.madrasati.sa/");
  });

  it("reports authenticated for a teacher home after Microsoft SSO", async () => {
    class TeacherHomeAutomation extends InspectionAutomation {
      async getPageText(): Promise<string> {
        return "جدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
      }
    }

    const provider = new MadrasatiBrowserAdapter(new TeacherHomeAutomation());
    await provider.connect();
    const page = await provider.inspectAuthenticationPage();

    assert.equal(page.authenticationState, "authenticated");
  });
});
