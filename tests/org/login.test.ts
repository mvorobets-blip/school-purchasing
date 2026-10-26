import { beforeEach, describe, expect, it, vi } from "vitest";

// Дія login з підміненим Supabase: деактивованого працівника виводимо одразу після входу (AC-ORG-12 — частина «не може
// увійти»; саму деактивацію адміністратором зробить задача 4.1 impl-department-setup).
const state = {
  signInError: null as null | { message: string },
  profile: { is_active: true } as null | { is_active: boolean },
  profileError: null as null | { message: string },
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
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            state.profileError ? { data: null, error: state.profileError } : { data: state.profile, error: null },
        }),
      }),
    }),
  }),
}));

const { login } = await import("@/app/login/actions");
const idle = { error: null, email: "" } as const;

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
    state.profileError = null;
    state.signedOut = false;
  });

  it("активний працівник входить на головну", async () => {
    await expect(login(idle, form())).rejects.toThrow("REDIRECT /");
    expect(state.signedOut).toBe(false);
  });

  it("AC-ORG-12: деактивованого працівника виведено й повернуто на вхід з повідомленням про деактивацію", async () => {
    state.profile = null; // RLS не віддає профіль неактивному
    expect(await login(idle, form())).toEqual({ error: "inactive", email: "member1@example.test" });
    expect(state.signedOut).toBe(true);
  });

  it("AC-ORG-12: профіль із is_active = false — так само вихід і повідомлення про деактивацію", async () => {
    state.profile = { is_active: false };
    expect(await login(idle, form())).toEqual({ error: "inactive", email: "member1@example.test" });
    expect(state.signedOut).toBe(true);
  });

  it("помилка читання профілю — нейтральне «спробуйте ще раз», а не «деактивовано»", async () => {
    state.profileError = { message: "network error" };
    expect(await login(idle, form())).toEqual({ error: "unavailable", email: "member1@example.test" });
    expect(state.signedOut).toBe(true);
  });

  it("неправильні дані — помилка входу без підказки, чи існує email", async () => {
    state.signInError = { message: "Invalid login credentials" };
    // Email лишається в полі після невдалого входу; у URL його немає (лише стан форми).
    expect(await login(idle, form())).toEqual({ error: "invalid", email: "member1@example.test" });
  });
});
