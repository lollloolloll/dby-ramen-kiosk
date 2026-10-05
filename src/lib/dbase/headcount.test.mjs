import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const sourcePath = resolve("src/lib/dbase/headcount.ts");
  const source = await readFile(sourcePath, "utf8");
  const outputPath = resolve(".tmp/tests/dbase-headcount.mjs");
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
  return import(`${pathToFileURL(outputPath).href}?t=${Date.now()}`);
}

test("assertValidHeadcount accepts a total that matches all six buckets", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.doesNotThrow(() =>
    assertValidHeadcount({
      totalCount: 8,
      childMale: 2,
      childFemale: 1,
      youthMale: 2,
      youthFemale: 1,
      adultMale: 1,
      adultFemale: 1,
    })
  );
});

test("getHeadcountBucketSum counts the 아동 buckets", async () => {
  const { getHeadcountBucketSum } = await loadModule();

  assert.equal(
    getHeadcountBucketSum({
      totalCount: 0,
      childMale: 2,
      childFemale: 1,
      youthMale: 2,
      youthFemale: 1,
      adultMale: 1,
      adultFemale: 1,
    }),
    8
  );
});

test("assertValidHeadcount rejects a total that ignores the 아동 buckets", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () =>
      assertValidHeadcount({
        totalCount: 5,
        childMale: 2,
        childFemale: 1,
        youthMale: 2,
        youthFemale: 1,
        adultMale: 1,
        adultFemale: 1,
      }),
    /총 인원은 세부 인원 합계와 같아야 합니다/
  );
});

test("assertValidHeadcount rejects a total that does not match bucket sum", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () =>
      assertValidHeadcount({
        totalCount: 5,
        childMale: 0,
        childFemale: 0,
        youthMale: 2,
        youthFemale: 1,
        adultMale: 1,
        adultFemale: 0,
      }),
    /총 인원은 세부 인원 합계와 같아야 합니다/
  );
});

test("assertValidHeadcount rejects negative bucket values", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () =>
      assertValidHeadcount({
        totalCount: 1,
        childMale: 0,
        childFemale: 0,
        youthMale: -1,
        youthFemale: 1,
        adultMale: 1,
        adultFemale: 0,
      }),
    /인원 수는 0명 이상이어야 합니다/
  );
});
