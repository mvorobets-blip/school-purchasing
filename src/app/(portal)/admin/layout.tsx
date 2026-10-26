import { redirect } from "next/navigation";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";

// Усі сторінки /admin/** — лише для активного адміністратора (AC-ORG-09).
// Не-адміністратор бачить «Not enough permissions»; дані однаково не віддає RLS (private.is_admin()).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccessSettings(user)) {
    return <ForbiddenCard hint="Only administrators can open settings." backHref="/" backLabel="Back to home" />;
  }

  return children;
}
