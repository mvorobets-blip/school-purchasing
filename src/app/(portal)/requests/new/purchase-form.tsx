"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { messageFor } from "@/lib/org/messages";
import type { Option } from "@/lib/purchase/form";
import { submitPurchase, type SubmitPurchaseState } from "../actions";

// Форма закупівлі: відділи й типи — лише за правами (AC-FRM-01, AC-FRM-03); одне поле на рядок, великі зони натискання
// (PM «Вигляд і тон»). Відділ і тип — керовані, тож після помилки лишаються обраними (AC-FRM-06).
export function PurchaseForm({ departments, types }: { departments: Option[]; types: Option[] }) {
  const initial: SubmitPurchaseState = {
    status: "idle",
    message: "",
    departmentId: departments[0]?.value ?? "",
    purchaseType: types[0]?.value ?? "",
  };
  const [state, formAction, pending] = useActionState(submitPurchase, initial);
  const [departmentId, setDepartmentId] = useState(initial.departmentId);
  const [purchaseType, setPurchaseType] = useState(initial.purchaseType);
  const [lines, setLines] = useState<number[]>([1]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-department">Відділ</Label>
            <Select
              name="departmentId"
              items={departments}
              value={departmentId}
              onValueChange={(v) => setDepartmentId(String(v ?? ""))}
              required
            >
              <SelectTrigger id="purchase-department" className="w-full" data-testid="purchase-department">
                <SelectValue placeholder="Оберіть відділ" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-type">Тип закупівлі</Label>
            <Select
              name="purchaseType"
              items={types}
              value={purchaseType}
              onValueChange={(v) => setPurchaseType(String(v ?? ""))}
              required
            >
              <SelectTrigger id="purchase-type" className="w-full" data-testid="purchase-type">
                <SelectValue placeholder="Оберіть тип" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="lines-title" className="flex flex-col gap-3">
        <h2 id="lines-title" className="text-lg font-medium">
          Рядки
        </h2>
        {lines.map((n, index) => (
          <Card key={n}>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor={`name-${n}`}>Назва</Label>
                <Input id={`name-${n}`} name={`name.${n}`} />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor={`purpose-${n}`}>Мета</Label>
                <Input id={`purpose-${n}`} name={`purpose.${n}`} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`quantity-${n}`}>Кількість</Label>
                <Input id={`quantity-${n}`} name={`quantity.${n}`} type="number" inputMode="decimal" step="any" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`price-${n}`}>Ціна</Label>
                <Input id={`price-${n}`} name={`price.${n}`} type="number" inputMode="decimal" step="0.01" />
              </div>
              {lines.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-self-start text-muted-foreground"
                  onClick={() => setLines((ls) => ls.filter((x) => x !== n))}
                >
                  <Trash2 aria-hidden="true" />
                  Прибрати рядок {index + 1}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setLines((ls) => [...ls, Math.max(0, ...ls) + 1])}
        >
          <Plus aria-hidden="true" />
          Додати рядок
        </Button>
      </section>

      {state.status === "error" ? (
        <Alert
          variant={state.message === messageFor("FORBIDDEN") ? "default" : "destructive"}
          data-testid="purchase-message"
        >
          {state.message}
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? "Подаємо…" : "Подати"}
      </Button>
    </form>
  );
}
