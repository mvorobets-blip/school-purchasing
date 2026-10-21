export const DEPARTMENT_NAME_MAX = 100;

export type DepartmentMember = { departmentId: string; profileId: string; isApprover: boolean };

// Так само, як унікальний індекс lower(btrim(name)) у базі.
export function normalizeDepartmentName(name: string): string {
  return name.trim().toLowerCase();
}

export function isValidDepartmentName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= DEPARTMENT_NAME_MAX;
}

// AC-ORG-34: дубль назви без урахування регістру.
export function isDuplicateDepartmentName(name: string, existingNames: readonly string[]): boolean {
  const normalized = normalizeDepartmentName(name);
  return existingNames.some((existing) => normalizeDepartmentName(existing) === normalized);
}

// AC-ORG-14: відділ без жодного активного схвалювача.
export function departmentsWithoutApprover(
  departmentIds: readonly string[],
  members: readonly DepartmentMember[],
  activeProfileIds: ReadonlySet<string>,
): Set<string> {
  const covered = new Set(
    members.filter((m) => m.isApprover && activeProfileIds.has(m.profileId)).map((m) => m.departmentId),
  );
  return new Set(departmentIds.filter((id) => !covered.has(id)));
}
