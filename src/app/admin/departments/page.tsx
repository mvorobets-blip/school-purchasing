import { redirect } from "next/navigation";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { departmentsWithoutApprover } from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";
import { createClient } from "@/lib/supabase/server";
import { CreateDepartmentForm } from "./create-department-form";

// Список відділів для адміністратора. «Немає схвалювача» — у відділі немає жодного активного схвалювача (AC-ORG-14).
export default async function DepartmentsPage() {
  // Перевіряємо права й тут, а не лише в admin/layout.tsx: layout не перевиконується при клієнтській навігації (AC-ORG-09).
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessSettings(user)) {
    return (
      <p role="alert" data-testid="forbidden" className="text-lg font-medium text-red-600">
        {messageFor("FORBIDDEN")}
      </p>
    );
  }

  const supabase = await createClient();
  // Для позначки потрібні лише схвалювачі й активні профілі — фільтруємо в запиті.
  const [departmentsRes, approversRes, activeRes] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id, profile_id, is_approver").eq("is_approver", true),
    supabase.from("profiles").select("id").eq("is_active", true),
  ]);

  // Помилку запиту показуємо, а не перетворюємо на хибне «Відділів ще немає» чи «Немає схвалювача».
  if (departmentsRes.error || approversRes.error || activeRes.error) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Відділи</h1>
        <p role="alert" className="text-sm text-red-600">
          Не вдалося завантажити відділи. Оновіть сторінку.
        </p>
      </main>
    );
  }

  const departments = departmentsRes.data;
  const withoutApprover = departmentsWithoutApprover(
    departments.map((d) => d.id),
    approversRes.data.map((m) => ({ departmentId: m.department_id, profileId: m.profile_id, isApprover: m.is_approver })),
    new Set(activeRes.data.map((p) => p.id)),
  );

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Відділи</h1>

      {departments.length > 0 ? (
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
