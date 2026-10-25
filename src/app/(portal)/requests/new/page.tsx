import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { departmentOptions, purchaseTypeOptions } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "./purchase-form";

// Нова закупівля. Гостя перенаправляє proxy й ця перевірка (AC-FRM-09); варіанти — лише за правами (AC-FRM-01, 03);
// працівник без відділів бачить пояснення без полів (AC-FRM-05).
export default async function NewPurchasePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [deptsRes, membersRes, permsRes] = await Promise.all([
    supabase.from("departments").select("id, name"),
    supabase.from("department_members").select("department_id").eq("profile_id", user.id),
    supabase.from("employee_permissions").select("permission").eq("profile_id", user.id),
  ]);
  if (deptsRes.error || membersRes.error || permsRes.error) {
    return <Alert variant="destructive">Could not load the form. Refresh the page.</Alert>;
  }

  const departments = departmentOptions(
    user.role,
    membersRes.data.map((m) => m.department_id),
    deptsRes.data,
  );
  const types = purchaseTypeOptions(
    user.role,
    permsRes.data.map((p) => p.permission),
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">New purchase</h1>
      {departments.length === 0 ? (
        <Alert data-testid="no-departments">{messageFor("NO_DEPARTMENTS")}</Alert>
      ) : (
        <PurchaseForm departments={departments} types={types} />
      )}
    </>
  );
}
