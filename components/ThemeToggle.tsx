"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fight-schedule-theme";
type Theme = "light" | "dark";

type Props = {
  className?: string;
};

export default function ThemeToggle({ className }: Props) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    const nextTheme: Theme = savedTheme === "light" ? "light" : "dark";
    const frameId = window.requestAnimationFrame(() => {
      setTheme(nextTheme);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.body.classList.toggle("dark", theme === "dark");
    document.body.style.setProperty("--theme-progress", theme === "dark" ? "1" : "0");
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={
        className ?? "text-sm leading-none opacity-60 hover:opacity-100 transition-opacity duration-150 cursor-pointer"
      }
      aria-label="Toggle theme"
    >
      {theme === "light" ? "dark" : "light"}
    </button>
  );
}
