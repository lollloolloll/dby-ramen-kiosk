"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      console.warn("⚠️ Service Worker not supported in this browser");
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister())
          )
        )
        .catch((err) => {
          console.error("❌ Service Worker unregister failed:", err);
        });

      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch((err) => {
            console.error("❌ Cache cleanup failed:", err);
          });
      }

      return;
    }

    // next.js는 hydration 타이밍 때문에 setTimeout이 없으면 등록이 누락되는 경우가 있음
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("✅ Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.error("❌ Service Worker registration failed:", err);
        });
    }, 2000); // hydration 이후에 등록되도록 약간 지연

    return () => clearTimeout(timer);
  }, []);

  return null;
}
