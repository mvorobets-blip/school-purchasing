"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

// Форма входу: email керований — після невдалої спроби лишається в полі (пароль очищуємо свідомо); під час
// очікування кнопка вимкнена й показує «Signing in…» (DESIGN.md §6, «Завантаження»). Помилка зникає, щойно людина
// змінила email чи пароль або подала форму знову, і з'являється, якщо нова спроба теж невдала (DESIGN.md §6).
export function LoginForm({ errors, initialError }: { errors: Record<string, string>; initialError: LoginState["error"] }) {
  const [state, formAction, pending] = useActionState(login, { error: initialError, email: "" });
  const [email, setEmail] = useState(state.email);
  // Відповідь, яку людина вже почала виправляти: новий state після спроби — інший об'єкт, тож помилка повернеться.
  const [editedAfter, setEditedAfter] = useState<LoginState | null>(null);
  const message = state.error && editedAfter !== state && !pending ? errors[state.error] : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Поля з'являються по черзі після заголовка (DESIGN.md §6, «Поява»). */}
      <div className="animate-rise motion-reduce:animate-none flex flex-col gap-2 [animation-delay:320ms]">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEditedAfter(state);
            setEmail(e.target.value);
          }}
        />
      </div>
      <div className="animate-rise motion-reduce:animate-none flex flex-col gap-2 [animation-delay:400ms]">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          onChange={() => setEditedAfter(state)}
        />
      </div>
      {message ? <Alert variant="destructive">{message}</Alert> : null}
      <Button type="submit" size="lg" className="animate-rise motion-reduce:animate-none w-full [animation-delay:400ms]" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
