import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InfoTip } from "@/components/portal/info-tip";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { departmentsWithoutApprover } from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";
import { createClient } from "@/lib/supabase/server";
import { CreateDepartmentDialog } from "./create-department-form";

// Список відділів для адміністратора. «No approver» — у відділі немає жодного активного схвалювача (AC-ORG-14).
export default async function DepartmentsPage() {
  // Перевіряємо права й тут, а не лише в admin/layout.tsx: layout не перевиконується при клієнтській навігації (AC-ORG-09).
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessSettings(user)) {
    return <Alert data-testid="forbidden">{messageFor("FORBIDDEN")}</Alert>;
  }

  const supabase = await createClient();
  const [departmentsRes, membersRes, profilesRes] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id, profile_id, is_approver"),
    supabase.from("profiles").select("id, email, full_name, is_active"),
  ]);

  // Помилку запиту показуємо, а не перетворюємо на хибне «Відділів ще немає» чи «No approver».
  if (departmentsRes.error || membersRes.error || profilesRes.error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Departments</h1>
        <Alert variant="destructive">Could not load departments. Refresh the page.</Alert>
      </div>
    );
  }

  const departments = departmentsRes.data;
  const members = membersRes.data;
  const profiles = new Map(profilesRes.data.map((p) => [p.id, p]));
  const active = new Set(profilesRes.data.filter((p) => p.is_active).map((p) => p.id));
  const withoutApprover = departmentsWithoutApprover(
    departments.map((d) => d.id),
    members.map((m) => ({ departmentId: m.department_id, profileId: m.profile_id, isApprover: m.is_approver })),
    active,
  );
  const requesterCount = (id: string) => members.filter((m) => m.department_id === id).length;
  const approverNames = (id: string) =>
    members
      .filter((m) => m.department_id === id && m.is_approver && active.has(m.profile_id))
      .map((m) => {
        const p = profiles.get(m.profile_id);
        return p?.full_name ?? p?.email ?? "—";
      });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="flex items-center gap-1 text-2xl font-semibold">
            Departments
            <InfoTip label="About departments">Requesters, approvers and auto-approval for each department.</InfoTip>
          </h1>
        </div>
        <CreateDepartmentDialog />
      </div>

      {departments.length > 0 ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Department</TableHead>
                <TableHead>Requesters</TableHead>
                <TableHead>Approvers</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => {
                const approvers = approverNames(d.id);
                return (
                  <TableRow key={d.id} data-testid="department-row" className="group">
                    <TableCell className="pl-4">
                      <Link
                        href={`/admin/departments/${d.id}`}
                        className="flex items-center gap-3 font-medium text-foreground hover:text-accent-foreground"
                      >
                        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <Building2 className="size-4" aria-hidden="true" />
                        </span>
                        {d.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{requesterCount(d.id)}</TableCell>
                    <TableCell>
                      {approvers.length > 0 ? approvers.join(", ") : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {withoutApprover.has(d.id) ? (
                        <Badge data-testid="no-approver" className="bg-status-pending text-status-pending-foreground">
                          {messageFor("NO_APPROVER")}
                        </Badge>
                      ) : (
                        <Badge className="bg-status-approved text-status-approved-foreground">Configured</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <ChevronRight
                        className="ml-auto size-4 text-muted-foreground group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium">No departments yet.</p>
            <p className="text-sm text-muted-foreground">Create the first department with «Create department».</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
