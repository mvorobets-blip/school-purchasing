import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";
import { withUser } from "../support/current-user";

// Сторінка «/requests/[id]/edit» (server component) з підміненим клієнтом Supabase: форма повторного подання поверненої
// заявки. Хто бачить заявку, вирішує RLS; тут — що показує сторінка за кожної відповіді бази. Фільтри .eq(…) запиту
// заявки мок застосовує до рядка (як база): сторінка може відсіяти чужу заявку фільтром author_id чи порівнянням у коді.
const ID = "11111111-1111-4111-8111-111111111111";
const USER = "u1";
const THREE_LINES = [
  { position: 1, name: "Папір А4", purpose: "Для друку", quantity: 3, price: 20, status: null },
  { position: 2, name: "Маркери", purpose: "Для дошки", quantity: 2, price: 15.5, status: null },
  { position: 3, name: "Скріпки", purpose: "Для офісу", quantity: 5, price: 1, status: null },
];
const db: { request: Record<string, unknown> | null; lines: Record<string, unknown>[] } = { request: null, lines: [] };
const queried: string[] = [];

function query(table: string) {
  queried.push(table);
  const filters: [string, unknown][] = [];
  let single = false;
  const result = () => {
    if (table === "purchase_requests") {
      const row = db.request && filters.every(([c, v]) => !(c in db.request!) || db.request![c] === v) ? db.request : null;
      return { data: single ? row : row ? [row] : [], error: null };
    }
    if (table === "purchase_request_lines") return { data: db.lines, error: null };
    if (table === "department_members") return { data: [{ department_id: "d1" }], error: null };
    if (table === "employee_permissions") return { data: [], error: null };
    // departments: один відділ — і списком, і одним рядком.
    const dept = { id: "d1", name: "Початкова школа" };
    return { data: single ? dept : [dept], error: null };
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    in: () => builder,
    order: () => builder,
    maybeSingle: () => {
      single = true;
      return builder;
    },
    single: () => {
      single = true;
      return builder;
    },
    then: (resolve: (v: unknown) => void) => resolve(result()),
  };
  return builder;
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    withUser(
      { id: USER, role: "requester", isActive: true },
      { from: query, rpc: async () => ({ data: [], error: null }) },
    ),
}));

const { default: EditRequestPage } = await import("@/app/(portal)/requests/[id]/edit/page");

const render = async () =>
  renderToStaticMarkup(await EditRequestPage({ params: Promise.resolve({ id: ID }) } as never));

// Відкривальний тег елемента з data-testid.
const tagOf = (html: string, testId: string) => html.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";
const isDisabled = (tag: string) => /\sdisabled(="[^"]*")?[\s>]|data-disabled|aria-disabled="true"/.test(tag);

describe("сторінка повторного подання «/requests/[id]/edit»", () => {
  beforeEach(() => {
    db.request = {
      id: ID,
      number: 7,
      author_id: USER,
      department_id: "d1",
      purchase_type: "purchasing_department",
      status: "returned",
      return_reason: "Уточніть кількість",
      created_at: "2026-10-26T10:00:00Z",
    };
    db.lines = THREE_LINES;
    queried.length = 0;
  });

  it("AC-DEC-07: автор поверненої заявки бачить форму з її рядками; відділ і тип показано, але заблоковано; кнопка «Submit»", async () => {
    const html = await render();
    expect(html).toContain("<form");
    // Рядки заявки — у полях форми, які автор може змінити.
    for (const value of ["Папір А4", "Для друку", "Маркери", "Для дошки", "Скріпки", "Для офісу"]) {
      expect(html).toContain(`value="${value}"`);
    }
    expect(html).toMatch(/value="3"/);
    expect(html).toMatch(/value="20(\.00)?"/);
    expect(html).toMatch(/value="15\.5(0)?"/);
    // Три рядки — три поля назви.
    expect([...html.matchAll(/name="name\.\d+"/g)]).toHaveLength(3);
    // Відділ і тип — ті самі, змінити їх не можна (#66).
    expect(html).toContain("Початкова школа");
    expect(isDisabled(tagOf(html, "purchase-department"))).toBe(true);
    expect(isDisabled(tagOf(html, "purchase-type"))).toBe(true);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Submit<\/button>/);
    expect(html).not.toContain(messageFor("FORBIDDEN"));
  });

  it("заявка автора не повернена («pending», «approved», «rejected», «partially_approved») — «Not enough permissions», форми й рядків немає", async () => {
    for (const status of ["pending", "approved", "rejected", "partially_approved"]) {
      db.request = { ...db.request, status, return_reason: null };
      const html = await render();
      expect(html).toContain(messageFor("FORBIDDEN"));
      expect(html).not.toContain("<form");
      expect(html).not.toContain("Папір А4");
    }
  });

  it("повернена заявка іншого автора (RLS віддає її схвалювачу чи адміністратору) — «Not enough permissions», форми й рядків немає", async () => {
    db.request = { ...db.request, author_id: "u2" };
    const html = await render();
    expect(html).toContain(messageFor("FORBIDDEN"));
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Папір А4");
  });

  it("заявки немає у відповіді бази (чужа чи неіснуюча) — «Not enough permissions», форми немає", async () => {
    db.request = null;
    const html = await render();
    expect(html).toContain(messageFor("FORBIDDEN"));
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Папір А4");
  });
});
