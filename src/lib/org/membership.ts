import type { Membership } from "./roles";

export type MembershipCheck = { ok: true } | { ok: false; code: "NOT_REQUESTER" };

const isRequesterOf = (memberships: readonly Membership[], departmentId: string) =>
  memberships.some((m) => m.departmentId === departmentId);

// AC-ORG-02: схвалювачем — лише заявника відділу. Те саме правило в private.set_approver.
export function checkApproverAssignment(memberships: readonly Membership[], departmentId: string): MembershipCheck {
  return isRequesterOf(memberships, departmentId) ? { ok: true } : { ok: false, code: "NOT_REQUESTER" };
}

// AC-ORG-33: автосхвалення — лише заявнику відділу. Те саме правило в private.set_auto_approve.
export function checkAutoApprove(memberships: readonly Membership[], departmentId: string): MembershipCheck {
  return isRequesterOf(memberships, departmentId) ? { ok: true } : { ok: false, code: "NOT_REQUESTER" };
}

// AC-ORG-06: автосхвалення діє лише в обраному відділі.
export function setAutoApprove(
  memberships: readonly Membership[],
  departmentId: string,
  autoApprove: boolean,
): Membership[] {
  return memberships.map((m) => (m.departmentId === departmentId ? { ...m, autoApprove } : m));
}

// AC-ORG-01: відділи, де працівник подає заявки, — ті, де в нього є рядок членства.
export function requesterDepartmentIds(memberships: readonly Membership[]): string[] {
  return memberships.map((m) => m.departmentId);
}
