#!/usr/bin/env node
/**
 * 키오스크 더미 아이템 15개 시드.
 * 사용: `node scripts/seed-items.mjs`
 * 기존 아이템에 추가됨 (중복 검사 없음). 깔끔하게 새로 채우려면 DELETE 먼저 실행.
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../data/local.db");

const items = [
  { name: "닌텐도 스위치", category: "게임기", isTimeLimited: 1, rentalTimeMinutes: 30, maxRentalsPerUser: 3 },
  { name: "플레이스테이션 5", category: "게임기", isTimeLimited: 1, rentalTimeMinutes: 30, maxRentalsPerUser: 2 },
  { name: "아이패드", category: "전자기기", isTimeLimited: 1, rentalTimeMinutes: 60, maxRentalsPerUser: 2 },
  { name: "블루투스 스피커", category: "전자기기" },
  { name: "프로젝터", category: "전자기기" },
  { name: "루미큐브", category: "보드게임" },
  { name: "카탄", category: "보드게임" },
  { name: "체스", category: "보드게임" },
  { name: "도미노", category: "보드게임" },
  { name: "할리갈리", category: "보드게임" },
  { name: "배드민턴 라켓", category: "운동기구" },
  { name: "농구공", category: "운동기구" },
  { name: "탁구채", category: "운동기구" },
  { name: "축구공", category: "운동기구" },
  { name: "줄넘기", category: "운동기구" },
];

const db = new Database(dbPath);

const insert = db.prepare(`
  INSERT INTO items (
    name, category, display_order,
    is_hidden, is_deleted, is_time_limited,
    rental_time_minutes, max_rentals_per_user,
    enable_participant_tracking, is_automatic_gender_count
  ) VALUES (
    @name, @category, @displayOrder,
    0, 0, @isTimeLimited,
    @rentalTimeMinutes, @maxRentalsPerUser,
    0, 1
  )
`);

const tx = db.transaction(() => {
  items.forEach((item, idx) => {
    insert.run({
      name: item.name,
      category: item.category,
      displayOrder: idx,
      isTimeLimited: item.isTimeLimited ?? 0,
      rentalTimeMinutes: item.rentalTimeMinutes ?? null,
      maxRentalsPerUser: item.maxRentalsPerUser ?? null,
    });
  });
});

tx();
console.log(`Inserted ${items.length} items into ${dbPath}`);
db.close();
