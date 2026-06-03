"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateItem } from "@/lib/actions/item";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useState } from "react";
import { useForm, Resolver } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Item } from "./columns";
import { useRouter } from "next/navigation";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";

const updateItemClientSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요."),
  category: z.string().min(1, "카테고리를 입력해주세요."),
  imageUrl: z
    .any()
    .optional()
    .refine(
      (val) => {
        if (!val || !(val instanceof File)) {
          return true; // 파일이 아니거나(기존 문자열 URL 등) 없으면 통과
        }
        return val.size <= 1 * 1024 * 1024; // 1MB 제한
      },
      { message: "이미지 크기는 1MB 미만이어야 합니다." }
    ),
  isTimeLimited: z.boolean().optional(),
  rentalTimeMinutes: z.coerce
    .number()
    .int()
    .positive("대여 시간은 양의 정수여야 합니다.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  maxRentalsPerUser: z.coerce
    .number()
    .int()
    .positive("최대 대여 횟수는 양의 정수여야 합니다.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  enableParticipantTracking: z.boolean().default(false).optional(),
  isAutomaticGenderCount: z.boolean().default(true),
});

type UpdateItemSchema = z.infer<typeof updateItemClientSchema>;

interface EditItemFormProps {
  item: Item;
  children: React.ReactNode;
}

export function EditItemForm({ item, children }: EditItemFormProps) {
  const [open, setOpen] = useState(false);
  const [isImageDeleted, setIsImageDeleted] = useState(false);
  const router = useRouter();
  const form = useForm<UpdateItemSchema>({
    resolver: zodResolver(updateItemClientSchema) as Resolver<UpdateItemSchema>,
    defaultValues: {
      name: item.name,
      category: item.category,
      imageUrl: item.imageUrl || undefined,
      isTimeLimited: item.isTimeLimited || false,
      rentalTimeMinutes: item.rentalTimeMinutes ?? undefined,
      maxRentalsPerUser: item.maxRentalsPerUser ?? undefined,
      enableParticipantTracking: item.enableParticipantTracking || false,
      isAutomaticGenderCount: item.isAutomaticGenderCount ?? false,
    },
  });

  const isTimeLimited = form.watch("isTimeLimited");
  // D.Base 전용 배포 — smy 대여 흐름용 토글(성별 자동 입력, 참여자 이름 입력)은
  // UI에서 숨긴다. 스키마/기본값은 유지하므로 제출은 그대로 동작. 시간제 대여는 노출.
  // smy 대여 기능을 다시 쓰려면 이 값을 true 로. (관련: 아이템 테이블 컬럼도 동일 처리)
  const SHOW_SMY_RENTAL_OPTIONS = false;
  const currentImageUrl = form.watch("imageUrl");

  const onSubmit = async (values: UpdateItemSchema) => {
    const formData = new FormData();
    formData.append("id", item.id.toString());
    formData.append("name", values.name);
    formData.append("category", values.category);
    formData.append(
      "isAutomaticGenderCount",
      String(values.isAutomaticGenderCount)
    );
    formData.append("isTimeLimited", String(values.isTimeLimited));
    formData.append(
      "enableParticipantTracking",
      String(values.enableParticipantTracking ?? false)
    );
    if (values.rentalTimeMinutes !== undefined) {
      formData.append("rentalTimeMinutes", String(values.rentalTimeMinutes));
    }
    if (values.maxRentalsPerUser !== undefined) {
      formData.append("maxRentalsPerUser", String(values.maxRentalsPerUser));
    }

    if (isImageDeleted) {
      formData.append("deleteImage", "true");
    } else if (values.imageUrl && values.imageUrl instanceof File) {
      formData.append("image", values.imageUrl);
    } else if (typeof values.imageUrl === "string") {
      formData.append("imageUrl", values.imageUrl);
    }

    try {
      const result = await updateItem(formData);
      if (result.error) {
        throw new Error(result.error);
      }
      toast.success("아이템 정보가 수정되었습니다.");
      setOpen(false);
      setIsImageDeleted(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "아이템 정보 수정에 실패했습니다."
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          setIsImageDeleted(false);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>아이템 정보 수정</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col h-full"
          >
            {/* 스크롤 가능한 콘텐츠 영역 - 모바일에서 pb-60 적용 */}
            <div className="max-h-[calc(80vh-140px)] overflow-y-auto overflow-x-hidden px-6 scrollbar-hidden  md:pb-4 pb-60">
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>이름</FormLabel>
                      <FormControl>
                        <Input placeholder="Item Name" {...field} />
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
                        <Input placeholder="Category" {...field} />
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
                      <FormLabel>아이템 이미지</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept="image/*"
                          className="cursor-pointer"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              // ✅ 추가된 부분: 파일 크기 1MB 체크
                              if (file.size > 1 * 1024 * 1024) {
                                toast.error(
                                  "이미지 크기는 1MB 미만 이어야 합니다."
                                );
                                event.target.value = ""; // 입력값 초기화
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
                      {field.value && field.value instanceof File ? (
                        <div className="mt-2 relative">
                          <img
                            src={URL.createObjectURL(field.value)}
                            alt="Image Preview"
                            className="h-20 w-20 object-cover rounded-md"
                          />
                        </div>
                      ) : (
                        !isImageDeleted &&
                        (currentImageUrl || item.imageUrl) && (
                          <div className="mt-2 relative w-fit">
                            <img
                              src={currentImageUrl || item.imageUrl}
                              alt="Current Image"
                              className="h-20 w-20 object-cover rounded-md"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="absolute top-0 right-0 -mt-2 -mr-2 h-6 w-6 rounded-full p-0 z-10"
                              onClick={() => {
                                setIsImageDeleted(true);
                                field.onChange(undefined);
                              }}
                            >
                              ×
                            </Button>
                          </div>
                        )
                      )}
                      {isImageDeleted && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          이미지가 삭제되었습니다.
                        </div>
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
                        <FormLabel className="text-base">
                          성별 자동 입력
                        </FormLabel>
                        <FormDescription>
                          대여 시 사용자의 성별을 바탕으로 인원수를 자동
                          계산합니다.
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
                            <Input
                              type="number"
                              placeholder="ex) 30"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxRentalsPerUser"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>사용자별 최대 대여 횟수</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="ex) 3"
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
              </div>
            </div>

            {/* Footer - 고정 위치 */}
            <DialogFooter className="px-6 pb-6 pt-4">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "수정 중..." : "수정"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
