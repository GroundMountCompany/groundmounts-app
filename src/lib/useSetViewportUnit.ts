"use client";
import { useEffect } from "react";

type WinWithVV = Window & { visualViewport?: VisualViewport };

export function useSetViewportUnit() {
  useEffect(() => {
    const setVH = () => {
      const h = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };
    setVH();

    const w = window as WinWithVV;
    const vv: VisualViewport | undefined = w.visualViewport;

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