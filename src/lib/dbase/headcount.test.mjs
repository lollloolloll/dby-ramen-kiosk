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

test("assertValidHeadcount accepts a total that matches 남 + 여", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.doesNotThrow(() =>
    assertValidHeadcount({ totalCount: 4, male: 1, female: 3 })
  );
});

test("assertValidHeadcount rejects a total that does not match 남 + 여", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () => assertValidHeadcount({ totalCount: 5, male: 1, female: 3 }),
    /총 인원은 남녀 인원 합계와 같아야 합니다/
  );
});

test("assertValidHeadcount rejects an empty visit", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () => assertValidHeadcount({ totalCount: 0, male: 0, female: 0 }),
    /총 인원은 최소 1명 이상이어야 합니다/
  );
});

test("assertValidHeadcount rejects negative values", async () => {
  const { assertValidHeadcount } = await loadModule();

  assert.throws(
    () => assertValidHeadcount({ totalCount: 1, male: -1, female: 2 }),
    /인원 수는 0명 이상이어야 합니다/
  );
});

test("toVisitSessionBuckets puts an adult visitor's group in the 성인 buckets", async () => {
  const { toVisitSessionBuckets } = await loadModule();

  // 본인이 성인이면 그 방문 인원 전체가 성인 남/여로 기록된다
  assert.deepEqual(
    toVisitSessionBuckets({ totalCount: 4, male: 1, female: 3 }, "adult"),
    {
      childMale: 0,
      childFemale: 0,
      youthMale: 0,
      youthFemale: 0,
      adultMale: 1,
      adultFemale: 3,
    }
  );
});

test("toVisitSessionBuckets puts a youth visitor's group in the 청소년 buckets", async () => {
  const { toVisitSessionBuckets } = await loadModule();

  assert.deepEqual(
    toVisitSessionBuckets({ totalCount: 4, male: 2, female: 2 }, "youth"),
    {
      childMale: 0,
      childFemale: 0,
      youthMale: 2,
      youthFemale: 2,
      adultMale: 0,
      adultFemale: 0,
    }
  );
});

test("toVisitSessionBuckets puts a child visitor's group in the 아동 buckets", async () => {
  const { toVisitSessionBuckets } = await loadModule();

  assert.deepEqual(
    toVisitSessionBuckets({ totalCount: 3, male: 1, female: 2 }, "child"),
    {
      childMale: 1,
      childFemale: 2,
      youthMale: 0,
      youthFemale: 0,
      adultMale: 0,
      adultFemale: 0,
    }
  );
});

test("toVisitSessionBuckets keeps the bucket total equal to the headcount", async () => {
  const { toVisitSessionBuckets, getHeadcountBucketSum } = await loadModule();

  const headcount = { totalCount: 4, male: 1, female: 3 };
  for (const tier of ["child", "youth", "adult"]) {
    const buckets = toVisitSessionBuckets(headcount, tier);
    const sum = Object.values(buckets).reduce((a, b) => a + b, 0);
    assert.equal(sum, getHeadcountBucketSum(headcount), `tier=${tier}`);
    assert.equal(sum, headcount.totalCount, `tier=${tier}`);
  }
});
