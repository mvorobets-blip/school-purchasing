import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_NAME_MAX,
  departmentsWithoutApprover,
  isDuplicateDepartmentName,
  isValidDepartmentName,
} from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";

describe("Відділи", () => {
  it("AC-ORG-34: відділ «початкова школа» за наявного «Початкова школа» — дубль, повідомлення «Відділ з такою назвою вже є»", () => {
    expect(isDuplicateDepartmentName("початкова школа", ["Початкова школа", "Офіс"])).toBe(true);
    expect(isDuplicateDepartmentName("  ПОЧАТКОВА ШКОЛА ", ["Початкова школа"])).toBe(true);
    expect(isDuplicateDepartmentName("Вища школа", ["Початкова школа"])).toBe(false);
    expect(messageFor("DUPLICATE_DEPARTMENT")).toBe("Відділ з такою назвою вже є");
  });

  it("AC-ORG-14: відділ без жодного активного схвалювача позначено «Немає схвалювача»", () => {
    const departments = ["primary", "office", "high"];
    const members = [
      { departmentId: "primary", profileId: "anna", isApprover: true },
      { departmentId: "office", profileId: "ivan", isApprover: true },
      { departmentId: "high", profileId: "olha", isApprover: false },
    ];
    // ivan деактивований — схвалювач «office» не активний.
    const active = new Set(["anna", "olha"]);
    expect(departmentsWithoutApprover(departments, members, active)).toEqual(new Set(["office", "high"]));
    expect(messageFor("NO_APPROVER")).toBe("Немає схвалювача");
  });

  it("назва відділу — від 1 до 100 символів", () => {
    expect(isValidDepartmentName("Офіс")).toBe(true);
    expect(isValidDepartmentName("   ")).toBe(false);
    expect(isValidDepartmentName("а".repeat(DEPARTMENT_NAME_MAX))).toBe(true);
    expect(isValidDepartmentName("а".repeat(DEPARTMENT_NAME_MAX + 1))).toBe(false);
  });
});
