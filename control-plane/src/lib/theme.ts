"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "theme";

/**
 * Runs in <head> before first paint, so the page never flashes the wrong
 * theme. Keep it dependency-free: it is inlined as a string.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="light"?false:t==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

function readStored(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    // Dark is the default until someone picks something else.
    return t === "light" || t === "system" ? t : "dark";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Follow the OS while the preference is "system".
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readStored() === "system") applyTheme("system");
    cb();
  };
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice just won't persist.
  }
  applyTheme(theme);
  for (const cb of listeners) cb();
}

/** The stored preference: "light", "dark" or "system". */
export function useThemePreference(): Theme {
  return useSyncExternalStore(subscribe, readStored, () => "dark");
}

/** Whether the page is rendering dark right now. */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );
}
