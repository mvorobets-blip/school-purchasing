// «Правило ролей» (requirements/product.md): ту саму логіку в базі виконує тригер private.sync_role.
export type Role = "requester" | "approver" | "admin";

export type Membership = {
  departmentId: string;
  isApprover: boolean;
  autoApprove: boolean;
};

export function roleAfterChange(currentRole: Role, memberships: readonly Membership[]): Role {
  if (currentRole === "admin") return "admin";
  return memberships.some((m) => m.isApprover) ? "approver" : "requester";
}

export function setApprover(
  memberships: readonly Membership[],
  departmentId: string,
  isApprover: boolean,
): Membership[] {
  return memberships.map((m) => (m.departmentId === departmentId ? { ...m, isApprover } : m));
}

// Рядок членства = заявник; без нього немає ні схвалення, ні автосхвалення (AC-ORG-03, AC-ORG-15).
export function removeRequester(memberships: readonly Membership[], departmentId: string): Membership[] {
  return memberships.filter((m) => m.departmentId !== departmentId);
}
