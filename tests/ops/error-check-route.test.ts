// WS11, трек B: тимчасовий маршрут /api/ops/error-check — на проді 404, поза продом лише активний адміністратор
// отримує навмисну помилку (її ловить onRequestError), інші — 403. Клієнт Supabase підмінено; getCurrentUser справжній.
import { afterEach, describe, expect, it, vi } from "vitest";
import { type TestUser, withUser } from "../support/current-user";

const state: { user: TestUser | null } = { user: null };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => withUser(state.user) }));

const { GET } = await import("@/app/api/ops/error-check/route");

afterEach(() => {
  vi.unstubAllEnvs();
  state.user = null;
});

describe("GET /api/ops/error-check", () => {
  it("на проді — 404 навіть для адміністратора", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    state.user = { id: "a1", role: "admin", isActive: true };
    expect((await GET()).status).toBe(404);
  });

  it("поза продом гість, працівник чи деактивований адміністратор — 403", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    for (const user of [null, { id: "e1", role: "employee", isActive: true }, { id: "a2", role: "admin", isActive: false }]) {
      state.user = user;
      expect((await GET()).status).toBe(403);
    }
  });

  it("поза продом активний адміністратор — навмисна помилка без даних користувача", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    state.user = { id: "a1", role: "admin", isActive: true };
    await expect(GET()).rejects.toThrow("error-check: intentional error");
  });
});
