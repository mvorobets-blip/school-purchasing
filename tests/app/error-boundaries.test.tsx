import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppError from "@/app/error";
import PortalError from "@/app/(portal)/error";

// Межі помилок: src/app/error.tsx ловить помилки (portal)/layout.tsx (getCurrentUser), бо error.tsx не обгортає layout
// свого сегмента; (portal)/error.tsx — помилки сторінок порталу. Обидві показують помилку завантаження, а не вхід.
describe("межі помилок", () => {
  for (const [name, Boundary] of [
    ["src/app/error.tsx", AppError],
    ["src/app/(portal)/error.tsx", PortalError],
  ] as const) {
    it(`${name}: повідомлення про помилку завантаження й «Try again»`, () => {
      const html = renderToStaticMarkup(<Boundary error={new Error("boom")} retry={() => {}} />);
      expect(html).toContain("Could not load the page. Refresh the page.");
      expect(html).toContain("Try again");
      expect(html).not.toContain("Sign in");
    });
  }
});
