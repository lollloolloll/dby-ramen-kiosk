"use client";

import { useEffect, useState } from "react";
import { Header } from "@/lib/shared/header";
import { Sidebar } from "@/lib/shared/sidebar";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useRouter, usePathname } from "next/navigation"; // usePathname 추가
import { useSession } from "next-auth/react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname(); // 페이지 이동 감지용
  const { status } = useSession();
  const isFullWidth = pathname?.startsWith("/admin/theme");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // 페이지(경로)가 변경되면 모바일 사이드바를 자동으로 닫음
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (status === "loading" || status === "unauthenticated") {
    return null;
  }

  const goMain = () => {
    router.push("/");
  };

  return (
    <div
      className={
        isFullWidth
          ? "min-h-screen w-full"
          : "grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]"
      }
    >
      {/* Desktop Sidebar (테마 페이지에서는 숨김) */}
      <aside
        className={`hidden border-r bg-muted/40 md:block ${isFullWidth ? "md:hidden" : ""}`}
      >
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <div
              onClick={() => router.push("/admin")}
              className="flex items-center gap-2 font-semibold px-18 cursor-pointer"
            >
              <span>Item Kiosk</span>
            </div>
          </div>
          <div className="flex-1">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
              <Sidebar />
            </nav>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay (백그라운드 어둡게 처리 및 클릭 시 닫기) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar (슬라이드 메뉴) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex h-full max-h-screen w-[220px] flex-col border-r bg-background transition-transform duration-300 ease-in-out md:hidden ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b px-4 lg:h-[60px] lg:px-6">
          <div
            onClick={() => router.push("/admin")}
            className="flex items-center gap-2 font-semibold px-8 cursor-pointer"
          >
            <span>Item Kiosk</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium">
            <Sidebar />
          </nav>
        </div>
      </div>

      <div className="flex flex-col">
        {/* Header에 onSidebarToggle 연결 */}
        <Header
          onMenuClick={goMain}
          onSidebarToggle={() => setSidebarOpen(true)}
        />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
