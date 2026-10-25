import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";

// Усі сторінки /admin/** — лише для активного адміністратора (AC-ORG-09).
// Не-адміністратор бачить «Not enough permissions»; дані однаково не віддає RLS (private.is_admin()).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccessSettings(user)) {
    return (
      <div className="flex flex-col gap-4">
        <Alert data-testid="forbidden">{messageFor("FORBIDDEN")}</Alert>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  return children;
}
