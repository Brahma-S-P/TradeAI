import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "trading-theme";
const FONT_SIZE_KEY = "trading-font-size";

const FONT_SIZES = [12, 13, 14, 15, 16] as const;
type FontSize = (typeof FONT_SIZES)[number];

function getStoredTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) ?? "system";
}

function getStoredFontSize(): FontSize {
  const v = parseInt(localStorage.getItem(FONT_SIZE_KEY) ?? "14", 10);
  return FONT_SIZES.includes(v as FontSize) ? (v as FontSize) : 14;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function applyFontSize(size: FontSize) {
  document.documentElement.style.fontSize = `${size}px`;
}

export function useSettings() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [fontSize, setFontSizeState] = useState<FontSize>(getStoredFontSize);

  useEffect(() => {
    applyTheme(theme);
    applyFontSize(fontSize);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  const setFontSize = useCallback((s: FontSize) => {
    setFontSizeState(s);
    localStorage.setItem(FONT_SIZE_KEY, String(s));
    applyFontSize(s);
  }, []);

  return { theme, setTheme, fontSize, setFontSize, fontSizes: FONT_SIZES };
}
