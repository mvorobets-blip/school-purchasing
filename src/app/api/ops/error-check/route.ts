// Тимчасовий маршрут для перевірки трекера помилок (WS11, трек B): навмисно кидає помилку, щоб onRequestError
// (src/instrumentation.ts) надіслав повідомлення в Telegram. На проді — 404; поза продом — лише активному
// адміністратору (інакше 403). Шлях НЕ в PUBLIC_PATHS: без входу proxy веде на /login.
// Прибрати окремим PR після знімка повідомлення в docs/ops/.
import { NextResponse } from "next/server";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!canAccessSettings(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  throw new Error("error-check: intentional error to test the error tracker (no user data)");
}
