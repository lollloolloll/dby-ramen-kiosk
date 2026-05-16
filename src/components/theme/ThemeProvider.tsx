"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { readPreviewMode } from "@/lib/hooks/usePreviewMode";
import { applyThemeCssVars } from "@/lib/theme/theme-utils";
import { subscribeToSiteConfigChanges } from "@/lib/theme/broadcast";
import type { SiteConfig } from "@/lib/schemas/siteConfig";

const ThemeContext = createContext<SiteConfig | null>(null);

export function ThemeProvider({
  initial,
  children,
}: {
  initial: SiteConfig;
  children: ReactNode;
}) {
  const [config, setConfig] = useState(initial);
  const router = useRouter();

  // 서버에서 새 config가 내려올 때마다 동기화 (router.refresh 후 page.tsx가 새 initial을 넘김)
  useEffect(() => {
    setConfig(initial);
  }, [initial]);

  useEffect(() => {
    applyThemeCssVars(document.documentElement, config);
  }, [config]);

  useEffect(() => {
    if (!readPreviewMode()) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type !== "theme-draft") {
        return;
      }

      setConfig(event.data.payload as SiteConfig);
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { type: "preview-ready", page: window.location.pathname },
      window.location.origin
    );

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  // 다른 탭에서 admin이 config 변경 → router.refresh로 새 server-rendered config 받음
  // preview iframe은 postMessage가 이미 갱신하므로 BroadcastChannel은 무시
  useEffect(() => {
    if (readPreviewMode()) return;
    return subscribeToSiteConfigChanges(() => {
      router.refresh();
    });
  }, [router]);

  const value = useMemo(() => config, [config]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
