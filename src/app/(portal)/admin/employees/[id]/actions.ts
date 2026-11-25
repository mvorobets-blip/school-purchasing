"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { PERMISSIONS, type Permission } from "@/lib/org/permissions";
import { rpcErrorCode, type RpcError } from "@/lib/org/rpc-error";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// Деактивація й зняття ролі адміністратора — лише через RPC: private.* ще раз перевіряє адміністратора й не дає
// лишити школу без активного адміністратора (LAST_ADMIN). Результат — в адресі (?ok= / ?error=), як на сторінці відділу.

// Порядок перевірок: uuid → адміністратор → вхідні дані дії (valid) → запис; не-адміністратор завжди бачить FORBIDDEN.
async function updateEmployee(
  profileId: string,
  call: () => PromiseLike<{ error: RpcError }>,
  okCode: string,
  valid = true,
) {
  if (!isUuid(profileId)) redirect("/admin/employees");
  const page = `/admin/employees/${profileId}`;
  if (!canAccessSettings(await getCurrentUser())) redirect(`${page}?error=FORBIDDEN`);
  if (!valid) redirect(`${page}?error=UNKNOWN`);

  const { error } = await call();
  const code = rpcErrorCode(error, ["LAST_ADMIN", "NOT_FOUND"]);
  // Лише код Postgres, без message: невідому помилку видно в логах Vercel.
  if (code === "UNKNOWN") console.error("employee RPC failed", { code: error?.code });
  revalidatePath(page);
  revalidatePath("/admin/employees");
  redirect(`${page}?${code ? `error=${code}` : `ok=${okCode}`}`);
}

// AC-ORG-12, 18, 30: деактивувати (value = false) чи знову активувати (true).
export async function setEmployeeActive(profileId: string, value: boolean) {
  const supabase = await createClient();
  await updateEmployee(
    profileId,
    () => supabase.rpc("set_active", { p_profile_id: profileId, p_active: value }),
    value ? "ACTIVATED" : "DEACTIVATED",
    typeof value === "boolean", // дію можна викликати напряму — тип TS під час виконання не діє
  );
}

// AC-ORG-10, 21, 31, 32: зняти роль адміністратора (з себе чи з іншого).
export async function removeAdminRole(profileId: string) {
  const supabase = await createClient();
  await updateEmployee(profileId, () => supabase.rpc("remove_admin_role", { p_profile_id: profileId }), "ADMIN_REMOVED");
}

// Задача 5.1 (AC-ORG-17, 26, 27): видати (value = true) чи забрати дозвіл. Пряма вставка / видалення в
// employee_permissions — під політиками employee_permissions_insert_admin / _delete_admin (лише активний адміністратор).
export async function setPermission(profileId: string, permission: Permission, value: boolean) {
  if (!PERMISSIONS.includes(permission)) redirect(`/admin/employees/${profileId}?error=UNKNOWN`);
  const supabase = await createClient();
  const table = () => supabase.from("employee_permissions");
  await updateEmployee(
    profileId,
    () =>
      value
        ? table().upsert({ profile_id: profileId, permission }, { onConflict: "profile_id,permission", ignoreDuplicates: true })
        : table().delete().eq("profile_id", profileId).eq("permission", permission),
    value ? "PERMISSION_GRANTED" : "PERMISSION_REVOKED",
  );
}
