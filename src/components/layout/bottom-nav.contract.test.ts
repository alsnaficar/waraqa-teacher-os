import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { BOTTOM_NAV_ITEMS } from "./bottom-nav.tsx";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.9A live bottom navigation", () => {
  it("restores reports with approved seven-item order", () => {
    assert.equal(BOTTOM_NAV_ITEMS.length, 7);
    assert.deepEqual(
      BOTTOM_NAV_ITEMS.map((item) => item.to),
      [
        "/dashboard",
        "/planner",
        "/homework",
        "/tests",
        "/corrections",
        "/reports",
        "/settings",
      ],
    );

    assert.deepEqual(
      BOTTOM_NAV_ITEMS.map((item) => item.label),
      [
        "الرئيسية",
        "الجدول",
        "الواجبات",
        "الاختبارات",
        "التصحيح",
        "التقارير",
        "الإعدادات",
      ],
    );
  });

  it("uses seven columns; reports present; lesson-sessions not a BottomNav destination", () => {
    const source = readFileSync(path.join(here, "bottom-nav.tsx"), "utf8");
    assert.match(source, /grid-cols-7/);
    assert.match(source, /["']\/homework["']/);
    assert.match(source, /["']\/tests["']/);
    assert.match(source, /["']\/corrections["']/);
    assert.match(source, /["']\/reports["']/);
    assert.match(source, /التقارير/);
    assert.doesNotMatch(source, /["']\/lesson-sessions["']/);
    assert.doesNotMatch(source, /التحضير/);
    assert.doesNotMatch(source, /["']\/weekly-preparation["']/);
    assert.doesNotMatch(source, /تصحيح الواجبات والاختبارات/);
    assert.doesNotMatch(source, /teacher_id\s*[:=]/);
    assert.doesNotMatch(source, /createClient|supabase\.from|\.from\(/);
  });

  it("authenticated shell still mounts BottomNav", () => {
    const shell = readFileSync(
      path.join(here, "../../routes/_authenticated/route.tsx"),
      "utf8",
    );
    assert.match(shell, /BottomNav/);
    assert.match(shell, /authenticated-shell-offset/);
    assert.doesNotMatch(shell, /pb-32/);
  });

  it("homework, tests, corrections, and reports routes exist", () => {
    const homework = readFileSync(
      path.join(here, "../../routes/_authenticated/homework.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      path.join(here, "../../routes/_authenticated/tests.tsx"),
      "utf8",
    );
    const corrections = readFileSync(
      path.join(here, "../../routes/_authenticated/corrections.tsx"),
      "utf8",
    );
    const reports = readFileSync(
      path.join(here, "../../routes/_authenticated/reports.tsx"),
      "utf8",
    );
    assert.match(homework, /createFileRoute\(["']\/_authenticated\/homework["']\)/);
    assert.match(tests, /createFileRoute\(["']\/_authenticated\/tests["']\)/);
    assert.match(corrections, /createFileRoute\(["']\/_authenticated\/corrections["']\)/);
    assert.match(reports, /createFileRoute\(["']\/_authenticated\/reports["']\)/);
  });
});

describe("TASK 25.38 mobile bottom navigation safe area", () => {
  const source = readFileSync(path.join(here, "bottom-nav.tsx"), "utf8");
  const styles = readFileSync(path.join(here, "../../styles.css"), "utf8");
  const shell = readFileSync(
    path.join(here, "../../routes/_authenticated/route.tsx"),
    "utf8",
  );
  const root = readFileSync(path.join(here, "../../routes/__root.tsx"), "utf8");

  it("applies additive env(safe-area-inset-bottom) with a 0px fallback", () => {
    assert.match(source, /bottom-nav-safe-area/);
    assert.match(styles, /\.bottom-nav-safe-area/);
    assert.match(styles, /env\(safe-area-inset-bottom,\s*0px\)/);
    assert.match(
      styles,
      /padding-bottom:\s*calc\(0px \+ env\(safe-area-inset-bottom,\s*0px\)\)/,
    );
    assert.doesNotMatch(source, /paddingBottom:\s*["']20px["']/);
    assert.doesNotMatch(source, /paddingBottom:\s*["']24px["']/);
    assert.doesNotMatch(source, /paddingBottom:\s*["']30px["']/);
    assert.doesNotMatch(styles, /padding-bottom:\s*20px/);
    assert.doesNotMatch(styles, /padding-bottom:\s*24px/);
    assert.doesNotMatch(styles, /padding-bottom:\s*30px/);
  });

  it("enables viewport-fit=cover so Android reports the inset", () => {
    assert.match(root, /viewport-fit=cover/);
  });

  it("keeps the existing 8rem page spacer and adds the same inset", () => {
    assert.match(shell, /authenticated-shell-offset/);
    assert.match(styles, /\.authenticated-shell-offset/);
    assert.match(styles, /padding-bottom:\s*8rem;/);
    assert.match(
      styles,
      /padding-bottom:\s*calc\(8rem \+ env\(safe-area-inset-bottom,\s*0px\)\)/,
    );
    assert.doesNotMatch(shell, /pb-32/);
    assert.doesNotMatch(shell, /pb-40|pb-36|pb-24/);
  });

  it("preserves seven destinations, labels, and mobile item metrics", () => {
    assert.equal(BOTTOM_NAV_ITEMS.length, 7);
    assert.deepEqual(
      BOTTOM_NAV_ITEMS.map((item) => item.to),
      [
        "/dashboard",
        "/planner",
        "/homework",
        "/tests",
        "/corrections",
        "/reports",
        "/settings",
      ],
    );
    assert.deepEqual(
      BOTTOM_NAV_ITEMS.map((item) => item.label),
      [
        "الرئيسية",
        "الجدول",
        "الواجبات",
        "الاختبارات",
        "التصحيح",
        "التقارير",
        "الإعدادات",
      ],
    );
    assert.match(source, /grid-cols-7/);
    assert.match(source, /min-h-\[44px\]/);
    assert.match(source, /h-5 w-5/);
    assert.match(source, /h-9 w-9/);
    assert.match(source, /text-\[10px\]/);
    assert.match(source, /py-2\.5/);
    assert.match(source, /rounded-t-\[24px\]/);
    assert.match(source, /fixed inset-x-0 bottom-0/);
    assert.doesNotMatch(source, /md:hidden|lg:hidden|sm:hidden/);
    assert.doesNotMatch(source, /translate-y|translateY/);
    assert.doesNotMatch(source, /dir=["']ltr["']/);
  });

  it("does not overflow at 320–430px: columns shrink and labels truncate", () => {
    assert.match(source, /min-w-0/);
    assert.match(source, /truncate/);
    assert.match(source, /px-0\.5/);
    assert.match(source, /max-w-3xl/);
    assert.doesNotMatch(source, /overflow-x-auto/);
    assert.doesNotMatch(source, /min-w-\[(?:3|4|5)\d{2}px\]/);
  });
});

describe("TASK 25.38I touch-device bottom-nav 48px floor", () => {
  const source = readFileSync(path.join(here, "bottom-nav.tsx"), "utf8");
  const styles = readFileSync(path.join(here, "../../styles.css"), "utf8");
  const shell = readFileSync(
    path.join(here, "../../routes/_authenticated/route.tsx"),
    "utf8",
  );
  const root = readFileSync(path.join(here, "../../routes/__root.tsx"), "utf8");

  const coarseBlock = styles.slice(
    styles.indexOf("@media (pointer: coarse)"),
    styles.indexOf("@layer base"),
  );

  it("uses a pointer:coarse 48px max() floor and keeps env(safe-area-inset-bottom)", () => {
    assert.match(styles, /@media \(pointer: coarse\)/);
    assert.doesNotMatch(styles, /@media \(max-width: 767px\)/);
    assert.match(
      coarseBlock,
      /padding-bottom:\s*max\(48px,\s*env\(safe-area-inset-bottom,\s*0px\)\)/,
    );
    assert.match(
      coarseBlock,
      /padding-bottom:\s*calc\(8rem \+ max\(48px,\s*env\(safe-area-inset-bottom,\s*0px\)\)\)/,
    );
    assert.doesNotMatch(coarseBlock, /max\(32px/);
    assert.match(root, /viewport-fit=cover/);
    assert.match(source, /bottom-nav-safe-area/);
    assert.match(shell, /authenticated-shell-offset/);
  });

  it("does not apply the 48px floor to fine-pointer desktop base rules", () => {
    const desktopNav = styles.slice(
      styles.indexOf(".bottom-nav-safe-area"),
      styles.indexOf("@media (pointer: coarse)"),
    );
    assert.match(
      desktopNav,
      /padding-bottom:\s*calc\(0px \+ env\(safe-area-inset-bottom,\s*0px\)\)/,
    );
    assert.match(
      desktopNav,
      /padding-bottom:\s*calc\(8rem \+ env\(safe-area-inset-bottom,\s*0px\)\)/,
    );
    assert.doesNotMatch(desktopNav, /max\(48px/);
    assert.doesNotMatch(desktopNav, /max\(32px/);
    assert.doesNotMatch(source, /md:hidden|lg:hidden|sm:hidden/);
    assert.doesNotMatch(source, /translate-y|translateY/);
    assert.doesNotMatch(source, /navigator\.userAgent|userAgent/);
    assert.doesNotMatch(source, /visualViewport/);
  });

  it("keeps seven destinations and does not change routes or item metrics", () => {
    assert.equal(BOTTOM_NAV_ITEMS.length, 7);
    assert.deepEqual(
      BOTTOM_NAV_ITEMS.map((item) => item.to),
      [
        "/dashboard",
        "/planner",
        "/homework",
        "/tests",
        "/corrections",
        "/reports",
        "/settings",
      ],
    );
    assert.deepEqual(
      BOTTOM_NAV_ITEMS.map((item) => item.label),
      [
        "الرئيسية",
        "الجدول",
        "الواجبات",
        "الاختبارات",
        "التصحيح",
        "التقارير",
        "الإعدادات",
      ],
    );
    assert.match(source, /grid-cols-7/);
    assert.match(source, /min-h-\[44px\]/);
    assert.match(source, /h-5 w-5/);
    assert.match(source, /h-9 w-9/);
    assert.match(source, /text-\[10px\]/);
    assert.match(source, /py-2\.5/);
    assert.match(source, /fixed inset-x-0 bottom-0/);
    assert.doesNotMatch(source, /["']\/lesson-sessions["']/);
    assert.doesNotMatch(source, /["']\/weekly-preparation["']/);
  });
});
