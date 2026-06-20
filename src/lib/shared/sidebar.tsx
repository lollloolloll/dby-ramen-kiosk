"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

// 1. 링크 데이터에 'forceRefresh' 같은 속성을 추가합니다.
const links = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/items", label: "물품 관리" },
  { href: "/admin/records", label: "대여 기록 관리" },
];

const operationLinks = [
  { href: "/admin/promotion", label: "프로모션" },
  { href: "/admin/consent", label: "약관" },
  { href: "/admin/theme", label: "테마 빌더" },
  {
    href: "/admin/settings",
    label: "새학기 설정",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [showOperationLinks, setShowOperationLinks] = useState(false);

  // Operation 하위 경로에 있는지 확인
  const isOperationActive = operationLinks.some(
    (link) => pathname === link.href
  );

  return (
    <div className="flex flex-col space-y-1">
      {links.map((link) => (
        <Button
          key={link.href}
          asChild
          variant={pathname === link.href ? "secondary" : "ghost"}
        >
          <Link
            prefetch={false}
            href={link.href}
          >
            {link.label}
          </Link>
        </Button>
      ))}

      <Button
        variant={isOperationActive ? "secondary" : "ghost"}
        onClick={() => setShowOperationLinks(!showOperationLinks)}
        className="justify-center relative cursor-pointer"
      >
        운영
        {showOperationLinks ? (
          <ChevronDown className="h-4 w-4 absolute right-16" />
        ) : (
          <ChevronRight className="h-4 w-4 absolute right-16" />
        )}
      </Button>

      {showOperationLinks && (
        <div className="flex flex-col space-y-1">
          {operationLinks.map((link) => (
            <Button
              key={link.href}
              asChild
              variant={pathname === link.href ? "secondary" : "ghost"}
            >
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
