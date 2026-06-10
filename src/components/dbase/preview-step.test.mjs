import assert from "node:assert/strict";
import test from "node:test";
import { getDbaseInitialStep } from "./preview-step.ts";

test("opens the contents step only for the dedicated preview URL", () => {
  assert.equal(
    getDbaseInitialStep(new URLSearchParams("preview=1&step=contents")),
    "contents"
  );
  assert.equal(
    getDbaseInitialStep(new URLSearchParams("step=contents")),
    "entry"
  );
  assert.equal(getDbaseInitialStep(new URLSearchParams("preview=1")), "entry");
});
