import { Building2, Check, Clock, ListChecks, Plus, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DepartmentRow, RequestRow, SectionCard, StatLink } from "@/components/portal/dashboard";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/org/current-user";
import { departmentsWithoutApprover } from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";
import { ROLE_LABEL } from "@/lib/org/roles";
import { cn } from "@/lib/utils";
import { getAwaitingDecision } from "@/lib/purchase/awaiting";
import { countByStatus, lineSummaries, pendingByDepartment } from "@/lib/purchase/dashboard";
import { formatSubmitted } from "@/lib/purchase/date";
import { departmentOptions, PURCHASE_TYPE_LABEL, purchaseTypeOptions, type PurchaseType } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";

const RECENT = 3;
const LATEST_ADMIN = 5;

const typeLabel = (t: string) => PURCHASE_TYPE_LABEL[t as PurchaseType] ?? t;

// Головна порталу — лише справжні дані, які RLS уже віддає користувачу (без нових прав, сум і номерів заявок):
// працівник — свої заявки за статусами й останні подані; схвалювач — ще й заявки на рішення (умови AC-APR-01);
// адміністратор — заявки всієї школи й відділи без схвалювача (такі заявки чекають, AC-FRM-12).
// Без відділів — лише повідомлення PM, як на формі (AC-FRM-05). Одна основна (суцільна) кнопка на екран (DESIGN.md).
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "admin";

  const supabase = await createClient();
  const [deptsRes, membersRes, permsRes, ownRes, awaiting, latestRes, pendingRes, profilesRes] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id, profile_id, is_approver"),
    supabase.from("employee_permissions").select("permission").eq("profile_id", user.id),
    supabase
      .from("purchase_requests")
      .select("id, department_id, purchase_type, status, reject_reason, created_at")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false }),
    getAwaitingDecision(user.id),
    // Адміністратор бачить усі заявки й усі профілі (RLS); іншим ці запити не потрібні.
    isAdmin
      ? supabase
          .from("purchase_requests")
          .select("id, author_id, department_id, purchase_type, status, created_at")
          .order("created_at", { ascending: false })
          .limit(LATEST_ADMIN)
      : Promise.resolve(null),
    isAdmin ? supabase.from("purchase_requests").select("department_id").eq("status", "pending") : Promise.resolve(null),
    // Усі профілі, не лише активні: автор старої заявки міг бути деактивований — ім'я лишається.
    isAdmin ? supabase.from("profiles").select("id, full_name, email, is_active") : Promise.resolve(null),
  ]);
  const loadError =
    deptsRes.error ||
    membersRes.error ||
    permsRes.error ||
    ownRes.error ||
    awaiting.failed ||
    latestRes?.error ||
    pendingRes?.error ||
    profilesRes?.error;
  if (loadError) return <Alert variant="destructive">Could not load data. Refresh the page.</Alert>;

  const departments = deptsRes.data;
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const members = membersRes.data;
  const own = members.filter((m) => m.profile_id === user.id);
  const canSubmit = departmentOptions(user.role, own.map((m) => m.department_id), departments).length > 0;
  const ownRequests = ownRes.data;
  const ownCounts = countByStatus(ownRequests);
  const latestRequests = latestRes?.data ?? [];
  const isApprover = awaiting.departmentIds.length > 0;

  // Перші позиції лише для рядків, які покажемо.
  const shownIds = [
    ...ownRequests.slice(0, RECENT).map((r) => r.id),
    ...awaiting.requests.slice(0, RECENT).map((r) => r.id),
    ...latestRequests.map((r) => r.id),
  ];
  const linesRes = shownIds.length
    ? await supabase.from("purchase_request_lines").select("request_id, position, name").in("request_id", shownIds)
    : null;
  const summaries = lineSummaries(linesRes?.data ?? []);
  const summary = (id: string) => summaries.get(id) ?? { first: "Purchase", more: 0 };

  const header = (action?: React.ReactNode) => (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <h1 className="text-2xl font-semibold">Welcome{user.fullName ? `, ${user.fullName}` : ""}</h1>
        <p className="text-sm text-muted-foreground">
          {ROLE_LABEL[user.role]}{" "}
          <span data-testid="user-role" className="font-mono">
            {user.role}
          </span>{" "}
          · <span data-testid="user-email">{user.email ?? "—"}</span>
        </p>
      </div>
      {action}
    </div>
  );
  const newPurchase = (variant: "default" | "outline") => (
    <Link href="/requests/new" className={buttonVariants({ variant, className: "w-full sm:w-auto" })}>
      <Plus aria-hidden="true" />
      New purchase
    </Link>
  );

  // Смуга «на рішення» для кожного, хто схвалює (і адміністратора-схвалювача): її кнопка — основна на екрані.
  const awaitingCount = awaiting.requests.length;
  const approveIn = awaiting.departmentIds.map((id) => deptName.get(id) ?? "—").join(", ");
  const awaitingBanner = (
    <Card data-testid="awaiting-banner">
      <CardContent className="flex flex-wrap items-center gap-4">
        {awaitingCount > 0 ? (
          <>
            <span className="text-3xl font-semibold tabular-nums">{awaitingCount}</span>
            <span className="flex min-w-48 flex-1 flex-col">
              <span className="font-medium">{awaitingCount === 1 ? "request awaiting" : "requests awaiting"} your decision</span>
              <span className="text-sm text-muted-foreground">
                {approveIn} · oldest submitted {formatSubmitted(awaiting.requests[0].created_at)}
              </span>
            </span>
            <Link href="/approvals" className={buttonVariants({ className: "w-full sm:w-auto" })}>
              Review requests
            </Link>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{messageFor("NO_DECISIONS")}</span>
        )}
      </CardContent>
    </Card>
  );

  // ── Без відділів: лише повідомлення PM, без кнопки й віджетів (як на формі, AC-FRM-05) ──
  if (!isAdmin && !canSubmit) {
    return (
      <>
        {header()}
        <Alert data-testid="no-departments">{messageFor("NO_DEPARTMENTS")}</Alert>
      </>
    );
  }

  // ── Адміністратор ──
  if (isAdmin) {
    const profiles = profilesRes?.data ?? [];
    const active = new Set(profiles.filter((p) => p.is_active).map((p) => p.id));
    const requesters = new Set(members.filter((m) => active.has(m.profile_id)).map((m) => m.profile_id)).size;
    const authorName = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email ?? "—"]));
    const withoutApprover = departmentsWithoutApprover(
      departments.map((d) => d.id),
      members.map((m) => ({ departmentId: m.department_id, profileId: m.profile_id, isApprover: m.is_approver })),
      active,
    );
    const attention = departments.filter((d) => withoutApprover.has(d.id));
    const pendingRows = pendingRes?.data ?? [];
    const pendingIn = pendingByDepartment(pendingRows.map((r) => ({ status: "pending", department_id: r.department_id })));

    return (
      <>
        {header(newPurchase("outline"))}
        {isApprover ? awaitingBanner : null}
        <section aria-label="Overview" className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatLink
            icon={Clock}
            iconClass="bg-status-pending text-status-pending-foreground"
            label="Awaiting approval"
            value={pendingRows.length}
            hint="across all departments"
            testId="stat-school-pending"
          />
          <StatLink
            href="/admin/departments"
            icon={Building2}
            iconClass="bg-accent text-accent-foreground"
            label="Departments"
            value={departments.length}
            hint={`${requesters} ${requesters === 1 ? "requester" : "requesters"}`}
          />
          <StatLink
            href="/admin/departments"
            icon={TriangleAlert}
            iconClass="bg-status-pending text-status-pending-foreground"
            label="No approver"
            value={attention.length}
            hint={`of ${departments.length} departments`}
          />
        </section>
        <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <SectionCard title="Latest requests" testId="latest-requests">
            {latestRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              latestRequests.map((r) => (
                <RequestRow
                  key={r.id}
                  href={`/requests/${r.id}`}
                  title={summary(r.id).first}
                  more={summary(r.id).more}
                  status={r.status}
                  meta={
                    <>
                      {authorName.get(r.author_id) ?? "—"} · {deptName.get(r.department_id) ?? "—"} · {formatSubmitted(r.created_at)}
                      {r.status === "pending" && withoutApprover.has(r.department_id) ? (
                        <span> · no approver</span>
                      ) : null}
                    </>
                  }
                />
              ))
            )}
          </SectionCard>
          <SectionCard title="Needs attention" testId="needs-attention">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every department has an approver.</p>
            ) : (
              <>
                {attention.map((d) => {
                  const waiting = pendingIn.get(d.id) ?? 0;
                  return (
                    <DepartmentRow
                      key={d.id}
                      href={`/admin/departments/${d.id}`}
                      name={d.name}
                      note={waiting > 0 ? `${waiting} ${waiting === 1 ? "request is" : "requests are"} waiting` : undefined}
                      aside={<Badge className="bg-status-pending text-status-pending-foreground">{messageFor("NO_APPROVER")}</Badge>}
                    />
                  );
                })}
                <p className="mt-2 text-sm text-muted-foreground">Assign an approver so these requests can be decided.</p>
              </>
            )}
          </SectionCard>
        </div>
      </>
    );
  }

  const recent = ownRequests.slice(0, RECENT).map((r) => (
    <RequestRow
      key={r.id}
      href={`/requests/${r.id}`}
      title={summary(r.id).first}
      more={summary(r.id).more}
      status={r.status}
      rejectReason={r.reject_reason}
      meta={`${deptName.get(r.department_id) ?? "—"} · ${typeLabel(r.purchase_type)} · ${formatSubmitted(r.created_at)}`}
    />
  ));

  // ── Схвалювач: смуга «на рішення» з основною дією, нова закупівля — другорядна ──
  if (isApprover) {
    const count = awaitingCount;
    return (
      <>
        {header(newPurchase(count > 0 ? "outline" : "default"))}
        {awaitingBanner}
        <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          {count > 0 ? (
            <SectionCard title="Awaiting your decision" link={{ href: "/approvals", label: "Open list" }}>
              {awaiting.requests.slice(0, RECENT).map((r) => (
                <RequestRow
                  key={r.id}
                  href={`/requests/${r.id}`}
                  title={summary(r.id).first}
                  more={summary(r.id).more}
                  status="pending"
                  meta={`${deptName.get(r.department_id) ?? "—"} · ${typeLabel(r.purchase_type)} · ${formatSubmitted(r.created_at)}`}
                />
              ))}
            </SectionCard>
          ) : (
            <SectionCard title="Recent requests" link={{ href: "/requests", label: "All my requests" }}>
              {recent.length ? recent : <p className="text-sm text-muted-foreground">{messageFor("NO_REQUESTS")}</p>}
            </SectionCard>
          )}
          <SectionCard title="My requests" link={{ href: "/requests", label: "All my requests" }}>
            <StatusLine icon={Clock} iconClass="bg-status-pending text-status-pending-foreground" label="Awaiting approval" value={ownCounts.pending} />
            <StatusLine icon={Check} iconClass="bg-status-approved text-status-approved-foreground" label="Approved" value={ownCounts.approved} />
            <StatusLine icon={X} iconClass="bg-status-rejected text-status-rejected-foreground" label="Rejected" value={ownCounts.rejected} />
            <p className="mt-2 text-sm text-muted-foreground">I approve in: {approveIn}</p>
          </SectionCard>
        </div>
      </>
    );
  }

  // ── Працівник ──
  const types = purchaseTypeOptions(user.role, permsRes.data.map((p) => p.permission)).map((t) => t.label);
  const myDepartments = (
    <SectionCard title="My departments" link={{ href: "/profile", label: "Profile" }}>
      {own.map((m) => (
        <DepartmentRow
          key={m.department_id}
          href="/profile"
          name={deptName.get(m.department_id) ?? "—"}
          aside={<Badge variant="secondary">Requester</Badge>}
        />
      ))}
      <p className="mt-2 text-sm text-muted-foreground">Purchase types: {types.join(", ") || "—"}</p>
    </SectionCard>
  );

  if (ownRequests.length === 0) {
    return (
      <>
        {header()}
        <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <ListChecks className="size-5" aria-hidden="true" />
              </span>
              <p className="font-medium" data-testid="no-requests">
                {messageFor("NO_REQUESTS")}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Submit a purchase for one of your departments — it will appear here with its status.
              </p>
              <div className="mt-2 w-full sm:w-auto">{newPurchase("default")}</div>
            </CardContent>
          </Card>
          {myDepartments}
        </div>
      </>
    );
  }

  return (
    <>
      {header(newPurchase("default"))}
      <section aria-label="My requests by status" className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatLink href="/requests" icon={Clock} iconClass="bg-status-pending text-status-pending-foreground" label="Awaiting approval" value={ownCounts.pending} hint="My requests" testId="stat-pending" />
        <StatLink href="/requests" icon={Check} iconClass="bg-status-approved text-status-approved-foreground" label="Approved" value={ownCounts.approved} hint="My requests" testId="stat-approved" />
        <StatLink href="/requests" icon={X} iconClass="bg-status-rejected text-status-rejected-foreground" label="Rejected" value={ownCounts.rejected} hint="My requests" testId="stat-rejected" />
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <SectionCard title="Recent requests" link={{ href: "/requests", label: "All my requests" }} testId="recent-requests">
          {recent}
        </SectionCard>
        {myDepartments}
      </div>
    </>
  );
}

function StatusLine({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: typeof Clock;
  iconClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={cn("flex size-8 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex-1">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
