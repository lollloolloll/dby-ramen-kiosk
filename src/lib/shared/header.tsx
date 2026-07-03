"use client";

import { Menu, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import { downloadDatabase, downloadFullBackup } from "@/lib/actions/backup";
import Link from "next/link";

interface HeaderProps {
  onMenuClick: () => void; // 홈으로 이동
  onSidebarToggle: () => void; // 사이드바 열기 (추가된 prop)
}

export function Header({ onMenuClick, onSidebarToggle }: HeaderProps) {
  const handleBackup = async () => {
    if (!confirm("현재 데이터베이스(DB)를 백업하시겠습니까?")) return;
    try {
      const result = await downloadFullBackup();
      if (result.success && result.buffer) {
        const link = document.createElement("a");
        link.href = `data:${result.mimeType};base64,${result.buffer}`;
        link.download = result.fileName || "backup.db";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert(`백업 실패: ${result.error}`);
      }
    } catch (error) {
      alert(
        `백업 중 오류 발생: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleLogout = async () => {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
      {/* 1. 햄버거 버튼 (모바일에서만 보임 md:hidden) */}
      <Button
        variant="outline"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={onSidebarToggle}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle navigation menu</span>
      </Button>

      {/* 2. 홈 버튼 (기존 버튼) */}
      <Button
        variant="outline"
        size="icon"
        className="shrink-0"
        onClick={onMenuClick}
      >
        <Home className="h-5 w-5" />
        <span className="sr-only">Go to Main</span>
      </Button>

      <Button
        variant="ghost"
        className="text-lg font-semibold cursor-pointer underline hidden sm:inline-flex" // 모바일 공간 부족시 텍스트 숨김 처리 옵션
        asChild
      >
         <a
          href="https://www.notion.so/37bea606c4d58099a0dec33df70bbd5d?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
        >
          관리자메뉴얼
        </a> 
      </Button>
      <div className="flex items-center gap-4 ml-auto">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/adminAccount">관리자계정</Link>
        </Button>
        <Button variant="ghost" onClick={handleBackup} size="sm">
          백업
        </Button>
        <Button variant="ghost" onClick={handleLogout} size="sm">
          로그아웃
        </Button>
      </div>
    </header>
  );
}
