import { describe, expect, it } from "vitest";
import { removeRequester, roleAfterChange, setApprover, type Membership } from "@/lib/org/roles";

const PRIMARY = "primary-school";
const OFFICE = "office";

const member = (departmentId: string, isApprover = false): Membership => ({
  departmentId,
  isApprover,
  autoApprove: false,
});

describe("Правило ролей", () => {
  it("AC-ORG-04: схвалювач єдиного відділу після зняття зі схвалювачів стає requester", () => {
    const before = [member(PRIMARY, true)];
    const after = setApprover(before, PRIMARY, false);
    expect(roleAfterChange("approver", after)).toBe("requester");
  });

  it("AC-ORG-05: працівник без ролі admin, призначений схвалювачем відділу, де він заявник, стає approver", () => {
    const before = [member(PRIMARY)];
    const after = setApprover(before, PRIMARY, true);
    expect(roleAfterChange("requester", after)).toBe("approver");
  });

  it("AC-ORG-19: схвалювач двох відділів після зняття лише з «Офісу» лишається approver і схвалює «Початкову школу»", () => {
    const before = [member(PRIMARY, true), member(OFFICE, true)];
    const after = setApprover(before, OFFICE, false);
    expect(roleAfterChange("approver", after)).toBe("approver");
    expect(after.find((m) => m.departmentId === PRIMARY)?.isApprover).toBe(true);
  });

  it("AC-ORG-24: схвалювач лише «Початкової школи» після зняття як заявника стає requester", () => {
    const before = [member(PRIMARY, true)];
    const after = removeRequester(before, PRIMARY);
    expect(after).toHaveLength(0);
    expect(roleAfterChange("approver", after)).toBe("requester");
  });

  it("AC-ORG-11: адміністратор, якого прибрали з усіх відділів, лишається admin (роль admin не залежить від відділів)", () => {
    expect(roleAfterChange("admin", [])).toBe("admin");
    expect(roleAfterChange("admin", [member(PRIMARY, true)])).toBe("admin");
  });
});
