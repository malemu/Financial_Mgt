"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

type Theme = "light" | "dark";

const getPreferredTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
};

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute("data-theme", theme);
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const preferred = getPreferredTheme();
    setTheme(preferred);
    applyTheme(preferred);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="group flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[color:var(--nav-bar-ink)] shadow-[var(--shadow)] transition hover:scale-[1.02] hover:border-white/40"
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5" />
          <path d="M12 19.5V22" />
          <path d="M2 12h2.5" />
          <path d="M19.5 12H22" />
          <path d="M4.6 4.6l1.8 1.8" />
          <path d="M17.6 17.6l1.8 1.8" />
          <path d="M4.6 19.4l1.8-1.8" />
          <path d="M17.6 6.4l1.8-1.8" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z" />
        </svg>
      )}
    </button>
  );
}
