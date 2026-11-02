// Користувач поточного запиту для тестів сторінок і дій з моком клієнта Supabase (@/lib/supabase/server).
// Власний модуль @/lib/org/current-user не мокаємо (правило WS8 в eslint.config.mjs): справжній getCurrentUser
// читає сесію через auth.getClaims() і профіль з profiles — ці два виклики й відповідає withUser().

export type TestUser = { id: string; role: string; isActive: boolean; fullName?: string | null; email?: string | null };

// Колонки запиту профілю в getCurrentUser (src/lib/org/current-user.ts). Інші запити до profiles (напр., профіль
// автора заявки) ідуть у from тесту — так тести AC-APR-10 і далі бачать, якщо сторінка читає чужий профіль.
const CURRENT_USER_COLUMNS = "id, email, full_name, role, is_active";

type Client = { from?: (table: string) => unknown } & Record<string, unknown>;
type Selectable = { select: (columns: string) => unknown };

/** Клієнт Supabase для тесту: сесія user (null — гість, без сесії) поверх from/rpc самого тесту. */
export function withUser(user: TestUser | null, client: Client = {}) {
  const profile = user && {
    id: user.id,
    email: user.email ?? null,
    full_name: user.fullName ?? null,
    role: user.role,
    is_active: user.isActive,
  };
  const currentProfile = {
    eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
  };
  return {
    ...client,
    auth: { getClaims: async () => ({ data: user ? { claims: { sub: user.id } } : null, error: null }) },
    from: (table: string) => {
      if (table !== "profiles") return client.from?.(table);
      return {
        select: (columns: string) =>
          columns === CURRENT_USER_COLUMNS ? currentProfile : (client.from?.(table) as Selectable).select(columns),
      };
    },
  };
}
