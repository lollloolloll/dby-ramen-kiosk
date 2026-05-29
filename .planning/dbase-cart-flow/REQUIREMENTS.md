# D.BASE 플레이그라운드 등록 키오스크 — 요구사항 분석

> 출처: `src/assets/wireframe/와이어프레임.pdf` (1p)
> 대상 인스턴스: **D.BASE** (도봉동청소년문화의집 플레이그라운드)
> 기존 인스턴스(쌍청문 라면 키오스크)와는 흐름이 다름. App Router segment로 `/kiosk/dby`는 D.BASE 흐름, `/kiosk/smy`는 기존 쌍청문 흐름을 렌더한다. `/kiosk`는 호환을 위해 `/kiosk/dby`로 이동한다.

---

## 1. 흐름 요약 (와이어프레임 그대로)

```
[① 진입]
  "두둥~ D.BASE 입장!"
  → 처음 왔어요  → ①-A 신규 등록
  → 또 왔어요    → ①-B 재방문 확인

[①-A 신규 등록]
  "처음 온 두리, 반가워~ 두리에 대해 궁금해!"
  입력: 이름 / 성별 / 연락처 / 교급 / 개인정보동의
  → OK → ②

[①-B 재방문 확인]
  "오늘도 반가워!"
  입력: 이름 + 전화번호 가운데 4자리
  → OK
    - 일치     → ②
    - 불일치   → "입력하신 정보가 일치하지 않아요. 혹시 처음 왔니?"
                → [다시 입력] | [신규 등록 → ①-A]

[② 인원 수 입력]
  "몇 명이 왔어?"
  - 총 OO명
  - 청소년: 남 OO명, 여 OO명
  - 성인:   남 OO명, 여 OO명
  → OK → ③

[③ 컨텐츠 다중 선택]
  "두근두근, 오늘은 뭐해? (하고 싶은 것 모두 선택)"
  → OK → ④

[④ 완료]
  "Welcome to D.BASE!"
  "도봉동청소년문화의집 플레이그라운드 등록"
  참여 컨텐츠 목록 표시
  컨텐츠 예시: PC, 오락기, 닌텐도, 다랑방&카페, 보드게임, 농구장, 몰입존, 우리쌤♡
```

---

## 2. 기존 키오스크와의 차이 (gap)

| 항목 | 기존 (쌍청문) | D.BASE (신규) |
|---|---|---|
| 진입 방식 | 아이템 그리드에서 바로 선택 → 다이얼로그 | 신규/재방문 분기 먼저 |
| 사용자 식별 | RentalDialog 안에서 이름+전화번호 입력 | **별도 스텝**으로 분리 (4자리만 입력) |
| 신규 등록 입력 | 이름/성별/연락처/동의 | + **교급(school grade)** 추가 |
| 인원 수 입력 | 없음 (1인 대여) | **인원 수 + 연령대/성별 분포** 입력 |
| 아이템 선택 | 단건 | **다중 선택 (장바구니)** |
| 완료 화면 | 토스트/리다이렉트 | 전용 Welcome 화면 |

---

## 3. 데이터 모델 영향

### 3.1 `general_users` 변경 없음
- 별도 `schoolGrade` 컬럼은 추가하지 않는다.
- 와이어프레임의 "교급" 성격은 기존 `birthDate`를 기준으로 나이/연령대를 계산해서 처리한다.
- D.BASE 신규 등록 UI는 기존 DB 스키마를 유지하면서 이름/성별/연락처/생년월일/개인정보동의를 받는다.

### 3.2 재방문 식별 로직
- 와이어프레임은 "이름 + 전화번호 **가운데 4자리**"로 식별
- 기존: 이름 + 전체 phoneNumber (`general_users_name_phone_unique`)
- 충돌 가능성: 동명이인 + 같은 가운데 4자리 → 동작 정의 필요
  - 옵션 A: 다건 매칭 시 "다시 입력" 강제
  - 옵션 B: 전체 번호 입력 화면으로 폴백
  - **추천: A (와이어프레임의 "정보 불일치" UX와 일치)**

### 3.3 인원 수 / 분포
- 기존 `rental_records`는 1건 = 1유저 = 1아이템 구조
- D.BASE는 1세션에 **(인원 분포 메타) + (다중 아이템)** 등록
  - 신규 테이블 `visit_sessions` 도입 확정:
    - id, generalUserId, totalCount, youthMale, youthFemale, adultMale, adultFemale, createdAt
  - `rental_records`에 `sessionId` FK 추가 (nullable, 쌍청문 호환)
  - D.BASE에서 컨텐츠 여러 개를 선택하면 `visit_sessions` 1건 + `rental_records` N건을 생성하고, N건 모두 같은 `sessionId`를 가진다.
  - 검증: `totalCount === youthMale + youthFemale + adultMale + adultFemale`

### 3.4 컨텐츠(아이템) 분류
- 와이어프레임 예시: PC, 오락기, 닌텐도, 다랑방&카페, 보드게임, 농구장, 몰입존, 우리쌤♡
- 기존 `items` 테이블 그대로 사용 가능 — D.BASE 인스턴스에 등록만 하면 됨
- "우리쌤♡ 이용등록" → 사람(우리쌤) 자원도 컨텐츠로 다룰지 확인 필요

---

## 4. 화면/컴포넌트 영향

### 4.1 신규 흐름
```
/kiosk/dby → D.BASE state machine
/kiosk/smy → 기존 카탈로그 + RentalDialog
  entry      → ① 진입 (처음/또)
  register   → ①-A 신규 등록 폼
  identify   → ①-B 재방문 식별
  headcount  → ② 인원 수
  contents   → ③ 다중 선택
  done       → ④ Welcome 화면
```
> 구현 방향: D.BASE는 단일 페이지 state machine. env/siteConfig 분기 없이 App Router URL segment(`/dby`, `/smy`)로 흐름을 분리한다.

### 4.2 RentalDialog 운명
- D.BASE 흐름에서는 다이얼로그 불필요 (스텝 분리)
- `/kiosk/dby`에서는 기존 RentalDialog 카탈로그 fallback을 제거한다.
- `/kiosk/smy`에서는 기존 RentalDialog 카탈로그 흐름을 유지한다.

### 4.3 새 컴포넌트 후보
- `EntryGate` (처음/또 선택)
- `NewUserForm` (이름/성별/연락처/교급/동의)
- `ReturningUserForm` (이름 + 4자리)
- `HeadcountForm` (총원 + 청소년/성인 × 남/여)
- `ContentCart` (다중 선택 그리드 + 선택 카운트)
- `WelcomeScreen` (선택 컨텐츠 요약)

---

## 5. 톤 & 카피

와이어프레임 카피 톤이 매우 캐주얼/친근 ("두둥~", "두근두근", "혹시 처음 왔니?"):
- 기존 쌍청문 카피는 중립적 → **D.BASE는 톤 전용 카피셋 필요**
- ThemeBuilder의 `siteConfig` 카피 필드를 인스턴스별로 분리하거나, D.BASE 전용 카피 상수 도입
- 캐릭터명 "두리" 등장 → 마스코트 자산 존재 여부 확인 필요

---

## 6. 미확정 / 클라이언트 확인 필요

1. **재방문 식별 정확도**: 가운데 4자리 충돌 시 정책은 다건 매칭도 불일치로 처리하고 신규 등록/다시 입력을 유도
2. **인원 수 vs 컨텐츠 매핑**: 8명이 와서 PC 2/보드게임 4 등 분배 입력 없음. 와이어프레임대로 "총 인원 + 연령/성별 분포 + 컨텐츠 리스트"만 저장
3. **"우리쌤♡ 이용등록"**: 일반 컨텐츠와 동일 취급
4. **완료 화면 후 동작**: 완료 화면 표시 후 자동 idle 복귀, 수동 "처음으로" 허용
5. **개인정보 동의**: 신규 등록에서만 받음. 재방문은 기존 회원 확인만 수행
6. **편집/취소**: 단계별 이전/처음으로 복귀는 허용. 완료 전 컨텐츠 선택은 토글로 수정 가능
7. **D.BASE / 쌍청문 분기 기준**: env 분기 없음. App Router URL segment 기준으로 `/kiosk/dby`와 `/kiosk/smy`를 분리

---

## 7. 작업 분해 초안 (참고)

1. **스키마**: `visit_sessions` 테이블 신설, `rental_records.visitSessionId` 추가
2. **App Router 진입점 분리**: `/kiosk/dby`에서 D.BASE state machine 직접 렌더, `/kiosk/smy`에서 기존 쌍청문 흐름 유지
3. **state machine**: D.BASE 흐름 스텝 정의 (XState 또는 useReducer)
4. **신규 컴포넌트 6종** (§4.3)
5. **서버 액션**: 기존 `findUsersByNameAndPin` 재사용, D.BASE 신규 등록 액션, `createVisitSession`, 세션 연결 `commitCartRentals`
6. **카피/마스코트 자산**: "두리" 이미지/일러스트 수급
7. **어드민 영향**: 대여 기록 테이블에 D.BASE 방문 세션의 총원/청소년/성인 남녀 분포를 표시. 별도 통계 합산은 후속 개선
8. **QA**: 신규/재방문/불일치/다중 아이템/뒤로가기/idle 타임아웃

---

## 8. 위험 요소

- **진입 URL 혼동**: `/kiosk`는 `/kiosk/dby`로 redirect하고, 기존 쌍청문 흐름은 `/kiosk/smy`에서 유지한다.
- **DB 마이그레이션**: prod local.db 이미 데이터 존재 → backup/restore 절차 (`docs/DATABASE_BACKUP_RESTORE.md`) 준수
- **카피셋 폭발**: 인스턴스별 카피 분리 시 ThemeBuilder 스키마 확장 vs 상수 분리 — [[project_themebuilder_v2]] 와 충돌 가능성 점검 필요
- **와이어프레임 1페이지만 존재**: 에러/예외/뒤로가기/타임아웃 UX 미정 → 클라이언트 추가 확인 또는 본인 판단 결정 필요
