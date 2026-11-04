import { beforeEach, describe, expect, it, vi } from "vitest";
import { type TestUser, withUser } from "../support/current-user";

const insertResult = { error: null as null | { code: string } };
const currentUser = { value: { id: "u1", role: "admin", isActive: true } as TestUser | null };
// Запис у departments фіксуємо, щоб перевірити: без прав дія нічого не пише (перевірка прав — до запису, AGENTS.md).
const insert = vi.fn(async () => insertResult);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => withUser(currentUser.value, { from: () => ({ insert }) }),
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
    insert.mockClear();
  });

  it("AC-ORG-34: помилку бази 23505 (дубль назви) дія перекладає в «A department with this name already exists»", async () => {
    insertResult.error = { code: "23505" };
    const state = await createDepartment(idle, form("початкова школа"));
    expect(state).toEqual({ status: "error", message: "A department with this name already exists" });
  });

  it("AC-ORG-34: відділ з новою назвою створено (контроль до випадку дубля)", async () => {
    const state = await createDepartment(idle, form("Бібліотека"));
    expect(state.status).toBe("ok");
  });

  it("AC-ORG-09: не-адміністратор отримує «Not enough permissions», навіть викликавши дію напряму", async () => {
    currentUser.value = { id: "u2", role: "requester", isActive: true };
    const state = await createDepartment(idle, form("Бібліотека"));
    expect(state).toEqual({ status: "error", message: "Not enough permissions" });
    expect(insert).not.toHaveBeenCalled();
  });
});
