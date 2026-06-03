import { z } from "zod";

export const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해주세요.")
    .transform((val) => val.replace(/\s/g, "")),
  category: z
    .string()
    .trim()
    .min(1, "카테고리를 입력해주세요.")
    .transform((val) => val.replace(/\s/g, "")),
  imageUrl: z.string().optional(),
  isTimeLimited: z.boolean().default(false).optional(),
  rentalTimeMinutes: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  enableParticipantTracking: z.boolean().default(false).optional(),
  isAutomaticGenderCount: z.boolean().default(true).optional(),
});

export const updateItemSchema = z.object({
  id: z.number(),
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해주세요.")
    .transform((val) => val.replace(/\s/g, ""))
    .optional(),
  category: z
    .string()
    .trim()
    .min(1, "카테고리를 입력해주세요.")
    .transform((val) => val.replace(/\s/g, ""))
    .optional(),
  imageUrl: z.string().nullable().optional(),
  isTimeLimited: z.boolean().optional(),
  rentalTimeMinutes: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  enableParticipantTracking: z.boolean().default(false).optional(),
  isAutomaticGenderCount: z.boolean().optional(),
});
