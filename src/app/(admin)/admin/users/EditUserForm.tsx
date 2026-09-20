"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateUser } from "@/lib/actions/generalUser";
import { generalUserSchema } from "@/lib/validators/generalUser";
import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { generalUsers } from "@drizzle/schema";

type GeneralUser = typeof generalUsers.$inferSelect;
type GeneralUserFormValues = z.infer<typeof generalUserSchema>;

interface EditUserFormProps {
  user: GeneralUser;
  children: React.ReactNode;
}

const formatPhoneNumber = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, "");
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 8) {
    return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
  }
  return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(
    3,
    7
  )}-${phoneNumber.slice(7, 11)}`;
};

// 기존에 학교명으로 저장된 값(예: "선덕초")도 교급으로 변환해 보여준다.
// 다음 저장부터는 교급 값으로 덮어써진다.
const getSchoolLevelValue = (school: string | null) => {
  if (!school) return "";
  if (school === "성인" || school === "해당없음") return "성인";
  if (school === "아동") return "아동";
  switch (school.slice(-1)) {
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
};

export function EditUserForm({ user, children }: EditUserFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialBirthDate = user.birthDate ? user.birthDate.split("-") : [];

  const [birthYear, setBirthYear] = useState<string | undefined>(
    initialBirthDate[0]
  );
  const [birthMonth, setBirthMonth] = useState<string | undefined>(
    initialBirthDate[1]
  );
  const [birthDay, setBirthDay] = useState<string | undefined>(
    initialBirthDate[2]
  );

  const form = useForm<GeneralUserFormValues>({
    resolver: zodResolver(generalUserSchema),
    defaultValues: {
      name: user.name || "",
      phoneNumber: user.phoneNumber || "",
      gender: user.gender || "",
      birthDate: user.birthDate || "",
      school: getSchoolLevelValue(user.school),
      personalInfoConsent: user.personalInfoConsent ?? false,
    },
  });

  useEffect(() => {
    if (open) {
      const birthDateParts = user.birthDate ? user.birthDate.split("-") : [];

      form.reset({
        name: user.name || "",
        phoneNumber: user.phoneNumber || "",
        gender: user.gender || "",
        birthDate: user.birthDate || "",
        school: getSchoolLevelValue(user.school),
        personalInfoConsent: user.personalInfoConsent ?? false,
      });

      setBirthYear(birthDateParts[0]);
      setBirthMonth(birthDateParts[1]);
      setBirthDay(birthDateParts[2]);
    }
  }, [open, user, form]);

  useEffect(() => {
    if (birthYear && birthMonth && birthDay) {
      form.setValue("birthDate", `${birthYear}-${birthMonth}-${birthDay}`);
    } else {
      form.setValue("birthDate", "");
    }
  }, [birthYear, birthMonth, birthDay, form]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(
      { length: currentYear - 1929 },
      (_, i) => currentYear - i
    );
  }, []);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const days = useMemo(() => {
    if (!birthYear || !birthMonth) {
      return Array.from({ length: 31 }, (_, i) => i + 1);
    }
    const daysInMonth = new Date(
      parseInt(birthYear),
      parseInt(birthMonth),
      0
    ).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [birthYear, birthMonth]);

  async function onSubmit(values: GeneralUserFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updateUser(user.id, values);
      if (result.error) {
        throw new Error(result.error);
      }
      if (result.success) {
        toast.success("사용자 정보가 성공적으로 업데이트되었습니다!");
        router.refresh();
        setOpen(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "사용자 정보 업데이트에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>사용자 정보 수정</DialogTitle>
          <DialogDescription>
            사용자 정보를 수정하고 저장합니다.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col h-full"
          >
            {/* 스크롤 가능한 콘텐츠 영역 - 모바일에서 pb-60 적용 */}
            <div className="max-h-[calc(80vh-180px)] overflow-y-auto overflow-x-hidden px-6 scrollbar-hidden pb-4 md:pb-4 pb-60">
              <div className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        이름<span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        휴대폰 번호<span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          {...field}
                          onChange={(e) => {
                            field.onChange(formatPhoneNumber(e.target.value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        성별<span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={
                              field.value === "남" ? "default" : "outline"
                            }
                            onClick={() => field.onChange("남")}
                          >
                            남
                          </Button>
                          <Button
                            type="button"
                            variant={
                              field.value === "여" ? "default" : "outline"
                            }
                            onClick={() => field.onChange("여")}
                          >
                            여
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthDate"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        생년월일<span className="text-red-500">*</span>
                      </FormLabel>
                      <div className="flex gap-2">
                        <Select onValueChange={setBirthYear} value={birthYear}>
                          <SelectTrigger>
                            <SelectValue placeholder="년" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[300px]"
                          >
                            {years.map((year) => (
                              <SelectItem key={year} value={String(year)}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          onValueChange={setBirthMonth}
                          value={birthMonth}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="월" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[300px]"
                          >
                            {months.map((month) => (
                              <SelectItem key={month} value={String(month)}>
                                {month}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select onValueChange={setBirthDay} value={birthDay}>
                          <SelectTrigger>
                            <SelectValue placeholder="일" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[300px]"
                          >
                            {days.map((day) => (
                              <SelectItem key={day} value={String(day)}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        교급<span className="text-red-500">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[
                            "아동",
                            "초등학교",
                            "중학교",
                            "고등학교",
                            "대학교",
                            "성인",
                          ].map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="personalInfoConsent"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>개인정보 수집 및 이용 동의 (선택)</FormLabel>
                        <FormDescription>
                          동의 시 맞춤형 서비스 제공에 활용될 수 있습니다.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Footer - 고정 위치 */}
            <DialogFooter className="px-6 pb-6 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
