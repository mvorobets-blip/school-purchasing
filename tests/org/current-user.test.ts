import { beforeEach, describe, expect, it, vi } from "vitest";

// getCurrentUser з підміненим Supabase: гість і деактивований (RLS не віддає профіль) — null, а помилка бази — не
// «гість»: кидаємо помилку, і сторінку замінює (portal)/error.tsx замість перенаправлення на вхід.
const state: { sub: string | null; profile: Record<string, unknown> | null; error: { message: string } | null } = {
  sub: null,
  profile: null,
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.sub ? { claims: { sub: state.sub } } : null }) },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.profile, error: state.error }),
      };
      return builder;
    },
  }),
}));

const { getCurrentUser } = await import("@/lib/org/current-user");

describe("getCurrentUser", () => {
  beforeEach(() => {
    state.sub = "u1";
    state.profile = { id: "u1", email: "pm@example.test", full_name: "PM Demo", role: "requester", is_active: true };
    state.error = null;
  });

  it("гість без сесії — null", async () => {
    state.sub = null;
    expect(await getCurrentUser()).toBeNull();
  });

  it("профілю немає (деактивований, RLS його не віддає) — null", async () => {
    state.profile = null;
    expect(await getCurrentUser()).toBeNull();
  });

  it("помилка запиту профілю — кидає помилку, а не повертає null (не «гість»)", async () => {
    state.profile = null;
    state.error = { message: "boom" };
    await expect(getCurrentUser()).rejects.toThrow("Could not load the current user profile");
  });

  it("активний профіль — роль і ім'я з profiles", async () => {
    expect(await getCurrentUser()).toMatchObject({ id: "u1", role: "requester", fullName: "PM Demo", isActive: true });
  });
});
