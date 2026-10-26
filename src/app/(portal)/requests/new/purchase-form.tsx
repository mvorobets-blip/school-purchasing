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
import {
  emptyLineFields,
  initialDepartment,
  invalidNumberFields,
  isBlockedNumberKey,
  withoutSign,
  submitBlocked,
  type LineField,
  type Option,
  type PurchaseLine,
} from "@/lib/purchase/form";
import { submitPurchase, type SubmitPurchaseState } from "../actions";

type Line = PurchaseLine & { key: number };
const blankLine = (key: number): Line => ({ key, name: "", purpose: "", quantity: "", price: "" });

// Форма закупівлі: відділи й типи — лише за правами (AC-FRM-01, AC-FRM-03); одне поле на рядок, великі зони натискання
// (PM «Вигляд і тон»). Усі поля керовані: React після кожного подання скидає некеровані поля форми, а введене має
// лишатися після помилки (AC-FRM-06; DESIGN.md §6). Помилка — над формою; після «Fill in all line fields» порожні поля
// підсвічено (AC-FRM-15); після «Not enough permissions» «Submit» вимкнено, доки не змінено відділ чи тип.
export function PurchaseForm({ departments, types }: { departments: Option[]; types: Option[] }) {
  const initial: SubmitPurchaseState = {
    status: "idle",
    message: "",
    departmentId: initialDepartment(departments),
    purchaseType: types[0]?.value ?? "",
  };
  const [state, formAction, pending] = useActionState(submitPurchase, initial);
  const [departmentId, setDepartmentId] = useState(initial.departmentId);
  const [purchaseType, setPurchaseType] = useState(initial.purchaseType);
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  const [departmentMissing, setDepartmentMissing] = useState(false);
  // Відповідь сервера, яку людина вже почала виправляти: повідомлення ховаємо, щойно щось змінено у формі
  // (воно вже не описує поточний стан); червоні рамки лишаються лише на полях, які ще порожні чи неможливі.
  const [editedAfter, setEditedAfter] = useState<SubmitPurchaseState | null>(null);

  const isError = state.status === "error";
  const showMessage = isError && editedAfter !== state;
  const forbidden = isError && state.message === messageFor("FORBIDDEN");
  const markEmpty = isError && state.message === messageFor("INVALID_LINE");
  const markNumbers = isError && state.message === messageFor("INVALID_NUMBER");
  const blocked = forbidden && submitBlocked(state, { departmentId, purchaseType });

  const edited = () => setEditedAfter(state);
  const updateLine = (key: number, field: LineField, value: string) => {
    edited();
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  };
  // Кількість і ціна: без «-», «+» і «e» — від'ємного числа не ввести навіть вставкою.
  const numberField = {
    type: "number",
    inputMode: "decimal",
    min: 0,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isBlockedNumberKey(e.key)) e.preventDefault();
    },
  } as const;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Відділ не обрано заздалегідь, коли їх кілька, — не надсилаємо форму без нього. Без `required` у Select:
        // його приховане поле браузер не може показати, і вбудована перевірка мовчки блокувала б подання.
        if (!departmentId) {
          e.preventDefault();
          setDepartmentMissing(true);
        }
      }}
      className="flex max-w-2xl flex-col gap-6"
    >
      {showMessage ? (
        <Alert variant={forbidden ? "default" : "destructive"} data-testid="purchase-message">
          {state.message}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-department">Department</Label>
            <Select
              name="departmentId"
              items={departments}
              value={departmentId || null}
              onValueChange={(v) => {
                edited();
                setDepartmentId(String(v ?? ""));
                setDepartmentMissing(false);
              }}
            >
              <SelectTrigger
                id="purchase-department"
                className="w-full"
                data-testid="purchase-department"
                aria-invalid={departmentMissing || undefined}
                aria-describedby={departmentMissing ? "purchase-department-error" : undefined}
              >
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {departmentMissing ? (
              <p id="purchase-department-error" className="text-sm text-destructive">
                Choose a department
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-type">Purchase type</Label>
            <Select
              name="purchaseType"
              items={types}
              value={purchaseType}
              onValueChange={(v) => {
                edited();
                setPurchaseType(String(v ?? ""));
              }}
              required
            >
              <SelectTrigger id="purchase-type" className="w-full" data-testid="purchase-type">
                <SelectValue placeholder="Choose a type" />
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
          Lines
        </h2>
        {lines.map((line, index) => {
          const wrong = new Set([
            ...(markEmpty ? emptyLineFields(line) : []),
            ...(markNumbers ? invalidNumberFields(line) : []),
          ]);
          const field = (name: LineField, label: string, extra: React.ComponentProps<typeof Input> = {}) => (
            <div className={name === "name" || name === "purpose" ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"}>
              <Label htmlFor={`${name}-${line.key}`}>{label}</Label>
              <Input
                id={`${name}-${line.key}`}
                name={`${name}.${line.key}`}
                value={line[name]}
                onChange={(e) =>
                  updateLine(line.key, name, name === "quantity" || name === "price" ? withoutSign(e.target.value) : e.target.value)
                }
                aria-invalid={wrong.has(name) || undefined}
                {...extra}
              />
            </div>
          );
          return (
            <Card key={line.key}>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {field("name", "Item")}
                {field("purpose", "Purpose")}
                {field("quantity", "Quantity", { ...numberField, step: "any" })}
                {field("price", "Price", { ...numberField, step: "0.01" })}
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-self-start text-muted-foreground"
                    onClick={() => {
                      edited();
                      setLines((ls) => ls.filter((l) => l.key !== line.key));
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove line {index + 1}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            edited();
            setLines((ls) => [...ls, blankLine(Math.max(0, ...ls.map((l) => l.key)) + 1)]);
          }}
        >
          <Plus aria-hidden="true" />
          Add line
        </Button>
      </section>

      {/* «Submit» праворуч, як інші дії; row-reverse — щоб Tab ішов спершу на кнопку, а підказка стояла ліворуч від неї. */}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:gap-3">
        <Button
          type="submit"
          disabled={pending || blocked}
          aria-describedby={blocked ? "purchase-blocked-hint" : undefined}
          className="w-full sm:w-auto"
        >
          {pending ? "Submitting…" : "Submit"}
        </Button>
        {blocked ? (
          <p id="purchase-blocked-hint" className="text-sm text-muted-foreground">
            Choose another department or type
          </p>
        ) : null}
      </div>
    </form>
  );
}
