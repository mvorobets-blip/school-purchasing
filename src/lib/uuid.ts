// Ідентифікатор з адреси чи форми — UUID? Перевіряємо до запиту в базу: інакше Postgres відповість помилкою
// «invalid input syntax for type uuid», а людина має бачити «Not enough permissions» чи «не знайдено».
// Один вираз для всіх сторінок і дій (технічний борг WS9, /code-review high: той самий вираз був у шести файлах).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
