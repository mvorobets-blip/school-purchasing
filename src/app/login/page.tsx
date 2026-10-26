import { Check, FileText, ShoppingBasket, UserCheck, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { messageFor } from "@/lib/org/messages";
import type { LoginState } from "./actions";
import { LoginForm } from "./login-form";

// Тексти помилок входу (AC-LANG-02); ключ приходить станом форми або (для старих посилань) параметром ?error=.
const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Incorrect email or password.",
  inactive: messageFor("DEACTIVATED"),
  unavailable: "Could not sign in. Try again.",
};

// Три кроки продукту ліворуч від форми (лише на комп'ютері); з'являються по черзі.
const STEPS: { icon: LucideIcon; title: string; text: string; delay: string; draw?: boolean }[] = [
  { icon: FileText, title: "Submit a request", text: "Items, purpose, quantity, price", delay: "[animation-delay:600ms]" },
  { icon: UserCheck, title: "Approver decides", text: "Approve, or reject with a reason", delay: "[animation-delay:800ms]" },
  { icon: Check, title: "Track the status", text: "See every request in one place", delay: "[animation-delay:1000ms]", draw: true },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialError = typeof error === "string" && Object.hasOwn(ERRORS, error) ? (error as LoginState["error"]) : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 sm:px-6 md:max-w-4xl">
      <Card className="animate-rise motion-reduce:animate-none grid gap-0 overflow-hidden py-0 md:grid-cols-2">
        <aside className="hidden flex-col justify-center gap-6 border-r border-border bg-linear-to-br from-accent to-transparent p-8 md:flex">
          <div className="flex flex-col gap-3">
            <span className="animate-pop motion-reduce:animate-none flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground [animation-delay:80ms]">
              <ShoppingBasket className="size-5" aria-hidden="true" />
            </span>
            <p className="animate-rise motion-reduce:animate-none text-lg font-semibold [animation-delay:160ms]">School Purchasing</p>
          </div>
          <ul className="flex flex-col gap-4">
            {STEPS.map(({ icon: Icon, title, text, delay, draw }) => (
              <li key={title} className={`animate-rise motion-reduce:animate-none flex items-center gap-3 ${delay}`}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className={draw ? "size-5 [&_path]:animate-draw [&_path]:[stroke-dasharray:30] motion-reduce:[&_path]:animate-none" : "size-5"} aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground">{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex flex-col gap-4 p-6 sm:p-8">
          {/* На телефоні ліва частина схована — логотип і назва над формою. */}
          <div className="flex items-center gap-2 md:hidden">
            <span className="animate-pop motion-reduce:animate-none flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground [animation-delay:80ms]">
              <ShoppingBasket className="size-4" aria-hidden="true" />
            </span>
            <span className="font-semibold">School Purchasing</span>
          </div>
          <div className="animate-rise motion-reduce:animate-none flex flex-col gap-1 [animation-delay:240ms]">
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="text-sm text-muted-foreground">Use your school account.</p>
          </div>
          <LoginForm errors={ERRORS} initialError={initialError} />
        </div>
      </Card>
    </main>
  );
}
