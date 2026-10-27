// Тема інтерфейсу: вибір людини зберігає cookie theme («light» / «dark»), без нього — системне налаштування.
// Сервер ставить <html data-theme> з cookie (src/app/layout.tsx); без cookie це робить THEME_SCRIPT до першого
// малювання, тож сторінка не блимає іншою темою. Перемикач — src/components/portal/theme-toggle.tsx.
export type Theme = "light" | "dark";
export const THEME_COOKIE = "theme";

export function themeFromCookie(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

// Без збереженого вибору — системна тема; виконується в <head> до малювання сторінки.
export const THEME_SCRIPT =
  "(function(){var d=document.documentElement;if(!d.dataset.theme){d.dataset.theme=" +
  "window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}})();";
