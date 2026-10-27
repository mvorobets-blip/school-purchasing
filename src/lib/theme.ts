// Тема інтерфейсу: вибір людини зберігає cookie theme («light» / «dark»), без нього — системне налаштування.
// Сервер ставить <html data-theme> з cookie (src/app/layout.tsx); без cookie це робить THEME_SCRIPT до першого
// малювання, тож сторінка не блимає іншою темою. Перемикач — src/components/portal/theme-toggle.tsx.
export type Theme = "light" | "dark";
export const THEME_COOKIE = "theme";

export function themeFromCookie(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

// Куди перемкне кнопка й її підпис (називає наступну тему, а не поточну).
export const nextTheme = (current: Theme): Theme => (current === "dark" ? "light" : "dark");
export const toggleLabel = (current: Theme) => `Switch to ${nextTheme(current)} theme`;

// Клік перемикача: атрибут <html data-theme> і cookie на рік — сервер наступних сторінок поставить ту саму тему.
export function applyTheme(doc: { documentElement: { dataset: DOMStringMap }; cookie: string }, theme: Theme) {
  doc.documentElement.dataset.theme = theme;
  doc.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

// Виконується в <head> до малювання сторінки. Без вибору в cookie — системна тема, і далі стежимо за її зміною
// у відкритій вкладці; щойно людина обрала тему (cookie theme), системні зміни більше не перезаписують вибір.
export const THEME_SCRIPT =
  "(function(){var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)');" +
  "function chosen(){return /(?:^|; )theme=(?:light|dark)(?:;|$)/.test(document.cookie);}" +
  "function sync(){if(!chosen())d.dataset.theme=m.matches?'dark':'light';}" +
  "if(!d.dataset.theme)sync();" +
  "if(m.addEventListener)m.addEventListener('change',sync);})();";
