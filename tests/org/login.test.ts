import { beforeEach, describe, expect, it, vi } from "vitest";

// Дія login з підміненим Supabase: деактивованого працівника виводимо одразу після входу (AC-ORG-12 — частина «не може
// увійти»; деактивацію адміністратором зробить задача 4.1, тому AC ID у назві тесту поки немає).
const state = {
  signInError: null as null | { message: string },
  profile: { is_active: true } as null | { is_active: boolean },
  signedOut: false,
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () =>
        state.signInError ? { data: { user: null }, error: state.signInError } : { data: { user: { id: "u1" } }, error: null },
      signOut: async () => {
        state.signedOut = true;
        return { error: null };
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }),
  }),
}));

const { login } = await import("@/app/login/actions");

const form = () => {
  const fd = new FormData();
  fd.set("email", "member1@example.test");
  fd.set("password", "x");
  return fd;
};

describe("вхід", () => {
  beforeEach(() => {
    state.signInError = null;
    state.profile = { is_active: true };
    state.signedOut = false;
  });

  it("активний працівник входить на головну", async () => {
    await expect(login(form())).rejects.toThrow("REDIRECT /");
    expect(state.signedOut).toBe(false);
  });

  it("деактивованого працівника виведено й повернуто на вхід з повідомленням про деактивацію", async () => {
    state.profile = null; // RLS не віддає профіль неактивному
    await expect(login(form())).rejects.toThrow("REDIRECT /login?error=inactive");
    expect(state.signedOut).toBe(true);
  });

  it("неправильні дані — помилка входу без підказки, чи існує email", async () => {
    state.signInError = { message: "Invalid login credentials" };
    await expect(login(form())).rejects.toThrow("REDIRECT /login?error=invalid");
  });
});
