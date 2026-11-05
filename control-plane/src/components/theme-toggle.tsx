"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setTheme,
  type Theme,
  useIsDark,
  useThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <MonitorIcon /> },
];

/** Light / dark / follow-the-OS switch. */
export function ThemeToggle({ className }: { className?: string }) {
  const preference = useThemePreference();
  const dark = useIsDark();

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Change theme" />
          }
        >
          {dark ? <MoonIcon /> : <SunIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {OPTIONS.map((o) => (
            <DropdownMenuItem key={o.value} onClick={() => setTheme(o.value)}>
              {o.icon}
              <span className="flex-1">{o.label}</span>
              {preference === o.value && (
                <span className="size-1.5 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
