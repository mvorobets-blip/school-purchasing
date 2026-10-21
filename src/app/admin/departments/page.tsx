import { departmentsWithoutApprover } from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";
import { createClient } from "@/lib/supabase/server";
import { CreateDepartmentForm } from "./create-department-form";

// Список відділів для адміністратора (доступ перевіряє admin/layout.tsx).
// «Немає схвалювача» — у відділі немає жодного активного схвалювача (AC-ORG-14).
export default async function DepartmentsPage() {
  const supabase = await createClient();

  const [{ data: departments }, { data: members }, { data: profiles }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id, profile_id, is_approver"),
    supabase.from("profiles").select("id, is_active"),
  ]);

  const activeIds = new Set((profiles ?? []).filter((p) => p.is_active).map((p) => p.id));
  const withoutApprover = departmentsWithoutApprover(
    (departments ?? []).map((d) => d.id),
    (members ?? []).map((m) => ({ departmentId: m.department_id, profileId: m.profile_id, isApprover: m.is_approver })),
    activeIds,
  );

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Відділи</h1>

      {departments && departments.length > 0 ? (
        <ul className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {departments.map((d) => (
            <li key={d.id} data-testid="department-row" className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{d.name}</span>
              {withoutApprover.has(d.id) ? (
                <span data-testid="no-approver" className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                  {messageFor("NO_APPROVER")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Відділів ще немає.</p>
      )}

      <CreateDepartmentForm />
    </main>
  );
}
