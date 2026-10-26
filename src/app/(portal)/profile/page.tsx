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
          <span className="sr-only">{t.allowed ? "— allowed" : "— not allowed"}</span>
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
    return <Alert variant="destructive">Could not load the profile. Refresh the page.</Alert>;
  }

  const names = new Map(deptsRes.data.map((d) => [d.id, d.name]));
  const rows = membersRes.data
    .map((m) => ({ ...m, name: names.get(m.department_id) ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));
  const permissions = permsRes.data.map((p) => p.permission);
  const displayName = user.fullName ?? user.email ?? "—";

  return (
    <>
      <h1 className="text-2xl font-semibold">My profile</h1>

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
          {/* Підпис ролі англійською й незмінний ідентифікатор поруч (AC-LANG-08): список «назва — значення»
              праворуч за розділювачем; на телефоні — під ім'ям. */}
          <dl className="grid w-full grid-cols-[auto_auto] items-center justify-start gap-x-4 gap-y-1.5 border-t border-border pt-4 text-sm sm:w-auto sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
            </dd>
            <dt className="text-muted-foreground">Role ID</dt>
            <dd>
              <code data-testid="profile-role" className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
                {user.role}
              </code>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            My departments
            <InfoTip label="About my departments">Departments where you submit requests. Managed by an administrator.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">I have not been added to any department yet.</p>
          ) : (
            <Table data-testid="profile-departments">
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>My role in the department</TableHead>
                  <TableHead>Auto-approval</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.department_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.is_approver ? "Requester and approver" : "Requester"}</TableCell>
                    <TableCell>{r.auto_approve ? "On" : <span className="text-muted-foreground">—</span>}</TableCell>
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
            My permissions
            <InfoTip label="About my permissions">Request and purchase types available to you. Permissions are granted by an administrator.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Request types</h2>
            <AccessList items={requestTypeAccess(user.role, permissions)} />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Purchase types</h2>
            <AccessList items={purchaseTypeAccess(user.role, permissions)} />
          </section>
        </CardContent>
      </Card>
    </>
  );
}
