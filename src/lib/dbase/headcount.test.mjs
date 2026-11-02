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

const empty = {
  childMale: 0,
  childFemale: 0,
  youthMale: 0,
  youthFemale: 0,
  adultMale: 0,
  adultFemale: 0,
};

test("assertValidHeadcount accepts a total that matches the 6 buckets", async () => {
  const { assertValidHeadcount } = await loadModule();

  // 청소년 1명 + 보호자(성인) 2명
  assert.doesNotThrow(() =>
    assertValidHeadcount({
      ...empty,
      totalCount: 3,
      youthMale: 1,
      adultMale: 1,
      adultFemale: 1,
    })
  );
});

test("assertValidHeadcount rejects a total that does not match the buckets", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () => assertValidHeadcount({ ...empty, totalCount: 5, youthMale: 1 }),
    /총 인원은 세부 인원 합계와 같아야 합니다/
  );
});

test("assertValidHeadcount rejects an empty visit", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () => assertValidHeadcount({ ...empty, totalCount: 0 }),
    /총 인원은 최소 1명 이상이어야 합니다/
  );
});

test("assertValidHeadcount rejects negative values", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () =>
      assertValidHeadcount({
        ...empty,
        totalCount: 1,
        childMale: -1,
        adultFemale: 2,
      }),
    /인원 수는 0명 이상이어야 합니다/
  );
});

test("toVisitSessionBuckets keeps a mixed group's tiers as entered", async () => {
  const { toVisitSessionBuckets } = await loadModule();

  assert.deepEqual(
    toVisitSessionBuckets({
      totalCount: 4,
      childMale: 0,
      childFemale: 1,
      youthMale: 1,
      youthFemale: 0,
      adultMale: 1,
      adultFemale: 1,
    }),
    {
      childMale: 0,
      childFemale: 1,
      youthMale: 1,
      youthFemale: 0,
      adultMale: 1,
      adultFemale: 1,
    }
  );
});

test("getGenderTotals sums 남/여 across tiers", async () => {
  const { getGenderTotals } = await loadModule();

  assert.deepEqual(
    getGenderTotals({
      childMale: 1,
      childFemale: 2,
      youthMale: 3,
      youthFemale: 0,
      adultMale: 1,
      adultFemale: 1,
    }),
    { male: 5, female: 3 }
  );
});

test("fromLegacyGenderHeadcount puts an old 남/여 payload in the visitor's tier", async () => {
  const { fromLegacyGenderHeadcount, getHeadcountBucketSum } = await loadModule();

  for (const [tier, maleKey, femaleKey] of [
    ["child", "childMale", "childFemale"],
    ["youth", "youthMale", "youthFemale"],
    ["adult", "adultMale", "adultFemale"],
  ]) {
    const headcount = fromLegacyGenderHeadcount(
      { totalCount: 4, male: 1, female: 3 },
      tier
    );
    assert.equal(headcount[maleKey], 1, `tier=${tier}`);
    assert.equal(headcount[femaleKey], 3, `tier=${tier}`);
    assert.equal(getHeadcountBucketSum(headcount), 4, `tier=${tier}`);
  }
});
