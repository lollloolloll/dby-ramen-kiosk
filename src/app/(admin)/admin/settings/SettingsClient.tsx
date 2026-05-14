"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { setSchoolReconfirmMode } from "@/lib/actions/settings";
import { toast } from "sonner";

interface SettingsClientProps {
  initialSchoolReconfirmMode: boolean;
}

export function SettingsClient({
  initialSchoolReconfirmMode,
}: SettingsClientProps) {
  const [enabled, setEnabled] = useState(initialSchoolReconfirmMode);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (next: boolean) => {
    if (next) {
      // ON으로 켜는 경우 확인 받기 (전원 플래그 리셋되므로)
      setConfirmOpen(true);
    } else {
      apply(false);
    }
  };

  const apply = (next: boolean) => {
    startTransition(async () => {
      const result = await setSchoolReconfirmMode(next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEnabled(next);
      toast.success(
        next
          ? "학교 재확인 모드가 활성화되었습니다. 모든 사용자가 다음 대여 시 학교를 확인합니다."
          : "학교 재확인 모드가 비활성화되었습니다."
      );
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>학교 정보 재확인 모드</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          새학기 등 학교정보가 바뀌는 시기에 사용하세요. 이 모드를 켜면 모든
          사용자가 키오스크에서 처음 대여할 때 한 번 학교 정보를 확인하게
          됩니다. 확인이 끝난 사용자는 다시 묻지 않습니다.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <Label htmlFor="school-reconfirm" className="flex flex-col gap-1">
            <span className="font-semibold">대여 시 학교 정보 재확인</span>
            <span className="text-xs text-muted-foreground">
              {enabled ? "활성화됨" : "비활성화됨"}
            </span>
          </Label>
          <Switch
            id="school-reconfirm"
            checked={enabled}
            disabled={isPending}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학교 재확인 모드를 켤까요?</AlertDialogTitle>
            <AlertDialogDescription>
              모든 사용자는 키오스크에서 다음 대여 시 한 번 학교 정보를 확인해야
              합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                apply(true);
              }}
            >
              켜기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
