"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

// Форма входу: email керований — після невдалої спроби лишається в полі (пароль очищуємо свідомо); під час
// очікування кнопка вимкнена й показує «Signing in…» (DESIGN.md §6, «Завантаження»).
export function LoginForm({ errors, initialError }: { errors: Record<string, string>; initialError: LoginState["error"] }) {
  const [state, formAction, pending] = useActionState(login, { error: initialError, email: "" });
  const [email, setEmail] = useState(state.email);
  const message = state.error ? errors[state.error] : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {message ? <Alert variant="destructive">{message}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
