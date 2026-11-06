"use client";

import { useState } from "react";
import { DecisionButtons } from "@/app/(portal)/approvals/decision-buttons";
import { RequestLines } from "@/components/portal/request-sections";

type Line = { position: number; name: string; purpose: string; quantity: number; price: number; status?: string | null };

// Рішення на сторінці заявки (AC-DEC-01): схвалювач позначає «Reject line», основна кнопка — «Approve» без позначених і
// «Partially approve» з ними; усі позначені база відхиляє — «All lines are rejected: reject the whole request».
// Поруч — «Reject» з причиною (зріз 2). Права перевіряє private.decide_purchase.
export function LineDecision({ requestId, label, lines }: { requestId: string; label: string; lines: readonly Line[] }) {
  const [rejected, setRejected] = useState<ReadonlySet<number>>(new Set());
  const onToggle = (position: number) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });

  return (
    <>
      <RequestLines lines={lines} selectable={{ rejected, onToggle }} />
      <DecisionButtons requestId={requestId} label={label} rejectedPositions={[...rejected].sort((a, b) => a - b)} />
    </>
  );
}
