#!/bin/sh
# Ref проєкту Supabase з рядка підключення в env SUPABASE_DB_URL (не з аргументу: аргументи видно в списку процесів).
# Друкує ref або нічого. Читають запобіжники db-deploy-staging і db-deploy у .github/workflows/ci.yml (WS11).
#   Session pooler: postgres(ql)://postgres.<ref>:<пароль>@<будь-що>.pooler.supabase.com[:порт]/… — ref з імені
#                   користувача, але лише коли хост — пулер Supabase (CodeRabbit, PR 89: інакше рядок із правильним
#                   ref в імені й чужим хостом пройшов би запобіжник);
#   пряме:          postgres(ql)://<будь-що>@db.<ref>.supabase.co[:порт]/… — ref з хоста.
# `.*@` жадібний — бере останній «@», тож «@» у паролі (має бути %40, але все ж) не плутає хост.
# Значення рядка не друкуємо ніколи — лише ref (він не секрет: є в NEXT_PUBLIC_SUPABASE_URL).
printf '%s' "${SUPABASE_DB_URL:-}" | sed -n -E \
  -e 's#^postgres(ql)?://postgres\.([a-z0-9]{20}):.*@[a-z0-9-]+\.pooler\.supabase\.com(:[0-9]+)?/.*$#\2#p' \
  -e 's#^postgres(ql)?://.*@db\.([a-z0-9]{20})\.supabase\.co(:[0-9]+)?/.*$#\2#p' | head -n 1
