import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  return import(`${outputPath}?t=${Date.now()}`);
}

test("formatDbaseHeadcount summarizes preserved visit-session distribution", async () => {
  const { formatDbaseHeadcount } = await loadModule();

  assert.equal(
    formatDbaseHeadcount({
      totalCount: 5,
      youthMale: 2,
      youthFemale: 1,
      adultMale: 1,
      adultFemale: 1,
    }),
    "총 5명 · 청소년 남 2, 여 1 · 성인 남 1, 여 1"
  );
});

test("formatDbaseHeadcount returns a dash when the record is not a D.BASE visit session", async () => {
  const { formatDbaseHeadcount } = await loadModule();

  assert.equal(formatDbaseHeadcount(null), "-");
});
