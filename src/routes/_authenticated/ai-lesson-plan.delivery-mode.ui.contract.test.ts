import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("RTL delivery-mode radios: حضوري / عن بعد", () => {
  const page = readFileSync(path.join(here, "ai-lesson-plan.tsx"), "utf8");
  const groupStart = page.indexOf("<RadioGroup");
  const group = page.slice(groupStart, page.indexOf("</RadioGroup>", groupStart) + "</RadioGroup>".length);

  it("defaults to حضوري and places it as the RTL-right option", () => {
    assert.match(page, /useState<"classroom" \| "remote">\("classroom"\)/);
    assert.match(group, /dir="rtl"/);
    assert.ok(group.indexOf("حضوري") < group.indexOf("عن بعد"));
    assert.match(group, /value="classroom"/);
    assert.match(group, /value="remote"/);
  });

  it("puts each radio circle before its Arabic label using ltr option rows", () => {
    const classroom = group.slice(
      group.indexOf("delivery-mode-classroom"),
      group.indexOf("delivery-mode-remote"),
    );
    const remote = group.slice(group.indexOf("delivery-mode-remote"));

    assert.match(classroom, /dir="ltr"/);
    assert.match(remote, /dir="ltr"/);
    assert.match(classroom, /inline-flex min-h-\[44px\] min-w-0 items-center justify-start gap-2/);
    assert.match(remote, /inline-flex min-h-\[44px\] min-w-0 items-center justify-start gap-2/);

    assert.ok(classroom.indexOf("<RadioGroupItem") < classroom.indexOf("حضوري"));
    assert.ok(remote.indexOf("<RadioGroupItem") < remote.indexOf("عن بعد"));
    assert.doesNotMatch(classroom, /حضوري[\s\S]*<RadioGroupItem/);
    assert.doesNotMatch(remote, /عن بعد[\s\S]*<RadioGroupItem/);
  });

  it("keeps two equal-width options without 320px overflow widths", () => {
    assert.match(group, /grid min-w-0 w-full grid-cols-2/);
    assert.doesNotMatch(group, /w-\[3(2|6)0px\]/);
    assert.doesNotMatch(group, /flex-row-reverse/);
  });
});
