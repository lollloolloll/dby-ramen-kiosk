"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

export function useFooterAvoidanceOffset<T extends HTMLElement>() {
  const footerRef = useRef<T | null>(null);
  const [footerOffset, setFooterOffset] = useState(0);

  const updateFooterOffset = useCallback(() => {
    const footer = footerRef.current;
    if (!footer || typeof window === "undefined") {
      setFooterOffset(0);
      return;
    }

    const footerTop = footer.getBoundingClientRect().top;
    setFooterOffset(Math.max(0, window.innerHeight - footerTop));
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateFooterOffset);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleUpdate);
    if (footerRef.current) {
      resizeObserver?.observe(footerRef.current);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [updateFooterOffset]);

  const cartBarBottomStyle = useMemo(
    () =>
      ({
        bottom: `${footerOffset}px`,
      }) satisfies React.CSSProperties,
    [footerOffset]
  );

  return { footerRef, footerOffset, cartBarBottomStyle };
}
