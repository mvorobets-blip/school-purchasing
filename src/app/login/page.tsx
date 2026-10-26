import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialError = typeof error === "string" && Object.hasOwn(ERRORS, error) ? (error as LoginState["error"]) : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold">Sign in</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm errors={ERRORS} initialError={initialError} />
        </CardContent>
      </Card>
    </main>
  );
}
