"use client";

import { useActionState } from "react";
import { DEPARTMENT_NAME_MAX } from "@/lib/org/departments";
import { createDepartment, type CreateDepartmentState } from "./actions";

const initialState: CreateDepartmentState = { status: "idle", message: "" };

export function CreateDepartmentForm() {
  const [state, formAction, pending] = useActionState(createDepartment, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Назва нового відділу
        <input
          name="name"
          required
          maxLength={DEPARTMENT_NAME_MAX}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
      >
        {pending ? "Створюємо…" : "Створити відділ"}
      </button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          data-testid="create-department-message"
          className={`text-sm ${state.status === "error" ? "text-red-600" : "text-green-700"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
