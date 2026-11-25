import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { InfoTip } from "@/components/portal/info-tip";
import { CLICKABLE_ROW, RowLink } from "@/components/portal/row-link";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { employeeName } from "@/lib/org/employees";
import { initials } from "@/lib/org/permissions";
import { ROLE_LABEL, type Role } from "@/lib/org/roles";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Список працівників для адміністратора: роль і стан (активний / деактивований). AC-ORG-09 (лише адміністратор),
// AC-ORG-12, AC-ORG-30 (стан після деактивації й повторної активації).
export default async function EmployeesPage() {
  // Права — і тут, а не лише в admin/layout.tsx: layout не перевиконується при клієнтській навігації (AC-ORG-09).
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessSettings(user)) {
    return <ForbiddenCard hint="Only administrators can open settings." backHref="/" backLabel="Back to home" />;
  }

  const supabase = await createClient();
  const { data: employees, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .order("email");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-1 text-2xl font-semibold">
        Employees
        <InfoTip label="About employees">
          Deactivate employees who left the school, activate them again, remove the administrator role.
        </InfoTip>
      </h1>

      {error ? (
        <Alert variant="destructive">Could not load employees. Refresh the page.</Alert>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id} data-testid="employee-row" className={cn("group", CLICKABLE_ROW)}>
                  <TableCell className="pl-4">
                    <RowLink
                      href={`/admin/employees/${e.id}`}
                      className="flex items-center gap-3 font-medium text-foreground group-hover:text-accent-foreground"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                          {initials(e.full_name, e.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{employeeName(e)}</span>
                        {e.full_name && e.email ? (
                          <span className="truncate text-sm font-normal text-muted-foreground">{e.email}</span>
                        ) : null}
                      </span>
                    </RowLink>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABEL[e.role as Role] ?? e.role}</Badge>
                  </TableCell>
                  <TableCell data-testid="employee-state">
                    {e.is_active ? (
                      <Badge className="bg-status-approved text-status-approved-foreground">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Deactivated</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <ChevronRight
                      className="ml-auto size-4 text-muted-foreground group-hover:text-foreground"
                      aria-hidden="true"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
