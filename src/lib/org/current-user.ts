import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "./access";
import type { Role } from "./roles";

// Профіль користувача поточного запиту. Авторизація — getClaims(), не getSession().
// RLS віддає профіль лише активному користувачу, тож деактивований отримає null.
export async function getCurrentUser(): Promise<(CurrentUser & { id: string }) | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return { id: profile.id, role: profile.role as Role, isActive: profile.is_active };
}
