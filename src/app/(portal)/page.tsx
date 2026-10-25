import { Building2, ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/org/current-user";
import { departmentsWithoutApprover } from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";
import { ROLE_LABEL } from "@/lib/org/roles";
import { createClient } from "@/lib/supabase/server";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tabular-nums">
          {value}
          {hint ? <span className="ml-2 text-sm font-normal text-muted-foreground">{hint}</span> : null}
        </span>
      </CardContent>
    </Card>
  );
}

// Головна порталу: хто увійшов, з якою роллю (з таблиці profiles), і лише справжні дані.
// Віджети заявок з'являться разом із формою закупівлі (зріз 2); доти — порожній стан, без вигаданих чисел.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // RLS: адміністратор бачить усі відділи й членства; інші — лише власні.
  const [deptsRes, membersRes, profilesRes] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id, profile_id, is_approver"),
    user.role === "admin" ? supabase.from("profiles").select("id").eq("is_active", true) : Promise.resolve(null),
  ]);
  const loadError = deptsRes.error || membersRes.error || profilesRes?.error;

  const departments = deptsRes.data ?? [];
  const members = membersRes.data ?? [];
  const own = members.filter((m) => m.profile_id === user.id);
  const withoutApprover =
    user.role === "admin"
      ? departmentsWithoutApprover(
          departments.map((d) => d.id),
          members.map((m) => ({ departmentId: m.department_id, profileId: m.profile_id, isApprover: m.is_approver })),
          new Set((profilesRes?.data ?? []).map((p) => p.id)),
        )
      : new Set<string>();
  const attention = departments.filter((d) => withoutApprover.has(d.id));

  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Вітаємо{user.fullName ? `, ${user.fullName}` : ""}</h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <dt>Роль</dt>
            <dd className="text-foreground">
              {ROLE_LABEL[user.role]}{" "}
              <span data-testid="user-role" className="font-mono text-muted-foreground">
                {user.role}
              </span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt>Email</dt>
            <dd data-testid="user-email" className="text-foreground">
              {user.email ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      {loadError ? <Alert variant="destructive">Не вдалося завантажити дані. Оновіть сторінку.</Alert> : null}

      {user.role === "admin" ? (
        <section aria-label="Огляд" className="grid gap-4 sm:grid-cols-3">
          <Stat label="Відділів" value={departments.length} />
          <Stat label="Заявників у відділах" value={members.length} />
          <Stat label="Без схвалювача" value={attention.length} hint={`з ${departments.length} відділів`} />
        </section>
      ) : (
        <section aria-label="Огляд" className="grid gap-4 sm:grid-cols-2">
          <Stat label="Мої відділи" value={own.length} />
          <Stat label="Схвалюю у відділах" value={own.filter((m) => m.is_approver).length} />
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <ListChecks className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium">Заявок ще немає</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Тут з&apos;являться ваші заявки й заявки на рішення, коли запрацює форма закупівлі.
            </p>
          </CardContent>
        </Card>

        {user.role === "admin" ? (
          <Card>
            <CardHeader>
              <CardTitle>Потребують уваги</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">У кожному відділі є схвалювач.</p>
              ) : (
                attention.map((d) => (
                  <Link
                    key={d.id}
                    href={`/admin/departments/${d.id}`}
                    className="group flex items-center gap-3 rounded-lg p-2 hover:bg-muted"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Building2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="flex-1 font-medium">{d.name}</span>
                    <Badge className="bg-status-pending text-status-pending-foreground">{messageFor("NO_APPROVER")}</Badge>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Мій профіль</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/profile" className="text-sm font-medium text-accent-foreground hover:underline">
                Мої відділи й дозволи →
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
