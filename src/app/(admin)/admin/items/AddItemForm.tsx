"use client";

import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { addItem } from "@/lib/actions/item";
import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Resolver } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  ITEM_IMAGE_MAX_BYTES,
  ITEM_IMAGE_MAX_MB,
} from "@/lib/constants/uploads";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
    .transform((val) => val.replace(/\s/g, "")),
  category: z
    .string()
    .trim()
    .min(2, {
      message: "Category must be at least 2 characters.",
    })
    .transform((val) => val.replace(/\s/g, "")),
  imageUrl: z
    .any()
    .optional()
    .refine(
      (val) => {
        if (!val || !(val instanceof File)) {
          return true;
        }
        return val.size <= ITEM_IMAGE_MAX_BYTES;
      },
      { message: `이미지 크기는 ${ITEM_IMAGE_MAX_MB}MB 이하여야 합니다.` }
    )
    .transform((val) => {
      if (val instanceof File) {
        return val;
      }
      return typeof val === "string" ? val.replace(/\s/g, "") : val;
    }),
  isTimeLimited: z.boolean().default(false).optional(),
  rentalTimeMinutes: z.coerce
    .number()
    .int()
    .positive("대여 시간은 양의 정수여야 합니다.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  quantity: z.coerce
    .number()
    .int()
    .positive("보유 수량은 1 이상의 정수여야 합니다.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  enableParticipantTracking: z.boolean().default(false),
  isAutomaticGenderCount: z.boolean().default(true),
});

export function AddItemForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: "",
      category: "",
      imageUrl: undefined,
      isTimeLimited: false,
      rentalTimeMinutes: undefined,
      quantity: undefined,
      enableParticipantTracking: false,
      isAutomaticGenderCount: false,
    },
  });

  const isTimeLimited = form.watch("isTimeLimited");
  // D.Base 전용 배포 — smy 대여 흐름용 토글(성별 자동 입력, 참여자 이름 입력)은
  // UI에서 숨긴다. 스키마/기본값은 유지하므로 제출은 그대로 동작. 시간제 대여는 노출.
  // smy 대여 기능을 다시 쓰려면 이 값을 true 로. (관련: 아이템 테이블 컬럼도 동일 처리)
  const SHOW_SMY_RENTAL_OPTIONS = false;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const formData = new FormData();
    formData.append("name", values.name);
    formData.append("category", values.category);
    formData.append("isTimeLimited", String(values.isTimeLimited));
    formData.append(
      "enableParticipantTracking",
      String(values.enableParticipantTracking)
    );

    if (values.rentalTimeMinutes !== undefined) {
      formData.append("rentalTimeMinutes", String(values.rentalTimeMinutes));
    }
    if (values.quantity !== undefined) {
      formData.append("quantity", String(values.quantity));
    }
    formData.append(
      "isAutomaticGenderCount",
      String(values.isAutomaticGenderCount)
    );

    if (values.imageUrl instanceof File) {
      const file = values.imageUrl;
      const originalName = file.name;

      const lastDotIndex = originalName.lastIndexOf(".");
      const extension =
        lastDotIndex !== -1 ? originalName.slice(lastDotIndex) : "";
      const nameWithoutExt =
        lastDotIndex !== -1
          ? originalName.slice(0, lastDotIndex)
          : originalName;

      const sanitizedName = nameWithoutExt
        .replace(/[\s\(\)]/g, "-")
        .replace(/[^a-zA-Z0-9가-힣-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const uniqueSuffix = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const filename = `${sanitizedName}-${uniqueSuffix}${extension}`;

      const newFile = new File([file], filename, { type: file.type });
      formData.append("image", newFile);
    }

    const result = await addItem(formData);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Item added successfully!");
      router.refresh();
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* 참고하신 코드의 스크롤 컨테이너 적용 (pb-60 포함) */}
        <div className="max-h-[80vh] overflow-y-auto overflow-x-hidden p-1 scrollbar-hidden mobile-padding">
          <div className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이름</FormLabel>
                  <FormControl>
                    <Input placeholder="ex)라면" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>카테고리</FormLabel>
                  <FormControl>
                    <Input placeholder="ex)스포츠" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이미지</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/*"
                      className="cursor-pointer"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          if (file.size > ITEM_IMAGE_MAX_BYTES) {
                            toast.error(
                              `파일사이즈는 ${ITEM_IMAGE_MAX_MB}MB 이하여야 합니다.`
                            );
                            event.target.value = "";
                            field.onChange(undefined);
                            return;
                          }
                          field.onChange(file);
                        } else {
                          field.onChange(undefined);
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                  {field.value && field.value instanceof File && (
                    <img
                      src={URL.createObjectURL(field.value)}
                      alt="Image Preview"
                      className="mt-2 h-20 w-20 object-cover rounded-md"
                    />
                  )}
                </FormItem>
              )}
            />
            {/* 숨김(D.Base 전용 배포) — smy 대여 흐름용. 복원: SHOW_SMY_RENTAL_OPTIONS=true */}
            {SHOW_SMY_RENTAL_OPTIONS && (
            <FormField
              control={form.control}
              name="isAutomaticGenderCount"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">성별 자동 입력</FormLabel>
                    <FormDescription>
                      대여 시 사용자의 성별을 바탕으로 성별이
                      입력됩니다
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            )}
            <FormField
              control={form.control}
              name="isTimeLimited"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">시간제 대여</FormLabel>
                    <FormDescription>
                      시간제 대여 아이템으로 설정합니다
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isTimeLimited && (
              <>
                <FormField
                  control={form.control}
                  name="rentalTimeMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>대여 시간 (분)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="ex) 30" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>보유 수량(재고)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="ex) 2 (동시에 빌려줄 수 있는 개수)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* 숨김(D.Base 전용 배포) — smy 대여 흐름용. 복원: SHOW_SMY_RENTAL_OPTIONS=true */}
            {SHOW_SMY_RENTAL_OPTIONS && (
            <FormField
              control={form.control}
              name="enableParticipantTracking"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      참여자 이름 입력 여부
                    </FormLabel>
                    <FormDescription>
                      대여 시 참여자들의 이름을 개별적으로 입력받습니다
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            )}

            <DialogFooter>
              <Button type="submit">아이템 추가</Button>
            </DialogFooter>
          </div>
        </div>
      </form>
    </Form>
  );
}
