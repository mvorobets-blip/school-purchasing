// Користувач поточного запиту для тестів сторінок і дій з моком клієнта Supabase (@/lib/supabase/server).
// Власний модуль @/lib/org/current-user не мокаємо (правило WS8 в eslint.config.mjs): справжній getCurrentUser
// читає сесію через auth.getClaims() і профіль з profiles — ці два виклики й відповідає withUser().

export type TestUser = { id: string; role: string; isActive: boolean; fullName?: string | null; email?: string | null };

type Client = { from?: (table: string) => unknown } & Record<string, unknown>;
type Selectable = { select: (columns: string) => { eq: (column: string, value: unknown) => unknown } };

/** Клієнт Supabase для тесту: сесія user (null — гість, без сесії) поверх from/rpc самого тесту. */
export function withUser(user: TestUser | null, client: Client = {}) {
  // Як RLS на проді: профіль деактивованого користувача не видно, getCurrentUser тоді повертає null.
  const profile =
    user?.isActive === true
      ? { id: user.id, email: user.email ?? null, full_name: user.fullName ?? null, role: user.role, is_active: true }
      : null;
  const ownProfile = { maybeSingle: async () => ({ data: profile, error: null }) };
  return {
    ...client,
    auth: { getClaims: async () => ({ data: user ? { claims: { sub: user.id } } : null, error: null }) },
    from: (table: string) => {
      if (table !== "profiles") return client.from?.(table);
      // Профіль поточного користувача — лише запит profiles з .eq("id", <id сесії>). Інший фільтр (чи чужий профіль,
      // напр. автора заявки) іде в from тесту: тести AC-APR-10 це бачать, а хибний фільтр у getCurrentUser — падає.
      return {
        select: (columns: string) => ({
          eq: (column: string, value: unknown) =>
            user && column === "id" && value === user.id
              ? ownProfile
              : (client.from?.(table) as Selectable).select(columns).eq(column, value),
        }),
      };
    },
  };
}
