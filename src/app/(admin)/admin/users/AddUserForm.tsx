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
import { DialogFooter } from "@/components/ui/dialog";
import { createGeneralUser } from "@/lib/actions/generalUser";
import { generalUserSchema } from "@/lib/validators/generalUser";
import { useState, useEffect, useMemo } from "react";
import { z } from "zod";

type GeneralUserFormValues = z.infer<typeof generalUserSchema>;

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

export function AddUserForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 생년월일 상태
  const [birthYear, setBirthYear] = useState<string>();
  const [birthMonth, setBirthMonth] = useState<string>();
  const [birthDay, setBirthDay] = useState<string>();

  // 년도 Select가 열렸을 때 2010년으로 스크롤
  const [yearSelectOpen, setYearSelectOpen] = useState(false);

  const form = useForm<GeneralUserFormValues>({
    resolver: zodResolver(generalUserSchema),
    defaultValues: {
      name: "",
      phoneNumber: "",
      gender: "",
      birthDate: "",
      school: "",
      personalInfoConsent: false,
    },
  });

  // 생년월일 useEffect
  useEffect(() => {
    if (birthYear && birthMonth && birthDay) {
      form.setValue("birthDate", `${birthYear}-${birthMonth}-${birthDay}`);
    } else {
      form.setValue("birthDate", "");
    }
  }, [birthYear, birthMonth, birthDay, form.setValue]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    // 1930년부터 현재년도까지 (역순)
    return Array.from(
      { length: currentYear - 1929 },
      (_, i) => currentYear - i
    );
  }, []);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const days = useMemo(() => {
    if (!birthYear || !birthMonth) {
      // 년/월이 선택 안됐으면 1~31일까지 기본 표시
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
      const result = await createGeneralUser(values);
      if (result.error) {
        throw new Error(result.error);
      }
      if (result.user) {
        toast.success("사용자가 성공적으로 추가되었습니다!");
        router.refresh();
        form.reset();
        setBirthYear(undefined);
        setBirthMonth(undefined);
        setBirthDay(undefined);
        setYearSelectOpen(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "사용자 등록에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const watchedValues = form.watch();
  const isButtonDisabled =
    !watchedValues.name ||
    !watchedValues.phoneNumber ||
    !watchedValues.gender ||
    !watchedValues.birthDate ||
    !watchedValues.school;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="max-h-[80vh] overflow-y-auto overflow-x-hidden p-1 scrollbar-hidden mobile-padding">
          <div className="space-y-4">
            <FormField
              control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                이름<span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="홍길동"
                  {...field}
                  onChange={(e) =>
                    field.onChange(e.target.value.replace(/\s/g, ""))
                  }
                />
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
                  placeholder="010-1234-5678"
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
                    variant={field.value === "남" ? "default" : "outline"}
                    onClick={() => {
                      field.onChange("남");
                      form.trigger("gender");
                    }}
                  >
                    남
                  </Button>
                  <Button
                    type="button"
                    variant={field.value === "여" ? "default" : "outline"}
                    onClick={() => {
                      field.onChange("여");
                      form.trigger("gender");
                    }}
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
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                생년월일<span className="text-red-500">*</span>
              </FormLabel>
              <div className="flex gap-2">
                <Select
                  onValueChange={setBirthYear}
                  value={birthYear}
                  open={yearSelectOpen}
                  onOpenChange={setYearSelectOpen}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="년" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[300px]">
                    {years.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={setBirthMonth} value={birthMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="월" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[300px]">
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
                  <SelectContent position="popper" className="max-h-[300px]">
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
                  {["아동", "초등학교", "중학교", "고등학교", "대학교", "성인"].map(
                    (level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    )
                  )}
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
                  동의 시 맞춤형 서비스 제공에 활용될 수 있습니다. 동의하지
                  않아도 서비스 이용이 가능합니다.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isSubmitting || isButtonDisabled}>
            {isSubmitting ? "등록 중..." : "사용자 추가"}
          </Button>
        </DialogFooter>
          </div>
        </div>
      </form>
    </Form>
  );
}
