import { MadrasatiBrowserAdapter } from "../browser/madrasati-browser-adapter.server.ts";
import type { BrowserAutomation } from "../browser/browser-automation.ts";
import { PlaywrightBrowserAutomation } from "../browser/playwright-browser-automation.server.ts";
import { MockMadrasatiProvider } from "../mock/mock-madrasati-provider.ts";
import type { MadrasatiProvider } from "../provider/madrasati-provider.ts";

export type MadrasatiProviderMode = "mock" | "browser";

export interface CreateMadrasatiProviderOptions {
  mode?: MadrasatiProviderMode;
  /** Injected only for tests / future Playwright wiring. */
  browserAutomation?: BrowserAutomation;
}

/**
 * Factory so consumers depend on MadrasatiProvider, not a concrete class.
 * Default is mock until a real browser backend is approved and Madrasati is available.
 */
export function createMadrasatiProvider(
  options: CreateMadrasatiProviderOptions = {},
): MadrasatiProvider {
  const mode = options.mode ?? "mock";

  if (mode === "browser") {
    return new MadrasatiBrowserAdapter(
      options.browserAutomation ?? new PlaywrightBrowserAutomation(),
    );
  }

  return new MockMadrasatiProvider();
}
