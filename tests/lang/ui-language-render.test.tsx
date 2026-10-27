import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Англійський інтерфейс у тому, що бачить людина (відгук PM на рев'ю WS7, #1): рендеримо сторінку входу з помилкою й
// профіль з підписом ролі та перевіряємо видимий текст, а не константи. getCurrentUser і Supabase підмінено.
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;
const state: { user: Record<string, unknown> | null } = { user: null };

function query() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  };
  return builder;
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/org/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: query }) }));

const { default: LoginPage } = await import("@/app/login/page");
const { default: ProfilePage } = await import("@/app/(portal)/profile/page");

// Видимий текст: без тегів і атрибутів, пробіли стиснуто.
const visibleText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const renderLogin = async (error?: string) =>
  visibleText(renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(error ? { error } : {}) } as never)));

describe("англійський інтерфейс на екрані", () => {
  it("AC-LANG-02: сторінка входу й помилки входу, які бачить людина, — англійською", async () => {
    const page = await renderLogin();
    expect(page).toContain("Sign in");
    expect(page).toContain("Email");
    expect(page).toContain("Password");
    expect(CYRILLIC.test(page)).toBe(false);

    for (const [key, text] of [
      ["invalid", "Incorrect email or password."],
      ["missing", "Enter your email and password."],
      ["inactive", "Account deactivated. Contact your administrator"],
      ["unavailable", "Could not sign in. Try again."],
    ]) {
      const withError = await renderLogin(key);
      expect(withError).toContain(text);
      expect(CYRILLIC.test(withError)).toBe(false);
    }
  });

  it("AC-LANG-08: у профілі видно англійський підпис ролі й незмінний ідентифікатор", async () => {
    for (const [role, label] of [
      ["requester", "Requester"],
      ["approver", "Approver"],
      ["admin", "Administrator"],
    ]) {
      state.user = { id: "u1", role, isActive: true, fullName: null, email: `${role}@example.test` };
      const page = visibleText(renderToStaticMarkup(await ProfilePage()));
      expect(page).toContain(`Role ${label} Role ID ${role}`);
      expect(CYRILLIC.test(page)).toBe(false);
    }
  });
});
