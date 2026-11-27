import { AccessList } from "@/components/portal/access-list";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYEE_OK_TEXT, type EmployeeProfile } from "@/lib/org/employees";
import { messageFor } from "@/lib/org/messages";
import { PERMISSION_LABEL, PERMISSIONS, purchaseTypeAccess, requestTypeAccess } from "@/lib/org/permissions";
import { ROLE_LABEL, type Role } from "@/lib/org/roles";
import { ConfirmAction } from "./confirm-action";
import { removeAdminRole, setEmployeeActive, setPermission } from "./actions";

// Частини сторінки профілю працівника для адміністратора (задача 4.1 плану impl-department-setup-2).

const ERROR_TEXT: Record<string, () => string> = {
  LAST_ADMIN: () => messageFor("LAST_ADMIN"),
  FORBIDDEN: () => messageFor("FORBIDDEN"),
  NOT_FOUND: () => "The employee was not found.",
};

export function EmployeeMessage({ ok, error }: { ok: unknown; error: unknown }) {
  if (typeof error === "string") {
    // Лише власні ключі: ?error=__proto__ інакше повернув би успадкований об'єкт і зламав сторінку.
    const text = Object.hasOwn(ERROR_TEXT, error) ? ERROR_TEXT[error]() : "Could not save the change. Try again.";
    // «Not enough permissions» — нейтрально (PM: людина нічого не зламала); помилки дій — червоні.
    return (
      <Alert variant={error === "FORBIDDEN" ? "default" : "destructive"} data-testid="employee-message">
        {text}
      </Alert>
    );
  }
  if (typeof ok === "string" && Object.hasOwn(EMPLOYEE_OK_TEXT, ok)) {
    return (
      <Alert role="status" data-testid="employee-message">
        {EMPLOYEE_OK_TEXT[ok]}
      </Alert>
    );
  }
  return null;
}

export function EmployeeBadges({ employee }: { employee: EmployeeProfile }) {
  return (
    <>
      <Badge variant="secondary" data-testid="employee-role">
        {ROLE_LABEL[employee.role as Role] ?? employee.role}
      </Badge>
      {employee.is_active ? (
        <Badge className="bg-status-approved text-status-approved-foreground" data-testid="employee-state">
          Active
        </Badge>
      ) : (
        <Badge variant="secondary" data-testid="employee-state">
          Deactivated
        </Badge>
      )}
    </>
  );
}

// Деактивувати (з підтвердженням) / активувати; зняти роль адміністратора — з підтвердженням (AC-ORG-10, 12, 18, 21,
// 30, 31, 32).
export function AccessCard({ employee }: { employee: EmployeeProfile }) {
  const name = employee.full_name ?? employee.email ?? "this employee";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Access</CardTitle>
        <CardDescription>
          A deactivated employee cannot sign in and is not offered as a requester or approver. Departments, approvals
          and permissions stay as they are and work again after activation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {employee.is_active ? (
          <ConfirmAction
            action={setEmployeeActive.bind(null, employee.id, false)}
            label="Deactivate"
            title={`Deactivate ${name}?`}
            description="The employee will not be able to sign in. Departments, approvals and permissions are kept."
            testId="deactivate"
          />
        ) : (
          <form action={setEmployeeActive.bind(null, employee.id, true)}>
            <Button type="submit" data-testid="activate">
              Activate
            </Button>
          </form>
        )}
        {employee.role === "admin" ? (
          <ConfirmAction
            action={removeAdminRole.bind(null, employee.id)}
            label="Remove administrator role"
            title={`Remove the administrator role from ${name}?`}
            description="The role becomes Approver if the employee approves a department, otherwise Requester. The administrator role cannot be given back in the app."
            testId="remove-admin"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DepartmentsCard({ departments }: { departments: { name: string; isApprover: boolean }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Departments</CardTitle>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not added to any department.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="employee-departments">
            {departments.map((d) => (
              <li key={d.name} className="flex items-center gap-2">
                <span>{d.name}</span>
                {d.isApprover ? <Badge variant="secondary">Approver</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Дозволи працівника (задача 5.1): видати / забрати; поруч — дозволені йому типи заявок і закупівлі, як їх рахує
// застосунок (AC-ORG-17, 25, 26 — типи заявок; AC-ORG-27 — типи закупівлі).
export function PermissionsCard({ employee, permissions }: { employee: EmployeeProfile; permissions: string[] }) {
  const role = employee.role as Role;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>
          {role === "admin"
            ? "An administrator can use every request and purchase type without permissions."
            : "Card expense, Check request, Vendor invoice and Self-purchase need a permission; Purchase, Reimbursement and Purchasing department are always allowed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Granted permissions</h2>
          <ul className="flex flex-col gap-2 text-sm" data-testid="employee-permissions">
            {PERMISSIONS.map((p) => {
              const granted = permissions.includes(p);
              return (
                <li key={p} className="flex items-center justify-between gap-2">
                  <span className={granted ? "" : "text-muted-foreground"}>{PERMISSION_LABEL[p]}</span>
                  <form action={setPermission.bind(null, employee.id, p, !granted)}>
                    <Button type="submit" size="sm" variant={granted ? "destructive" : "outline"}>
                      {granted ? "Revoke" : "Grant"}
                      <span className="sr-only"> {PERMISSION_LABEL[p]}</span>
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="flex flex-col gap-2" data-testid="allowed-request-types">
          <h2 className="text-sm font-medium">Allowed request types</h2>
          <AccessList items={requestTypeAccess(role, permissions)} />
        </section>
        <section className="flex flex-col gap-2" data-testid="allowed-purchase-types">
          <h2 className="text-sm font-medium">Allowed purchase types</h2>
          <AccessList items={purchaseTypeAccess(role, permissions)} />
        </section>
      </CardContent>
    </Card>
  );
}
