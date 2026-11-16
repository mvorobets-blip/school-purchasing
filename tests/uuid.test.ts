import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

// Спільна перевірка ідентифікатора з адреси чи форми (технічний борг WS9: той самий вираз був у шести файлах).
// Регресійний тест без AC ID: відмови з неправильним id доводять тести сторінок і дій з їхніми AC.
describe("isUuid", () => {
  it.each(["3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f", "3F2B8C1E-9D4A-4B6E-8F10-2A3B4C5D6E7F"])("%s — так", (id) => {
    expect(isUuid(id)).toBe(true);
  });

  it.each(["", "1", "not-a-uuid", "3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7", "3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f0", " 3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f", "3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f'--"])(
    "«%s» — ні",
    (id) => {
      expect(isUuid(id)).toBe(false);
    },
  );
});
