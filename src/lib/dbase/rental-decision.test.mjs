import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const sourcePath = resolve("src/lib/dbase/rental-decision.ts");
  const source = await readFile(sourcePath, "utf8");
  const outputPath = resolve(".tmp/tests/dbase-rental-decision.mjs");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: sourcePath,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpiled.outputText, "utf8");
  return import(`${outputPath}?t=${Date.now()}`);
}

test("itemQuantity: 시간제 미설정이면 1, 설정값이 있으면 그 값", async () => {
  const { itemQuantity } = await loadModule();
  assert.equal(itemQuantity({ isTimeLimited: true, quantity: null }), 1);
  assert.equal(
    itemQuantity({ isTimeLimited: true, quantity: undefined }),
    1
  );
  assert.equal(itemQuantity({ isTimeLimited: true, quantity: 3 }), 3);
});

test("decideRentalAction: 비시간제는 항상 'log'", async () => {
  const { decideRentalAction } = await loadModule();
  assert.equal(decideRentalAction({ isTimeLimited: false }, 0), "log");
  assert.equal(decideRentalAction({ isTimeLimited: false }, 99), "log");
});

test("decideRentalAction: 시간제는 잔여 있으면 'hold', 없으면 'queue'", async () => {
  const { decideRentalAction } = await loadModule();
  const item = { isTimeLimited: true, quantity: 2 };
  assert.equal(decideRentalAction(item, 0), "hold");
  assert.equal(decideRentalAction(item, 1), "hold");
  assert.equal(decideRentalAction(item, 2), "queue");
  assert.equal(decideRentalAction(item, 3), "queue");
});

test("decideRentalAction: 수량 미설정 시간제는 N=1로 동작", async () => {
  const { decideRentalAction } = await loadModule();
  const item = { isTimeLimited: true, quantity: null };
  assert.equal(decideRentalAction(item, 0), "hold");
  assert.equal(decideRentalAction(item, 1), "queue");
});
