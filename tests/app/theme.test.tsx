import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { THEME_COOKIE, THEME_SCRIPT, themeFromCookie } from "@/lib/theme";

// Тема: cookie theme — лише «light» чи «dark» (інше — як без вибору, тоді діє система); скрипт ставить системну тему,
// лише якщо сервер не поставив data-theme з cookie; кнопка — ghost-іконка з aria-label.
describe("тема інтерфейсу", () => {
  it("cookie: лише light / dark, решта — без вибору", () => {
    expect(THEME_COOKIE).toBe("theme");
    expect(themeFromCookie("dark")).toBe("dark");
    expect(themeFromCookie("light")).toBe("light");
    for (const bad of [undefined, "", "system", "Dark", "<x>"]) expect(themeFromCookie(bad)).toBeUndefined();
  });

  it("скрипт не перезаписує вибір із cookie і без нього бере системну тему", () => {
    expect(THEME_SCRIPT).toContain("if(!d.dataset.theme)");
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: dark");
  });

  it("кнопка перемикача — з підписом для читача екрана", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toMatch(/<button[^>]*aria-label="Switch to (dark|light) theme"/);
  });
});
