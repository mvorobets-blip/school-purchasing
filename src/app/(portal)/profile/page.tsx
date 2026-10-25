import { Check, Minus } from "lucide-react";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/portal/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/org/current-user";
import { initials, purchaseTypeAccess, requestTypeAccess, type TypeAccess } from "@/lib/org/permissions";
import { ROLE_LABEL } from "@/lib/org/roles";
import { createClient } from "@/lib/supabase/server";

function AccessList({ items }: { items: TypeAccess[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((t) => (
        <li key={t.label} className="flex items-center gap-2">
          {t.allowed ? (
            <Check className="size-4 text-accent-foreground" aria-hidden="true" />
          ) : (
            <Minus className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={t.allowed ? "" : "text-muted-foreground"}>{t.label}</span>
          <span className="sr-only">{t.allowed ? "— дозволено" : "— немає дозволу"}</span>
        </li>
      ))}
    </ul>
  );
}

// Власний профіль лише для читання: дані користувача, відділи (AC-ORG-01), схвалення, автосхвалення й дозволи.
// RLS віддає лише власні рядки department_members і employee_permissions та відділи, де є членство.
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [membersRes, deptsRes, permsRes] = await Promise.all([
    supabase.from("department_members").select("department_id, is_approver, auto_approve").eq("profile_id", user.id),
    supabase.from("departments").select("id, name"),
    supabase.from("employee_permissions").select("permission").eq("profile_id", user.id),
  ]);
  if (membersRes.error || deptsRes.error || permsRes.error) {
    return <Alert variant="destructive">Не вдалося завантажити профіль. Оновіть сторінку.</Alert>;
  }

  const names = new Map(deptsRes.data.map((d) => [d.id, d.name]));
  const rows = membersRes.data
    .map((m) => ({ ...m, name: names.get(m.department_id) ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));
  const permissions = permsRes.data.map((p) => p.permission);
  const displayName = user.fullName ?? user.email ?? "—";

  return (
    <>
      <h1 className="text-2xl font-semibold">Мій профіль</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-foreground"
          >
            {initials(user.fullName, user.email)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-lg font-medium">{displayName}</p>
            {user.fullName && user.email ? <p className="truncate text-sm text-muted-foreground">{user.email}</p> : null}
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Роль</dt>
              <dd className="flex items-center gap-2">
                <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
                <span data-testid="profile-role" className="font-mono text-sm text-muted-foreground">
                  {user.role}
                </span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Мої відділи
            <InfoTip label="Про мої відділи">Відділи, де ви подаєте заявки. Змінює адміністратор.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Мене ще не додано до жодного відділу.</p>
          ) : (
            <Table data-testid="profile-departments">
              <TableHeader>
                <TableRow>
                  <TableHead>Відділ</TableHead>
                  <TableHead>Моя роль у відділі</TableHead>
                  <TableHead>Автосхвалення</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.department_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.is_approver ? "Заявник і схвалювач" : "Заявник"}</TableCell>
                    <TableCell>{r.auto_approve ? "Увімкнено" : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Мої дозволи
            <InfoTip label="Про мої дозволи">Які типи заявок і закупівлі вам доступні. Дозволи видає адміністратор.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Типи заявок</h2>
            <AccessList items={requestTypeAccess(user.role, permissions)} />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Типи закупівлі</h2>
            <AccessList items={purchaseTypeAccess(user.role, permissions)} />
          </section>
        </CardContent>
      </Card>
    </>
  );
}
