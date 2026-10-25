import { beforeEach, describe, expect, it, vi } from "vitest";

const insertResult = { error: null as null | { code: string } };
const currentUser = { value: { id: "u1", role: "admin", isActive: true } as null | Record<string, unknown> };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/org/current-user", () => ({ getCurrentUser: async () => currentUser.value }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ insert: async () => insertResult }) }),
}));

const { createDepartment } = await import("@/app/(portal)/admin/departments/actions");

const idle = { status: "idle" as const, message: "" };
const form = (name: string) => {
  const fd = new FormData();
  fd.set("name", name);
  return fd;
};

describe("Дія createDepartment", () => {
  beforeEach(() => {
    insertResult.error = null;
    currentUser.value = { id: "u1", role: "admin", isActive: true };
  });

  it("AC-ORG-34: помилку бази 23505 (дубль назви) дія перекладає в «Відділ з такою назвою вже є»", async () => {
    insertResult.error = { code: "23505" };
    const state = await createDepartment(idle, form("початкова школа"));
    expect(state).toEqual({ status: "error", message: "Відділ з такою назвою вже є" });
  });

  it("AC-ORG-34: відділ з новою назвою створено (контроль до випадку дубля)", async () => {
    const state = await createDepartment(idle, form("Бібліотека"));
    expect(state.status).toBe("ok");
  });

  it("AC-ORG-09: не-адміністратор отримує «Недостатньо прав», навіть викликавши дію напряму", async () => {
    currentUser.value = { id: "u2", role: "requester", isActive: true };
    const state = await createDepartment(idle, form("Бібліотека"));
    expect(state).toEqual({ status: "error", message: "Недостатньо прав" });
  });
});
