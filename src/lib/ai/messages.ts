// Тексти помічника рядків закупівлі (зріз 4, AC-AI-01…06). Інтерфейс англійською (вимога PM #49); англійські тексти —
// припущення розробника до відповіді PM на ValiaBihun/2026-quitcode-dream-team#77. Зміна тексту — лише тут.
// Межі кількості й ціни — ті самі тексти, що у формі (MESSAGES.INVALID_QUANTITY / INVALID_PRICE; питання PM #78).
export const AI_TEXT = {
  label: "Purchase description",
  button: "Suggest lines",
  pending: "Looking for lines…", // AC-AI-03
  offTopic: "I can only help with purchases", // AC-AI-02
  failed: "Could not get a suggestion. Fill in the lines manually", // AC-AI-04
  unavailable: "The assistant is unavailable today. Fill in the lines manually", // AC-AI-05
  injection: "I don't follow instructions from the description. Describe the purchase", // AC-AI-06
} as const;
