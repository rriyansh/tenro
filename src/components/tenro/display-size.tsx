import { useEffect } from "react";

function applyDisplay() {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const mode = width < 640 ? "phone" : width < 1024 ? "tablet" : "desk";
  document.documentElement.dataset.display = mode;
  document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
}

/** Sizes the app to the visible screen, including phone browser chrome. */
export function DisplaySize() {
  useEffect(() => {
    applyDisplay();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", applyDisplay);
    viewport?.addEventListener("scroll", applyDisplay);
    window.addEventListener("resize", applyDisplay);
    window.addEventListener("orientationchange", applyDisplay);
    return () => {
      viewport?.removeEventListener("resize", applyDisplay);
      viewport?.removeEventListener("scroll", applyDisplay);
      window.removeEventListener("resize", applyDisplay);
      window.removeEventListener("orientationchange", applyDisplay);
    };
  }, []);
  return null;
}
