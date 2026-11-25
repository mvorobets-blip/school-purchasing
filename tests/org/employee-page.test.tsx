import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withUser } from "../support/current-user";

// Профіль працівника для адміністратора (server component) з підміненим клієнтом Supabase: дозволені типи заявок і
// закупівлі, які бачить адміністратор (AC-ORG-17, 25, 26, 27). Хто може видавати дозволи, доводить
// tests/db/employee-permissions.test.ts; правило типів — src/lib/org/permissions.ts, ним і рахує сторінка.
const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";
const data: { employee: Record<string, unknown>; permissions: string[] } = { employee: {}, permissions: [] };

function query(table: string) {
  const rows =
    table === "employee_permissions" ? data.permissions.map((permission) => ({ permission })) : ([] as unknown[]);
  const result = { data: rows, error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: table === "profiles" ? data.employee : null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => withUser({ id: ADMIN_ID, role: "admin", isActive: true }, { from: query }),
}));

const { default: EmployeePage } = await import("@/app/(portal)/admin/employees/[id]/page");

const render = async () =>
  renderToStaticMarkup(
    await EmployeePage({ params: Promise.resolve({ id: EMPLOYEE_ID }), searchParams: Promise.resolve({}) } as never),
  );

/** Пункти списку в секції data-testid (лише дозволені — без позначки «— not allowed»). */
function allowed(html: string, testId: string): string[] {
  const section = html.split(`data-testid="${testId}"`)[1].split("</section>")[0];
  return [...section.matchAll(/<span class="">([^<]+)<\/span><span class="sr-only">— allowed<\/span>/g)].map((m) => m[1]);
}

const employee = (role: string) => ({
  id: EMPLOYEE_ID,
  email: "member1@example.test",
  full_name: "Олена Демо",
  role,
  is_active: true,
});

describe("профіль працівника для адміністратора: дозволені типи", () => {
  beforeEach(() => {
    data.employee = employee("requester");
    data.permissions = [];
  });

  it("AC-ORG-17: працівнику без ролі admin з дозволом на «Витрату карткою» — «Card expense» серед дозволених типів заявок", async () => {
    data.permissions = ["card_expense"];
    expect(allowed(await render(), "allowed-request-types")).toContain("Card expense");
  });

  it("AC-ORG-26: працівнику без ролі admin і без дозволу — «Card expense» серед дозволених типів заявок немає", async () => {
    expect(allowed(await render(), "allowed-request-types")).not.toContain("Card expense");
  });

  it("AC-ORG-27: працівнику без ролі admin і без дозволу «Самостійна закупівля» серед типів закупівлі лише «Purchasing department»", async () => {
    expect(allowed(await render(), "allowed-purchase-types")).toEqual(["Purchasing department"]);
  });

  it("AC-ORG-25: адміністратору без дозволу на «Витрату карткою» вона серед дозволених типів заявок є", async () => {
    data.employee = employee("admin");
    expect(allowed(await render(), "allowed-request-types")).toContain("Card expense");
  });

  it("кнопки дозволів: виданий — «Revoke», не виданий — «Grant»", async () => {
    data.permissions = ["self_purchase"];
    const html = await render();
    expect(html).toContain("Revoke<span class=\"sr-only\"> Self-purchase</span>");
    expect(html).toContain("Grant<span class=\"sr-only\"> Card expense</span>");
    expect(allowed(html, "allowed-purchase-types")).toEqual(["Purchasing department", "Self-purchase"]);
  });
});
