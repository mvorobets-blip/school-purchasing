import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/org/current-user";
import { createClient } from "@/lib/supabase/server";

// Власний профіль лише для читання: відділи, де працівник подає заявки, схвалення й автосхвалення (AC-ORG-01).
// RLS віддає лише власні рядки department_members і відділи, де є членство.
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [membersRes, deptsRes] = await Promise.all([
    supabase.from("department_members").select("department_id, is_approver, auto_approve").eq("profile_id", user.id),
    supabase.from("departments").select("id, name"),
  ]);
  if (membersRes.error || deptsRes.error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <p role="alert" className="text-sm text-red-600">
          Не вдалося завантажити профіль. Оновіть сторінку.
        </p>
      </main>
    );
  }

  const names = new Map(deptsRes.data.map((d) => [d.id, d.name]));
  const rows = membersRes.data
    .map((m) => ({ ...m, name: names.get(m.department_id) ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/" className="text-sm underline">
        ← Головна
      </Link>
      <h1 className="text-2xl font-semibold">Мій профіль</h1>
      <p className="text-sm">
        Роль: <span data-testid="profile-role">{user.role}</span>
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Відділи, де я подаю заявки</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">Мене ще не додано до жодного відділу.</p>
        ) : (
          <ul data-testid="profile-departments" className="flex flex-col gap-1 text-sm">
            {rows.map((r) => (
              <li key={r.department_id}>
                {r.name}
                {r.is_approver ? " · схвалюю" : ""}
                {r.auto_approve ? " · автосхвалення" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
