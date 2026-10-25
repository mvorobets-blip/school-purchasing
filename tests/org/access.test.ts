import { describe, expect, it } from "vitest";
import { canAccessSettings } from "@/lib/org/access";
import { messageFor } from "@/lib/org/messages";

describe("Доступ до налаштувань працівників і відділів", () => {
  it("AC-ORG-09: користувач без ролі admin не має доступу й бачить «Not enough permissions»", () => {
    expect(canAccessSettings({ role: "requester", isActive: true })).toBe(false);
    expect(canAccessSettings({ role: "approver", isActive: true })).toBe(false);
    expect(canAccessSettings(null)).toBe(false);
    expect(messageFor("FORBIDDEN")).toBe("Not enough permissions");
  });

  it("активний адміністратор має доступ, деактивований — ні", () => {
    expect(canAccessSettings({ role: "admin", isActive: true })).toBe(true);
    expect(canAccessSettings({ role: "admin", isActive: false })).toBe(false);
  });
});
