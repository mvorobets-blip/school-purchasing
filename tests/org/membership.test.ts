import { describe, expect, it } from "vitest";
import {
  checkApproverAssignment,
  checkAutoApprove,
  requesterDepartmentIds,
  setAutoApprove,
} from "@/lib/org/membership";
import { messageFor } from "@/lib/org/messages";
import { removeRequester, roleAfterChange, setApprover, type Membership } from "@/lib/org/roles";

const PRIMARY = "primary-school";
const HIGH = "high-school";
const OFFICE = "office";

const member = (departmentId: string, isApprover = false, autoApprove = false): Membership => ({
  departmentId,
  isApprover,
  autoApprove,
});

describe("Заявники, схвалювачі, автосхвалення", () => {
  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): після додавання працівника без відділів до «Початкової школи» серед його відділів лише «Початкова школа»", () => {
    const before: Membership[] = [];
    const after = [...before, member(PRIMARY)];
    expect(requesterDepartmentIds(after)).toEqual([PRIMARY]);
  });

  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): призначення схвалювачем «Вищої школи» не заявника відхилено з «Add the employee to the department as a requester first»", () => {
    const result = checkApproverAssignment([member(PRIMARY)], HIGH);
    expect(result).toEqual({ ok: false, code: "NOT_REQUESTER" });
    expect(messageFor("NOT_REQUESTER")).toBe("Add the employee to the department as a requester first");
  });

  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): зняття заявника «Початкової школи» знімає й схвалення цього відділу", () => {
    const after = removeRequester([member(PRIMARY, true)], PRIMARY);
    expect(after.some((m) => m.departmentId === PRIMARY && m.isApprover)).toBe(false);
  });

  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): автосхвалення лише в «Офісі» не вмикає його в «Початковій школі»", () => {
    const after = setAutoApprove([member(PRIMARY), member(OFFICE)], OFFICE, true);
    expect(after.find((m) => m.departmentId === OFFICE)?.autoApprove).toBe(true);
    expect(after.find((m) => m.departmentId === PRIMARY)?.autoApprove).toBe(false);
  });

  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): зняття заявника «Початкової школи» знімає автосхвалення цього відділу", () => {
    const after = removeRequester([member(PRIMARY, false, true)], PRIMARY);
    expect(after.some((m) => m.departmentId === PRIMARY && m.autoApprove)).toBe(false);
  });

  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): адміністратор, призначений схвалювачем відділу, де він заявник, лишається admin і схвалює цей відділ", () => {
    const before = [member(PRIMARY)];
    expect(checkApproverAssignment(before, PRIMARY)).toEqual({ ok: true });
    const after = setApprover(before, PRIMARY, true);
    expect(roleAfterChange("admin", after)).toBe("admin");
    expect(after.find((m) => m.departmentId === PRIMARY)?.isApprover).toBe(true);
  });

  it("модель TS, у застосунку не використовується (правило доводить тест бази tests/db/org-roles.test.ts): увімкнення автосхвалення у «Вищій школі» не заявнику відхилено з «Add the employee to the department as a requester first»", () => {
    expect(checkAutoApprove([member(PRIMARY)], HIGH)).toEqual({ ok: false, code: "NOT_REQUESTER" });
    expect(checkAutoApprove([member(HIGH)], HIGH)).toEqual({ ok: true });
  });
});
