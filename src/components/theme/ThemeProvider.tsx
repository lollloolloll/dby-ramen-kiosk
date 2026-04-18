"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { readPreviewMode } from "@/lib/hooks/usePreviewMode";
import { applyThemeCssVars } from "@/lib/theme/theme-utils";
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
