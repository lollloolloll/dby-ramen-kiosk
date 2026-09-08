import { z } from "zod";

export const generalUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해주세요.")
    .transform((val) => val.replace(/\s/g, "")),
  phoneNumber: z
    .string()
    .min(1, "휴대폰 번호를 입력해주세요.")
    .regex(
      /^010-\d{4}-\d{4}$/,
      "휴대폰 번호를 올바르게 입력해주세요. (010-****-****)"
    ),
  gender: z.string().min(1, "성별을 선택해주세요."),
  birthDate: z
    .string()
    .regex(
      /^\d{4}-\d{1,2}-\d{1,2}$/,
      "생년월일(년, 월, 일)을 모두 선택해주세요."
    ),
  school: z
    .string()
    .trim()
    .refine((val) => val.length > 0, {
      message: "학교 정보를 선택해주세요.",
    })
    .transform((val) => val.replace(/\s/g, "")),
  personalInfoConsent: z.boolean().optional(),
});
