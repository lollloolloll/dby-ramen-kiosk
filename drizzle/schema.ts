import {
  sqliteTable,
  AnySQLiteColumn,
  integer,
  text,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const items = sqliteTable("items", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  name: text().notNull(),
  category: text().notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  imageUrl: text("image_url"),
  isHidden: integer("is_hidden", { mode: "boolean" }).default(false).notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" })
    .default(false)
    .notNull(),

  // 시간제 대여 관련 (닌텐도 같은 수요가 높은 물품)
  isTimeLimited: integer("is_time_limited", { mode: "boolean" })
    .default(false)
    .notNull(),
  rentalTimeMinutes: integer("rental_time_minutes"), // 시간제 대여인 경우만 설정 (예: 30)
  maxRentalsPerUser: integer("max_rentals_per_user"), // 시간제 대여인 경우만 설정 (예: 3, 하루 최대 횟수)
  enableParticipantTracking: integer("enable_participant_tracking", {
    //특정 아이템 인원 이름 입력
    mode: "boolean",
  })
    .default(false)
    .notNull(),
  isAutomaticGenderCount: integer("is_automatic_gender_count", {
    mode: "boolean",
  })
    .default(true)
    .notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    username: text().notNull(),
    hashedPassword: text("hashed_password").notNull(),
    role: text().default("USER").notNull(),
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)]
);

export const generalUsers = sqliteTable(
  "general_users",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    name: text().notNull(),
    phoneNumber: text("phone_number").notNull(),
    gender: text().notNull(),
    birthDate: text("birth_date"),
    school: text(),
    personalInfoConsent: integer("personal_info_consent", { mode: "boolean" }),
    consentFilePath: text("consent_file_path"),
  },
  (table) => [
    uniqueIndex("general_users_name_phone_unique").on(
      table.name,
      table.phoneNumber
    ),
  ]
);

export const rentalRecords = sqliteTable("rental_records", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),

  //삭제 시 대여 기록 보존
  // set null로 변경하되, 사용자/아이템 정보는 별도로 저장
  userId: integer("user_id").references(() => generalUsers.id, {
    onDelete: "set null",
  }),
  // 사용자 삭제 시에도 기록을 위해 기본 정보 저장
  userName: text("user_name"), // 대여 시점의 사용자 이름
  userPhone: text("user_phone"), // 대여 시점의 전화번호
  userSchool: text("user_school"), //대여 시점의 사용자 학교
  userGender: text("user_gender"), // '남' | '여'
  userBirthDate: text("user_birth_date"), // 'YYYY-MM-DD' (나이 계산용)

  itemsId: integer("items_id").references(() => items.id, {
    onDelete: "set null",
  }),
  // 아이템 삭제 시에도 기록을 위해 기본 정보 저장
  itemName: text("item_name"), // 대여 시점의 아이템 이름
  itemCategory: text("item_category"), // 대여 시점의 카테고리

  rentalDate: integer("rental_date")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  // 대여 인원 정보
  maleCount: integer("male_count").default(0).notNull(), // 남자 인원 수
  femaleCount: integer("female_count").default(0).notNull(), // 여자 인원 수

  // 시간제 대여 관련 (isTimeLimited=true인 아이템만 사용)
  // 닌텐도 같은 수요 높은 물품에만 적용
  returnDueDate: integer("return_due_date"), // 시간제 대여인 경우만 설정됨 (rentalDate + rentalTimeMinutes)

  // 반납 관리 - 시간제 대여 아이템만 관리
  // 일반 아이템은 반납 관리 안함 (대부분 false로 유지)
  isReturned: integer("is_returned", { mode: "boolean" })
    .default(false)
    .notNull(),
  // 실제 반납 시간
  // 1) 30분 지나면 자동으로 반납 처리 (returnDate = returnDueDate, 자동)
  // 2) 중도 포기 시 관리자가 수동 반납 (returnDate = 관리자 처리 시간, 수동)
  returnDate: integer("return_date"),
  // 수동 반납 여부 (중도 포기로 관리자가 처리한 경우 true)
  isManualReturn: integer("is_manual_return", { mode: "boolean" })
    .default(false)
    .notNull(),
});

// 대기자 명단 테이블
// 닌텐도 같은 인기 있는 시간제 대여 아이템 전용 (사용자 경험 개선)
// 30분 대기 시스템으로 공평한 이용 기회 제공
export const waitingQueue = sqliteTable("waiting_queue", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => generalUsers.id, { onDelete: "cascade" }),
  // 오직 이 시간으로만 순서를 결정합니다.
  requestDate: integer("request_date")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  maleCount: integer("male_count").default(0).notNull(),
  femaleCount: integer("female_count").default(0).notNull(),
});

export const rentalRecordPeople = sqliteTable("rental_record_people", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  rentalRecordId: integer("rental_record_id")
    .notNull()
    .references(() => rentalRecords.id, { onDelete: "cascade" }),
  name: text().notNull(),
  gender: text().notNull(), // '남' 또는 '여'
});

export const siteConfig = sqliteTable("site_config", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),

  colorPrimary: text("color_primary").default("#5FD4A5").notNull(),
  colorAccent: text("color_accent").default("#E896C0").notNull(),
  colorTextMain: text("color_text_main").default("#1e293b").notNull(),
  colorTextMuted: text("color_text_muted").default("#64748b").notNull(),

  overrideCtaBg: text("override_cta_bg"),
  overrideHeadlineGradFrom: text("override_headline_grad_from"),
  overrideHeadlineGradTo: text("override_headline_grad_to"),
  overrideFilterActiveBg: text("override_filter_active_bg"),

  orgName: text("org_name").default("쌍청문").notNull(),
  homeBadge1: text("home_badge_1").default("우리들의 아지트").notNull(),
  homeBadge2: text("home_badge_2")
    .default("나의 미성숙함이 머물다 가는 곳")
    .notNull(),
  homeHeadlineTop: text("home_headline_top").default("학교 끝나고").notNull(),
  homeHeadlineBottom: text("home_headline_bottom")
    .default("뭐하고 놀래?")
    .notNull(),
  homeSubcopy: text("home_subcopy").default("으로 다 모여! 🎉").notNull(),
  homeCtaLabel: text("home_cta_label").default("😎 놀 준비 완료!").notNull(),
  kioskTitle: text("kiosk_title").default("쉬다 대여 목록").notNull(),
  kioskEmptyTitle: text("kiosk_empty_title")
    .default("현재 대여가능한 상품이 없습니다.")
    .notNull(),
  kioskEmptySubtitle: text("kiosk_empty_subtitle")
    .default("관리자에게 문의해주세요.")
    .notNull(),

  marqueeItemsJson: text("marquee_items_json")
    .default(
      '[{"emoji":"🎮","label":"닌텐도 스위치"},{"emoji":"🍜","label":"라면"},{"emoji":"🎲","label":"보드게임"},{"emoji":"🏸","label":"배드민턴"},{"emoji":"🍿","label":"맛있는 간식"},{"emoji":"🏀","label":"농구"},{"emoji":"🏓","label":"탁구"}]'
    )
    .notNull(),
  stickerEmojisJson: text("sticker_emojis_json")
    .default('[{"emoji":"🎮"},{"emoji":"🎤"},{"emoji":"🎲"},{"emoji":"🍜"}]')
    .notNull(),

  showLavaLamp: integer("show_lava_lamp", { mode: "boolean" })
    .default(true)
    .notNull(),
  showStickers: integer("show_stickers", { mode: "boolean" })
    .default(true)
    .notNull(),
  showMarquee: integer("show_marquee", { mode: "boolean" })
    .default(true)
    .notNull(),
  showFilters: integer("show_filters", { mode: "boolean" })
    .default(true)
    .notNull(),
  showKioskBgGradient: integer("show_kiosk_bg_gradient", { mode: "boolean" })
    .default(true)
    .notNull(),

  backgroundPath: text("background_path"),
  backgroundType: text("background_type", { enum: ["image", "video"] }),
  backgroundOverlayOpacity: integer("background_overlay_opacity")
    .default(30)
    .notNull(),
  logoPath: text("logo_path"),

  kioskGridCols: integer("kiosk_grid_cols").default(4).notNull(),
  inactivityTimeoutMs: integer("inactivity_timeout_ms")
    .default(60000)
    .notNull(),

  updatedAt: integer("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});
