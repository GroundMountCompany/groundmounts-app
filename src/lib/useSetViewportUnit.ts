// src/lib/useSetViewportUnit.ts
"use client";
import { useEffect } from "react";

/**
 * Sets CSS var --vh to the actual innerHeight * 0.01 so we can use
 * height: calc(var(--vh) * 100) reliably on mobile (iOS Safari, etc).
 */
export function useSetViewportUnit() {
  useEffect(() => {
    const setVH = () => {
      const h = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };
    setVH();

    // Use visualViewport if available for better iOS behavior
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (vv) {
      vv.addEventListener("resize", setVH);
      vv.addEventListener("scroll", setVH);
    }
    window.addEventListener("orientationchange", setVH);
    window.addEventListener("resize", setVH);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVH);
        vv.removeEventListener("scroll", setVH);
      }
      window.removeEventListener("orientationchange", setVH);
      window.removeEventListener("resize", setVH);
    };
  }, []);
}