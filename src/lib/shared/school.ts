/**
 * 학교명에서 교급(학교 단계)을 도출한다.
 *
 * 저장된 school 값은 등록 플로우에서 약칭으로 저장된다 (예: "선덕초", "효문고").
 * 수기로 전체명("○○초등학교")이 들어온 경우도 함께 처리한다.
 *
 * - 미입력(null/빈문자) → "" (빈칸)
 * - "해당없음" → "해당없음"
 * - 초/중/고/대 → 초등학교/중학교/고등학교/대학교
 * - 그 외 분류 불가 → "" (빈칸)
 */
export function getSchoolLevel(school: string | null | undefined): string {
  if (!school) return "";

  const value = school.trim();
  if (!value) return "";
  if (value === "해당없음") return "해당없음";

  // 수기 전체명 대응 ("○○초등학교" 등)
  if (value.includes("초등")) return "초등학교";
  if (value.includes("중학")) return "중학교";
  if (value.includes("고등")) return "고등학교";
  if (value.includes("대학")) return "대학교";

  // 약칭 끝글자 대응 ("선덕초", "창동중", "효문고", "이화여대")
  switch (value.slice(-1)) {
    case "초":
      return "초등학교";
    case "중":
      return "중학교";
    case "고":
      return "고등학교";
    case "대":
      return "대학교";
    default:
      return "";
  }
}
