"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AI_TEXT } from "@/lib/ai/messages";
import type { FormLine } from "@/lib/ai/rules";
import type { SuggestResult } from "@/lib/ai/suggest";
import { requestLineSuggestion, type SuggestActionState } from "./suggest-action";

const DESCRIPTION_LIMIT = 1000;
const idle: SuggestActionState = { status: "idle" };

// Стан помічника під кнопкою (AC-AI-02…06): поки чекаємо — «Looking for lines…» (role=status, AC-AI-03); відмова,
// вказівки в описі, межі, збої — повідомлення дослівно; рядок — без повідомлення (він уже у формі). Нейтральний Alert:
// це стан помічника, а не помилка людини (DESIGN.md §6 — червоний лише для помилок дії).
export function AssistantStatus({
  pending,
  result,
  forbidden,
}: {
  pending: boolean;
  result?: SuggestResult | null;
  forbidden?: string | null;
}) {
  if (pending) {
    return (
      <p role="status" className="text-sm text-muted-foreground" data-testid="assistant-pending">
        {AI_TEXT.pending}
      </p>
    );
  }
  const message = forbidden ?? (result && result.state !== "line" ? result.message : null);
  return message ? <Alert data-testid="assistant-message">{message}</Alert> : null;
}

// Кнопка «Suggest lines»: неактивна, поки відповіді немає (AC-AI-03). `outline` — основна дія сторінки лишається «Submit».
export function SuggestButton({ pending, disabled = false }: { pending: boolean; disabled?: boolean }) {
  return (
    <Button type="submit" variant="outline" disabled={pending || disabled} className="w-full sm:w-auto">
      <Sparkles aria-hidden />
      {AI_TEXT.button}
    </Button>
  );
}

// Поле опису: керований стан, не вимикається під час очікування — введений опис лишається в полі (AC-AI-03), зокрема
// після відповіді (React скидає лише некеровані поля форми з action).
export function DescriptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="purchase-description">{AI_TEXT.label}</Label>
      <Textarea
        id="purchase-description"
        name="description"
        rows={2}
        maxLength={DESCRIPTION_LIMIT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Помічник над рядками форми нової закупівлі (зріз 4). Окрема форма: опис іде лише в дію пропозиції, яка нічого не
// пише; запропонований рядок форма закупівлі отримує через onLine, а подає людина кнопкою «Submit» (AC-AI-01).
// Опис — керований стан, тож він лишається в полі під час і після відповіді (AC-AI-03).
export function LineAssistant({ onLine }: { onLine: (line: FormLine) => void }) {
  const [description, setDescription] = useState("");
  const [state, action, pending] = useActionState(async (prev: SuggestActionState, formData: FormData) => {
    const next = await requestLineSuggestion(prev, formData);
    if (next.status === "done" && next.result.state === "line") onLine(next.result.line);
    return next;
  }, idle);

  return (
    <form action={action} className="max-w-2xl" data-testid="line-assistant">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <DescriptionField value={description} onChange={setDescription} />
          <div>
            <SuggestButton pending={pending} disabled={!description.trim()} />
          </div>
          <AssistantStatus
            pending={pending}
            result={state.status === "done" ? state.result : null}
            forbidden={state.status === "forbidden" ? state.message : null}
          />
        </CardContent>
      </Card>
    </form>
  );
}
