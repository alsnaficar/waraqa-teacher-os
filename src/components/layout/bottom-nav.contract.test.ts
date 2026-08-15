import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { BOTTOM_NAV_ITEMS } from "./bottom-nav.tsx";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.5 live bottom navigation", () => {
  it("includes homework and tests with approved order", () => {
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

  it("uses seven columns; keeps corrections; no teacher_id / no supabase", () => {
    const source = readFileSync(path.join(here, "bottom-nav.tsx"), "utf8");
    assert.match(source, /grid-cols-7/);
    assert.match(source, /["']\/homework["']/);
    assert.match(source, /["']\/tests["']/);
    assert.match(source, /["']\/corrections["']/);
    assert.match(source, /التصحيح/);
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
  });

  it("homework and tests routes exist", () => {
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
    assert.match(homework, /createFileRoute\(["']\/_authenticated\/homework["']\)/);
    assert.match(tests, /createFileRoute\(["']\/_authenticated\/tests["']\)/);
    assert.match(corrections, /createFileRoute\(["']\/_authenticated\/corrections["']\)/);
  });
});
