import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { applyTheme, nextTheme, THEME_COOKIE, THEME_SCRIPT, themeFromCookie, toggleLabel, type Theme } from "@/lib/theme";

// Підставний document / window для THEME_SCRIPT (Vitest — середовище node, без DOM): атрибут data-theme, cookie і
// медіазапит prefers-color-scheme зі слухачами change.
function fakeBrowser({ systemDark, cookie = "", theme }: { systemDark: boolean; cookie?: string; theme?: Theme }) {
  const listeners: Array<() => void> = [];
  const media = {
    matches: systemDark,
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
  };
  const document = { documentElement: { dataset: (theme ? { theme } : {}) as DOMStringMap }, cookie };
  const window = { matchMedia: () => media };
  new Function("document", "window", THEME_SCRIPT)(document, window);
  const changeSystem = (dark: boolean) => {
    media.matches = dark;
    listeners.forEach((fn) => fn());
  };
  return { document, changeSystem };
}

describe("тема інтерфейсу", () => {
  it("cookie: лише light / dark, решта — без вибору", () => {
    expect(THEME_COOKIE).toBe("theme");
    expect(themeFromCookie("dark")).toBe("dark");
    expect(themeFromCookie("light")).toBe("light");
    for (const bad of [undefined, "", "system", "Dark", "<x>"]) expect(themeFromCookie(bad)).toBeUndefined();
  });

  it("без вибору скрипт ставить системну тему: темна система — dark, світла — light", () => {
    expect(fakeBrowser({ systemDark: true }).document.documentElement.dataset.theme).toBe("dark");
    expect(fakeBrowser({ systemDark: false }).document.documentElement.dataset.theme).toBe("light");
  });

  it("вибір із cookie (сервер уже поставив data-theme) скрипт не перезаписує", () => {
    const { document } = fakeBrowser({ systemDark: true, cookie: "theme=light", theme: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("без вибору зміна системної теми у відкритій вкладці оновлює сторінку; після вибору — ні", () => {
    const { document, changeSystem } = fakeBrowser({ systemDark: false });
    changeSystem(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme(document, "light");
    changeSystem(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("підпис кнопки називає наступну тему; клік ставить її в data-theme і cookie", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(toggleLabel("dark")).toBe("Switch to light theme");
    expect(toggleLabel("light")).toBe("Switch to dark theme");
    const document = { documentElement: { dataset: { theme: "dark" } as DOMStringMap }, cookie: "" };
    applyTheme(document, nextTheme("dark"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toMatch(/^theme=light; path=\/; max-age=31536000; samesite=lax$/);
  });

  it("кнопка — з підписом для читача екрана й зоною натискання 40 px на телефоні", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toMatch(/<button[^>]*aria-label="Switch to dark theme"/);
    expect(html).toContain("size-10");
    expect(html).toContain("md:size-7");
  });
});
