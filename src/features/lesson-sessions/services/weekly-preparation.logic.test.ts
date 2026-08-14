import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveSchoolWeekStart,
  schoolWeekDatesFromSunday,
  shiftSchoolWeek,
} from "./weekly-preparation.logic.ts";

describe("weekly-preparation.logic (UTC school week Sun–Thu)", () => {
  it("Sunday anchor resolves to itself and yields Sun–Thu", () => {
    assert.equal(resolveSchoolWeekStart("2026-08-09"), "2026-08-09"); // Sunday
    assert.deepEqual(schoolWeekDatesFromSunday("2026-08-09"), [
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });

  it("Monday anchor snaps to previous Sunday", () => {
    assert.equal(resolveSchoolWeekStart("2026-08-10"), "2026-08-09");
  });

  it("Thursday anchor snaps to previous Sunday", () => {
    assert.equal(resolveSchoolWeekStart("2026-08-13"), "2026-08-09");
  });

  it("Friday anchor snaps to previous Sunday", () => {
    assert.equal(resolveSchoolWeekStart("2026-08-14"), "2026-08-09");
  });

  it("Saturday anchor snaps to previous Sunday", () => {
    assert.equal(resolveSchoolWeekStart("2026-08-15"), "2026-08-09");
  });

  it("exactly 5 dates and never includes Friday/Saturday", () => {
    const dates = schoolWeekDatesFromSunday("2026-08-09");
    assert.equal(dates.length, 5);
    assert.ok(!dates.includes("2026-08-14")); // Friday
    assert.ok(!dates.includes("2026-08-15")); // Saturday
    for (const date of dates) {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      assert.ok(dow >= 0 && dow <= 4, `${date} day=${dow}`);
    }
  });

  it("previous week shifts exactly −7 days", () => {
    assert.equal(shiftSchoolWeek("2026-08-09", -1), "2026-08-02");
    assert.deepEqual(schoolWeekDatesFromSunday(shiftSchoolWeek("2026-08-09", -1)), [
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
    ]);
  });

  it("next week shifts exactly +7 days", () => {
    assert.equal(shiftSchoolWeek("2026-08-09", 1), "2026-08-16");
    assert.deepEqual(schoolWeekDatesFromSunday(shiftSchoolWeek("2026-08-09", 1)), [
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
    ]);
  });

  it("rejects non-Sunday weekStart for schoolWeekDatesFromSunday", () => {
    assert.throws(() => schoolWeekDatesFromSunday("2026-08-10"), /Sunday/);
  });
});
