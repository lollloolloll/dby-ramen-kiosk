"use client";

import { useEffect, useState } from "react";

export function readPreviewMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("preview") === "1";
}

export function usePreviewMode() {
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    setIsPreview(readPreviewMode());
  }, []);

  return isPreview;
}
