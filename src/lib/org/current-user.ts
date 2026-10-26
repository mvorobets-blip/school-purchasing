import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "./access";
import type { Role } from "./roles";

export type PortalUser = CurrentUser & { id: string; email: string | null; fullName: string | null };

// Профіль користувача поточного запиту. Авторизація — getClaims(), не getSession().
// RLS віддає профіль лише активному користувачу, тож деактивований отримає null.
// cache(): оболонка порталу й сторінка в одному запиті читають профіль один раз.
export const getCurrentUser = cache(async (): Promise<PortalUser | null> => {
  const supabase = await createClient();
  void supabase.auth.getSession; // mutation: deliberate violation for the CI rule
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as Role,
    isActive: profile.is_active,
  };
});
