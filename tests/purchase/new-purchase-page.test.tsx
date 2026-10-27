import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";

// Сторінка «New purchase» (server component) з підміненими getCurrentUser і Supabase: гість, працівник без відділів
// і працівник з відділом. Які відділи й типи доступні, перевіряють tests/purchase/form.test.ts і tests/db/purchase.test.ts.
const state: { user: Record<string, unknown> | null; memberships: { department_id: string }[] } = {
  user: null,
  memberships: [],
};
const queried: string[] = [];

function query(table: string) {
  queried.push(table);
  const rows =
    table === "department_members"
      ? state.memberships
      : table === "employee_permissions"
        ? []
        : [{ id: "d1", name: "Початкова школа" }];
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
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

const { default: NewPurchasePage } = await import("@/app/(portal)/requests/new/page");

const render = async () => renderToStaticMarkup(await NewPurchasePage());

describe("сторінка «New purchase»", () => {
  beforeEach(() => {
    state.user = { id: "u1", role: "requester", isActive: true };
    state.memberships = [];
    queried.length = 0;
  });

  it("AC-FRM-09: гість за прямим посиланням потрапляє на сторінку входу, форми й даних не отримує", async () => {
    state.user = null;
    await expect(render()).rejects.toThrow("REDIRECT /login");
    expect(queried).toEqual([]);
  });

  it("AC-FRM-05: працівник без відділів бачить пояснення PM без полів форми", async () => {
    const html = await render();
    expect(html).toContain(messageFor("NO_DEPARTMENTS"));
    expect(html).toContain('data-testid="no-departments"');
    expect(html).not.toContain("<form");
  });

  it("AC-FRM-05: працівник із відділом бачить форму, а не пояснення про відсутність відділів", async () => {
    state.memberships = [{ department_id: "d1" }];
    const html = await render();
    expect(html).toContain("<form");
    expect(html).not.toContain('data-testid="no-departments"');
  });
});
