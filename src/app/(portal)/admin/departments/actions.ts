"use server";

import { revalidatePath } from "next/cache";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { DEPARTMENT_NAME_MAX, isValidDepartmentName } from "@/lib/org/departments";
import { messageFor } from "@/lib/org/messages";
import { createClient } from "@/lib/supabase/server";

export type CreateDepartmentState = { status: "idle" | "ok" | "error"; message: string };

// AC-ORG-34: дубль назви ловить унікальний індекс lower(btrim(name)) — помилку 23505 перекладаємо в текст PM.
export async function createDepartment(
  _prev: CreateDepartmentState,
  formData: FormData,
): Promise<CreateDepartmentState> {
  // Перевіряємо права в самій дії, а не лише в layout (форма може бути викликана напряму).
  const user = await getCurrentUser();
  if (!canAccessSettings(user)) return { status: "error", message: messageFor("FORBIDDEN") };

  const name = String(formData.get("name") ?? "").trim();
  if (!isValidDepartmentName(name)) {
    return { status: "error", message: `Department name — 1 to ${DEPARTMENT_NAME_MAX} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ name });
  if (error) {
    if (error.code === "23505") return { status: "error", message: messageFor("DUPLICATE_DEPARTMENT") };
    if (error.code === "42501") return { status: "error", message: messageFor("FORBIDDEN") };
    return { status: "error", message: "Could not create the department. Try again." };
  }

  revalidatePath("/admin/departments");
  return { status: "ok", message: `Department «${name}» created.` };
}
