import { describe, expect, it } from "vitest";
import { formatSubmittedAt } from "@/lib/purchase/date";

// Час запису «Submitted» в історії заявки: «05.11.2026, 14:32» — дата як у списках зрізу 2, час 24-годинний, без
// позначки поясу, за America/New_York (припущення PM у вимозі 64, відповідь на #74).
describe("formatSubmittedAt", () => {
  it("AC-HIST-06: дата й час запису «Подано» — за часом America/New_York, «05.11.2026, 14:32»", () => {
    // 19:32 UTC 5 листопада — у Нью-Йорку зимовий час (EST, UTC−5): 14:32.
    expect(formatSubmittedAt("2026-11-05T19:32:00Z")).toBe("05.11.2026, 14:32");
  });

  it("формат PostgREST (мікросекунди й «+00:00») — той самий результат", () => {
    expect(formatSubmittedAt("2026-11-05T19:32:00.123456+00:00")).toBe("05.11.2026, 14:32");
  });

  it("літній час (EDT, UTC−4): 18:05 UTC 1 липня — «01.07.2026, 14:05»", () => {
    expect(formatSubmittedAt("2026-07-01T18:05:00Z")).toBe("01.07.2026, 14:05");
  });

  it("опівночі — «00:00» нової доби, а не «24:00» попередньої", () => {
    expect(formatSubmittedAt("2026-11-06T05:00:00Z")).toBe("06.11.2026, 00:00");
  });

  it("перехід на зимовий час 1 листопада 2026: до й після — різний зсув від UTC", () => {
    // 05:30 UTC — ще EDT (01:30), 06:30 UTC — уже EST (01:30 вдруге).
    expect(formatSubmittedAt("2026-11-01T05:30:00Z")).toBe("01.11.2026, 01:30");
    expect(formatSubmittedAt("2026-11-01T06:30:00Z")).toBe("01.11.2026, 01:30");
  });

  it("вечір за Нью-Йорком — ще та сама дата, хоча в UTC уже наступна доба; 24-годинний формат без AM/PM і поясу", () => {
    const text = formatSubmittedAt("2026-11-06T03:15:00Z");
    expect(text).toBe("05.11.2026, 22:15");
    expect(text).not.toMatch(/AM|PM|EST|EDT|GMT|UTC/);
  });
});
