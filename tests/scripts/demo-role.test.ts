import { describe, expect, it } from "vitest";
import { demoRole } from "../../scripts/lib/demo-role.mjs";

// npm run users:demo: роль admin — з demo-users.json, requester / approver — за правилом бази (private.sync_role).
describe("scripts/lib/demo-role.mjs", () => {
  it("admin лишається admin незалежно від членства", () => {
    expect(demoRole("admin", false)).toBe("admin");
    expect(demoRole("admin", true)).toBe("admin");
  });

  it("не-admin, що схвалює хоча б один відділ, — approver, навіть якщо в JSON requester", () => {
    expect(demoRole("requester", true)).toBe("approver");
    expect(demoRole("approver", true)).toBe("approver");
  });

  it("не-admin без схвалення — requester, навіть якщо в JSON approver (схвалювача зняли)", () => {
    expect(demoRole("approver", false)).toBe("requester");
    expect(demoRole("requester", false)).toBe("requester");
  });

  it("невідома роль — помилка, а не мовчазний requester", () => {
    expect(() => demoRole("manager", false)).toThrow(/невідома роль «manager»/);
    expect(() => demoRole(undefined, true)).toThrow(/невідома роль/);
  });
});
