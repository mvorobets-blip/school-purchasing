"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { applyTheme, nextTheme, toggleLabel, type Theme } from "@/lib/theme";

// Поточна тема — атрибут <html data-theme> (його ставить сервер або THEME_SCRIPT); підписка — на зміну атрибута.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

// Перемикач світлої й темної теми (DESIGN.md §5, ghost-кнопка-іконка в шапці бічної панелі). Показує, куди
// перемкне: у темній — сонце («Switch to light theme»), у світлій — місяць. Вибір зберігає cookie на рік.
// Розмір: на телефоні (бічна панель — висувна) зона натискання 40 px (DESIGN.md §4), на комп'ютері — як
// SidebarTrigger (icon-sm), щоб назва застосунку вміщалась у шапці.
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);
  const current: Theme = theme ?? "light";
  const label = toggleLabel(current);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-10 md:size-7"
      aria-label={label}
      title={label}
      onClick={() => applyTheme(document, nextTheme(current))}
    >
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
