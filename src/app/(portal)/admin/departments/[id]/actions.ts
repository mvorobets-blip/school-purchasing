"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { rpcErrorCode, type RpcError } from "@/lib/org/rpc-error";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// Зміни членства — лише через RPC (private.* перевіряє адміністратора ще раз); роль після змін рахує тригер бази.
// Результат повертаємо в адресі (?ok= / ?error=), щоб сторінка показала повідомлення без клієнтського стану.

const errorCode = (error: RpcError) => rpcErrorCode(error, ["NOT_REQUESTER"]);

async function run(departmentId: string, call: () => PromiseLike<{ error: RpcError }>, okCode: string) {
  const user = await getCurrentUser();
  if (!canAccessSettings(user)) redirect(`/admin/departments/${departmentId}?error=FORBIDDEN`);

  const { error } = await call();
  const code = errorCode(error);
  // Лише код Postgres, без message: невідому помилку видно в логах Vercel.
  if (code === "UNKNOWN") console.error("department RPC failed", { code: error?.code });
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath("/admin/departments");
  redirect(`/admin/departments/${departmentId}?${code ? `error=${code}` : `ok=${okCode}`}`);
}

function ids(departmentId: string, profileId: FormDataEntryValue | null): { departmentId: string; profileId: string } {
  const p = String(profileId ?? "");
  if (!isUuid(departmentId) || !isUuid(p)) redirect(`/admin/departments/${departmentId}?error=UNKNOWN`);
  return { departmentId, profileId: p };
}

export async function addRequester(departmentId: string, formData: FormData) {
  const a = ids(departmentId, formData.get("profileId"));
  const supabase = await createClient();
  await run(
    a.departmentId,
    () => supabase.rpc("add_requester", { p_department_id: a.departmentId, p_profile_id: a.profileId }),
    "REQUESTER_ADDED",
  );
}

export async function removeRequester(departmentId: string, formData: FormData) {
  const a = ids(departmentId, formData.get("profileId"));
  const supabase = await createClient();
  await run(
    a.departmentId,
    () => supabase.rpc("remove_requester", { p_department_id: a.departmentId, p_profile_id: a.profileId }),
    "REQUESTER_REMOVED",
  );
}

export async function setApprover(departmentId: string, value: boolean, formData: FormData) {
  const a = ids(departmentId, formData.get("profileId"));
  const supabase = await createClient();
  await run(
    a.departmentId,
    () => supabase.rpc("set_approver", { p_department_id: a.departmentId, p_profile_id: a.profileId, p_value: value }),
    value ? "APPROVER_SET" : "APPROVER_REMOVED",
  );
}

export async function setAutoApprove(departmentId: string, value: boolean, formData: FormData) {
  const a = ids(departmentId, formData.get("profileId"));
  const supabase = await createClient();
  await run(
    a.departmentId,
    () =>
      supabase.rpc("set_auto_approve", { p_department_id: a.departmentId, p_profile_id: a.profileId, p_value: value }),
    value ? "AUTO_APPROVE_ON" : "AUTO_APPROVE_OFF",
  );
}
