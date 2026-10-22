import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { createClient } from "@/lib/supabase/server";
import { addRequester, removeRequester, setApprover, setAutoApprove } from "./actions";

const OK_TEXT: Record<string, string> = {
  REQUESTER_ADDED: "Працівника додано до відділу як заявника.",
  REQUESTER_REMOVED: "Працівника прибрано із заявників відділу.",
  APPROVER_SET: "Схвалювача призначено.",
  APPROVER_REMOVED: "Працівника прибрано зі схвалювачів.",
  AUTO_APPROVE_ON: "Автосхвалення ввімкнено.",
  AUTO_APPROVE_OFF: "Автосхвалення вимкнено.",
};

function errorText(code: string): string {
  if (code === "NOT_REQUESTER") return messageFor("NOT_REQUESTER");
  if (code === "FORBIDDEN") return messageFor("FORBIDDEN");
  return "Не вдалося зберегти зміну. Спробуйте ще раз.";
}

const button = "rounded border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700";
const select = "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// Заявники, схвалювачі й автосхвалення відділу (AC-ORG-01 … 06, 15, 19, 20, 24, 33).
export default async function DepartmentPage({ params, searchParams }: PageProps<"/admin/departments/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessSettings(user)) {
    return (
      <p role="alert" data-testid="forbidden" className="text-lg font-medium text-red-600">
        {messageFor("FORBIDDEN")}
      </p>
    );
  }

  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await createClient();

  const [deptRes, membersRes, profilesRes] = await Promise.all([
    supabase.from("departments").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("department_members").select("profile_id, is_approver, auto_approve").eq("department_id", id),
    supabase.from("profiles").select("id, email, full_name, role, is_active").order("email"),
  ]);
  if (deptRes.error || membersRes.error || profilesRes.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Не вдалося завантажити відділ. Оновіть сторінку.
      </p>
    );
  }
  if (!deptRes.data) notFound();

  const department = deptRes.data;
  const profiles = profilesRes.data;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const members = membersRes.data
    .map((m) => ({ ...m, profile: byId.get(m.profile_id) }))
    .sort((a, b) => (a.profile?.email ?? "").localeCompare(b.profile?.email ?? ""));
  const memberIds = new Set(members.map((m) => m.profile_id));
  const nonMembers = profiles.filter((p) => !memberIds.has(p.id));
  const label = (p: { email: string | null; full_name: string | null }) => p.full_name ?? p.email ?? "—";

  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/departments" className="text-sm underline">
        ← Усі відділи
      </Link>
      <h1 className="text-2xl font-semibold">{department.name}</h1>

      {typeof ok === "string" && Object.hasOwn(OK_TEXT, ok) ? (
        <p role="status" data-testid="member-message" className="text-sm text-green-700">
          {OK_TEXT[ok]}
        </p>
      ) : null}
      {typeof error === "string" ? (
        <p role="alert" data-testid="member-message" className="text-sm text-red-600">
          {errorText(error)}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Заявники відділу</h2>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500">У відділі ще немає заявників.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1">Працівник</th>
                <th>Роль</th>
                <th>Схвалювач</th>
                <th>Автосхвалення</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.profile_id} data-testid="member-row" className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2">
                    {m.profile ? label(m.profile) : m.profile_id}
                    {m.profile && !m.profile.is_active ? <span className="ml-2 text-xs text-zinc-500">(деактивований)</span> : null}
                  </td>
                  <td>{m.profile?.role ?? "—"}</td>
                  <td>
                    <form action={setApprover.bind(null, id, !m.is_approver)}>
                      <input type="hidden" name="profileId" value={m.profile_id} />
                      <button type="submit" className={button}>
                        {m.is_approver ? "Так · зняти" : "Ні · призначити"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={setAutoApprove.bind(null, id, !m.auto_approve)}>
                      <input type="hidden" name="profileId" value={m.profile_id} />
                      <button type="submit" className={button}>
                        {m.auto_approve ? "Увімкнено · вимкнути" : "Вимкнено · увімкнути"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={removeRequester.bind(null, id)}>
                      <input type="hidden" name="profileId" value={m.profile_id} />
                      <button type="submit" className={button}>
                        Прибрати із заявників
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Дії</h2>
        <form action={addRequester.bind(null, id)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="add-requester-profile" className="text-sm">Додати як заявника</label>
          <select id="add-requester-profile" name="profileId" required className={select}>
            {nonMembers.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
          <button type="submit" className={button} disabled={nonMembers.length === 0}>
            Додати
          </button>
        </form>

        {/* Список усіх працівників: призначення не заявника відхилить база (AC-ORG-02, AC-ORG-33). */}
        <form action={setApprover.bind(null, id, true)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="assign-approver-profile" className="text-sm">Призначити схвалювачем</label>
          <select id="assign-approver-profile" name="profileId" required className={select}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
          <button type="submit" className={button}>
            Призначити
          </button>
        </form>

        <form action={setAutoApprove.bind(null, id, true)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="auto-approve-profile" className="text-sm">Увімкнути автосхвалення</label>
          <select id="auto-approve-profile" name="profileId" required className={select}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
          <button type="submit" className={button}>
            Увімкнути
          </button>
        </form>
      </section>
    </main>
  );
}
