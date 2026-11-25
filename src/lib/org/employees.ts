// Працівники для сторінок адміністратора (задача 4.1 плану impl-department-setup-2).

export type EmployeeProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
};

export function employeeName(p: Pick<EmployeeProfile, "email" | "full_name">): string {
  return p.full_name ?? p.email ?? "—";
}

// AC-ORG-16: деактивованого працівника немає серед варіантів вибору (заявник і схвалювач відділу).
export function approverCandidates<T extends Pick<EmployeeProfile, "is_active">>(profiles: readonly T[]): T[] {
  return profiles.filter((p) => p.is_active);
}

// Коди відповіді дій сторінки працівника → тексти для людини (тексти помилок — дослівно з вимог PM, таблиця 49).
export const EMPLOYEE_OK_TEXT: Record<string, string> = {
  DEACTIVATED: "The employee was deactivated and can no longer sign in.",
  ACTIVATED: "The employee was activated again.",
  ADMIN_REMOVED: "The administrator role was removed.",
  PERMISSION_GRANTED: "Permission granted.",
  PERMISSION_REVOKED: "Permission removed.",
};
