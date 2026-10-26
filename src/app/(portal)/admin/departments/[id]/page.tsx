import { Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InfoTip } from "@/components/portal/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { initials } from "@/lib/org/permissions";
import { ROLE_LABEL, type Role } from "@/lib/org/roles";
import { createClient } from "@/lib/supabase/server";
import { addRequester, removeRequester, setApprover, setAutoApprove } from "./actions";
import { DepartmentActions, MemberMenu, MemberSwitch, type Person } from "./member-controls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OK_TEXT: Record<string, string> = {
  REQUESTER_ADDED: "The employee was added to the department as a requester.",
  REQUESTER_REMOVED: "The employee was removed from the department's requesters.",
  APPROVER_SET: "Approver assigned.",
  APPROVER_REMOVED: "The employee is no longer an approver.",
  AUTO_APPROVE_ON: "Auto-approval turned on.",
  AUTO_APPROVE_OFF: "Auto-approval turned off.",
};

function errorText(code: string): string {
  if (code === "NOT_REQUESTER") return messageFor("NOT_REQUESTER");
  if (code === "FORBIDDEN") return messageFor("FORBIDDEN");
  return "Could not save the change. Try again.";
}

// Заявники, схвалювачі й автосхвалення відділу (AC-ORG-01 … 06, 15, 19, 20, 24, 33).
export default async function DepartmentPage({ params, searchParams }: PageProps<"/admin/departments/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessSettings(user)) {
    return (
      <Alert data-testid="forbidden">{messageFor("FORBIDDEN")}</Alert>
    );
  }

  const { id } = await params;
  // id — uuid: інакше запит до бази впаде, і сторінка показала б помилку завантаження замість 404.
  if (!UUID.test(id)) notFound();
  const { ok, error } = await searchParams;
  const supabase = await createClient();

  const [deptRes, membersRes, profilesRes] = await Promise.all([
    supabase.from("departments").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("department_members").select("profile_id, is_approver, auto_approve").eq("department_id", id),
    supabase.from("profiles").select("id, email, full_name, role, is_active").order("email"),
  ]);
  if (deptRes.error || membersRes.error || profilesRes.error) {
    return (
      <Alert variant="destructive">Could not load the department. Refresh the page.</Alert>
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

  const people = (list: typeof profiles): Person[] => list.map((p) => ({ value: p.id, label: label(p) }));
  const activeApprovers = members.filter((m) => m.is_approver && m.profile?.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href="/admin/departments" className="text-sm text-muted-foreground hover:text-foreground">
            ← All departments
          </Link>
          <h1 className="text-2xl font-semibold">{department.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Requesters: {members.length}</span>
            <span aria-hidden="true">·</span>
            <span>Approvers: {activeApprovers}</span>
            {activeApprovers === 0 ? (
              <Badge className="bg-status-pending text-status-pending-foreground">{messageFor("NO_APPROVER")}</Badge>
            ) : null}
          </div>
        </div>
        {/* key: після дії сервер перенаправляє на ?ok= / ?error= — компонент перемонтовується, діалоги закриваються. */}
        <DepartmentActions
          key={`${typeof ok === "string" ? ok : ""}-${typeof error === "string" ? error : ""}`}
          addRequester={addRequester.bind(null, id)}
          setApprover={setApprover.bind(null, id, true)}
          setAutoApprove={setAutoApprove.bind(null, id, true)}
          candidates={people(nonMembers)}
          everyone={people(profiles)}
        />
      </div>

      {typeof ok === "string" && Object.hasOwn(OK_TEXT, ok) ? (
        <Alert role="status" data-testid="member-message">
          {OK_TEXT[ok]}
        </Alert>
      ) : null}
      {typeof error === "string" ? (
        // «Not enough permissions» — нейтрально (PM: людина нічого не зламала); помилки дій — червоні.
        <Alert variant={error === "FORBIDDEN" ? "default" : "destructive"} data-testid="member-message">
          {errorText(error)}
        </Alert>
      ) : null}

      <Card className={members.length === 0 ? undefined : "pb-0"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Department requesters
            <InfoTip label="About requesters, approvers and auto-approval">
              An approver decides the department&apos;s requests; with auto-approval an employee&apos;s requests are approved right away.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        {members.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium">The department has no requesters yet.</p>
            <p className="text-sm text-muted-foreground">Add an employee with «Add requester».</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Auto-approval</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const name = m.profile ? label(m.profile) : m.profile_id;
                return (
                  <TableRow key={m.profile_id} data-testid="member-row">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                            {initials(m.profile?.full_name ?? null, m.profile?.email ?? null)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{name}</span>
                          {m.profile?.full_name && m.profile.email ? (
                            <span className="truncate text-sm text-muted-foreground">{m.profile.email}</span>
                          ) : null}
                        </div>
                        {m.profile && !m.profile.is_active ? <Badge variant="secondary">deactivated</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.profile ? <Badge variant="secondary">{ROLE_LABEL[m.profile.role as Role]}</Badge> : "—"}
                    </TableCell>
                    <TableCell>
                      <MemberSwitch
                        profileId={m.profile_id}
                        checked={m.is_approver}
                        action={setApprover.bind(null, id)}
                        label={`Approver: ${name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <MemberSwitch
                        profileId={m.profile_id}
                        checked={m.auto_approve}
                        action={setAutoApprove.bind(null, id)}
                        label={`Auto-approval: ${name}`}
                      />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <MemberMenu profileId={m.profile_id} name={name} remove={removeRequester.bind(null, id)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
