import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const sourcePath = resolve("src/lib/dbase/session.ts");
  const source = await readFile(sourcePath, "utf8");
  const outputPath = resolve(".tmp/tests/dbase-session.mjs");
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

test("formatDbaseHeadcount summarizes preserved visit-session distribution", async () => {
  const { formatDbaseHeadcount } = await loadModule();

  assert.equal(
    formatDbaseHeadcount({
      totalCount: 8,
      childMale: 2,
      childFemale: 1,
      youthMale: 2,
      youthFemale: 1,
      adultMale: 1,
      adultFemale: 1,
    }),
    "총 8명 · 아동 남 2, 여 1 · 청소년 남 2, 여 1 · 성인 남 1, 여 1"
  );
});

test("formatDbaseHeadcount treats pre-아동 sessions (null buckets) as zero", async () => {
  const { formatDbaseHeadcount } = await loadModule();

  // 아동 집계 도입 이전에 저장된 행 — child_male/child_female이 null일 수 있다
  assert.equal(
    formatDbaseHeadcount({
      totalCount: 5,
      childMale: null,
      childFemale: null,
      youthMale: 2,
      youthFemale: 1,
      adultMale: 1,
      adultFemale: 1,
    }),
    "총 5명 · 아동 남 0, 여 0 · 청소년 남 2, 여 1 · 성인 남 1, 여 1"
  );
});

test("formatDbaseHeadcount returns a dash when the record is not a D.BASE visit session", async () => {
  const { formatDbaseHeadcount } = await loadModule();

  assert.equal(formatDbaseHeadcount(null), "-");
});
