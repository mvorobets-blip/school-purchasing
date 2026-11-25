"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { rpcErrorCode, type RpcError } from "@/lib/org/rpc-error";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// Деактивація й зняття ролі адміністратора — лише через RPC: private.* ще раз перевіряє адміністратора й не дає
// лишити школу без активного адміністратора (LAST_ADMIN). Результат — в адресі (?ok= / ?error=), як на сторінці відділу.

async function updateEmployee(profileId: string, call: () => PromiseLike<{ error: RpcError }>, okCode: string) {
  if (!isUuid(profileId)) redirect("/admin/employees");
  const page = `/admin/employees/${profileId}`;
  if (!canAccessSettings(await getCurrentUser())) redirect(`${page}?error=FORBIDDEN`);

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
  );
}

// AC-ORG-10, 21, 31, 32: зняти роль адміністратора (з себе чи з іншого).
export async function removeAdminRole(profileId: string) {
  const supabase = await createClient();
  await updateEmployee(profileId, () => supabase.rpc("remove_admin_role", { p_profile_id: profileId }), "ADMIN_REMOVED");
}
