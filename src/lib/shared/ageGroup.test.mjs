import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const sourcePath = resolve("src/lib/shared/ageGroup.ts");
  const source = await readFile(sourcePath, "utf8");
  const outputPath = resolve(".tmp/tests/age-group.mjs");
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

const AT = new Date("2026-10-06");

test("resolveAgeGroupKey splits 아동/청소년/성인 at 만 8세 and 만 24세", async () => {
  const { resolveAgeGroupKey } = await loadModule();

  // 만 8세 (아동 경계 안쪽)
  assert.equal(resolveAgeGroupKey("2018-01-01", AT), "child");
  // 만 9세 (청소년 시작)
  assert.equal(resolveAgeGroupKey("2017-01-01", AT), "youth");
  // 만 24세 (청소년 경계 안쪽)
  assert.equal(resolveAgeGroupKey("2002-01-01", AT), "youth");
  // 만 25세 (성인 시작)
  assert.equal(resolveAgeGroupKey("2001-01-01", AT), "adult");
});

test("resolveAgeGroupKey respects the birthday not yet passed this year", async () => {
  const { resolveAgeGroupKey } = await loadModule();

  // 2017-12-31 생 → 2026-10-06 기준 아직 만 8세 → 아동
  assert.equal(resolveAgeGroupKey("2017-12-31", AT), "child");
  // 2017-01-01 생 → 이미 만 9세 → 청소년
  assert.equal(resolveAgeGroupKey("2017-01-01", AT), "youth");
});

test("resolveAgeGroupKey falls back to 청소년 when the birth date is unusable", async () => {
  const { resolveAgeGroupKey } = await loadModule();

  // 방문을 막지 않고 기관 주 이용층으로 기록한다
  assert.equal(resolveAgeGroupKey(null, AT), "youth");
  assert.equal(resolveAgeGroupKey("", AT), "youth");
  assert.equal(resolveAgeGroupKey("몰라요", AT), "youth");
});

test("getAgeGroupLabel returns the 한글 label used by the kiosk notice", async () => {
  const { getAgeGroupLabel } = await loadModule();

  assert.equal(getAgeGroupLabel("2018-01-01", AT), "아동");
  assert.equal(getAgeGroupLabel("2010-05-05", AT), "청소년");
  assert.equal(getAgeGroupLabel("1990-05-05", AT), "성인");
});

test("getAgeGroup keeps the existing 엑셀 연령대 wording", async () => {
  const { getAgeGroup, calculateAge } = await loadModule();

  assert.equal(getAgeGroup(calculateAge("2018-01-01", AT)), "아동");
  assert.equal(getAgeGroup(calculateAge("2010-01-01", AT)), "청소년");
  assert.equal(getAgeGroup(calculateAge("1990-01-01", AT)), "성인");
  assert.equal(getAgeGroup(null), "알 수 없음");
});
