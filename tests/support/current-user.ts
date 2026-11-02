// Користувач поточного запиту для тестів сторінок і дій з моком клієнта Supabase (@/lib/supabase/server).
// Власний модуль @/lib/org/current-user не мокаємо (правило WS8 в eslint.config.mjs): справжній getCurrentUser
// читає сесію через auth.getClaims() і профіль з profiles — ці два виклики й відповідає withUser().
// Обмеження: (1) будь-який запит profiles з .eq("id", <id сесії>) вважається запитом getCurrentUser — читання профілю
// автора, що збігається з поточним користувачем (власна заявка), тест через from не побачить; (2) select(columns, opts)
// передає в from тесту лише колонки, без другого аргументу ({ count, head }).

export type TestUser = { id: string; role: string; isActive: boolean; fullName?: string | null; email?: string | null };

type Client = { from?: (table: string) => unknown } & Record<string, unknown>;
type Builder = Record<PropertyKey, unknown>;
type Selectable = { select: (columns: string) => Builder };

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
      // Профіль поточного користувача — лише запит profiles з .eq("id", <id сесії>). Будь-який інший запит до profiles
      // (await без фільтра, .in, .order, інший .eq — напр. профіль автора заявки) одразу йде в from тесту: тести
      // AC-APR-10 бачать його в своєму списку таблиць, а хибний фільтр у getCurrentUser — падає.
      return {
        select: (columns: string) => {
          let real: Builder | undefined;
          const delegate = () => (real ??= (client.from?.(table) as Selectable).select(columns));
          return new Proxy({} as Builder, {
            get: (_target, prop) => {
              if (prop === "eq") {
                return (column: string, value: unknown) =>
                  user && column === "id" && value === user.id
                    ? ownProfile
                    : (delegate().eq as (c: string, v: unknown) => unknown)(column, value);
              }
              const value = delegate()[prop];
              return typeof value === "function" ? value.bind(delegate()) : value;
            },
          });
        },
      };
    },
  };
}
