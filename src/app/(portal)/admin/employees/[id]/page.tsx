import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/portal/back-link";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { Alert } from "@/components/ui/alert";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { employeeName } from "@/lib/org/employees";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { AccessCard, DepartmentsCard, EmployeeBadges, EmployeeMessage } from "./employee-sections";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Профіль працівника і його відділи; помилка запиту — null (сторінка покаже Alert, а не хибне «не знайдено»).
async function loadEmployee(supabase: Supabase, id: string) {
  const [profileRes, membersRes] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, is_active").eq("id", id).maybeSingle(),
    supabase.from("department_members").select("is_approver, departments(name)").eq("profile_id", id),
  ]);
  if (profileRes.error || membersRes.error) return null;
  const departments = membersRes.data
    .map((m) => ({ name: (m.departments as { name: string } | null)?.name ?? "—", isApprover: m.is_approver }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { employee: profileRes.data, departments };
}

// Профіль працівника для адміністратора: стан, роль, відділи; деактивувати / активувати, зняти роль адміністратора.
// AC-ORG-10, 12, 18, 21, 30, 31, 32 (правила — у базі: private.set_active, private.remove_admin_role).
export default async function EmployeePage({ params, searchParams }: PageProps<"/admin/employees/[id]">) {
  const [user, { id }, { ok, error }] = await Promise.all([getCurrentUser(), params, searchParams]);
  if (!user) redirect("/login");
  if (!canAccessSettings(user)) {
    return <ForbiddenCard hint="Only administrators can open settings." backHref="/" backLabel="Back to home" />;
  }
  // id — uuid: інакше запит до бази впаде, і сторінка показала б помилку завантаження замість 404.
  if (!isUuid(id)) notFound();

  const loaded = await loadEmployee(await createClient(), id);
  if (!loaded) return <Alert variant="destructive">Could not load the employee. Refresh the page.</Alert>;
  const { employee, departments } = loaded;
  if (!employee) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin/employees">All employees</BackLink>
        <h1 className="text-2xl font-semibold">
          {employeeName(employee)}
          {employee.id === user.id ? <span className="text-muted-foreground"> (you)</span> : null}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {employee.full_name && employee.email ? <span>{employee.email}</span> : null}
          <EmployeeBadges employee={employee} />
        </div>
      </div>
      <EmployeeMessage ok={ok} error={error} />
      <AccessCard employee={employee} />
      <DepartmentsCard departments={departments} />
    </div>
  );
}
