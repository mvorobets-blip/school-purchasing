import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Повідомлення сторінки працівника з ?error= / ?ok= в адресі: адресу може підставити будь-хто, тож невідомий чи
// «службовий» ключ (__proto__, constructor) має давати резервний текст, а не падіння сторінки.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { EmployeeMessage } = await import("@/app/(portal)/admin/employees/[id]/employee-sections");
const render = (props: { ok?: unknown; error?: unknown }) =>
  renderToStaticMarkup(<EmployeeMessage ok={props.ok} error={props.error} />);

describe("повідомлення сторінки працівника", () => {
  it("LAST_ADMIN — текст вимоги PM", () => {
    expect(render({ error: "LAST_ADMIN" })).toContain("At least one active administrator must remain");
  });

  it.each(["__proto__", "constructor", "toString", "NOPE"])("?error=%s — резервний текст, без падіння", (error) => {
    expect(render({ error })).toContain("Could not save the change. Try again.");
  });

  it("?ok=__proto__ — нічого не показує", () => {
    expect(render({ ok: "__proto__" })).toBe("");
  });
});
