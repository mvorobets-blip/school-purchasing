-- WS11, відгук викладача (koldovsky/2026-quitcode-11-devops-operations-hw#4, пункт 2): рядок журналу ai_calls — лише через функцію, не прямою вставкою.
-- Було: grant insert (…) on public.ai_calls to authenticated + політика «лише свій user_id» — будь-який активний
-- користувач міг через PostgREST вставити рядок з довільним станом (напр. 'unavailable') і спотворити SLO-2 (PM #83).
-- Стало: прямої вставки немає (revoke insert); пише лише private.record_ai_call — security definer, search_path = '':
--   • user_id = auth.uid(), created_at = now() — ставить функція, з параметрів їх не взяти;
--   • лише активний користувач з роллю requester чи approver — той самий перелік, що canUseAssistant у застосунку
--     (адміністратор помічником не користується, тож його рядок був би лише штучним);
--   • ті самі check-обмеження таблиці й unique request_id.
-- Межа захисту (свідомо): функцію, яку server action викликає з токеном користувача, той самий
-- requester чи approver може викликати й сам (supabase.rpc). Функція звужує, ЩО можна записати і ХТО, але не доводить,
-- що виклик іде з server action: для цього потрібен ключ, якого людина не бачить (напр. підпис рядка HMAC з ключем
-- лише на сервері й у Vault) — не робимо, доки SLO-2 рахує десятки рядків на день у школі з відомими людьми.

-- ── 1. Функція запису ──────────────────────────────────────────────────────────
create function private.record_ai_call(
  p_request_id     uuid,
  p_state          text,
  p_app_state      text,
  p_error_kind     text,
  p_model          text,
  p_fallback_used  boolean,
  p_model_called   boolean,
  p_latency_ms     integer,
  p_input_tokens   integer,
  p_output_tokens  integer,
  p_prompt_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_user())
     or coalesce((select private.current_app_role()), '') not in ('requester', 'approver') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.ai_calls (user_id, state, app_state, error_kind, model, fallback_used, model_called, latency_ms,
    input_tokens, output_tokens, prompt_version, request_id)
  values ((select auth.uid()), p_state, p_app_state, p_error_kind, p_model, coalesce(p_fallback_used, false),
    p_model_called, p_latency_ms, p_input_tokens, p_output_tokens, p_prompt_version, p_request_id);
end;
$$;

-- Обгортка для supabase.rpc (PostgREST бачить лише public): та сама сигнатура, security invoker.
create function public.record_ai_call(
  p_request_id uuid, p_state text, p_app_state text, p_error_kind text, p_model text, p_fallback_used boolean,
  p_model_called boolean, p_latency_ms integer, p_input_tokens integer, p_output_tokens integer, p_prompt_version text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_ai_call(p_request_id, p_state, p_app_state, p_error_kind, p_model, p_fallback_used,
    p_model_called, p_latency_ms, p_input_tokens, p_output_tokens, p_prompt_version);
$$;

revoke execute on function private.record_ai_call(uuid, text, text, text, text, boolean, boolean, integer, integer, integer, text)
  from public, anon;
revoke execute on function public.record_ai_call(uuid, text, text, text, text, boolean, boolean, integer, integer, integer, text)
  from public, anon;
grant execute on function private.record_ai_call(uuid, text, text, text, text, boolean, boolean, integer, integer, integer, text)
  to authenticated;
grant execute on function public.record_ai_call(uuid, text, text, text, text, boolean, boolean, integer, integer, integer, text)
  to authenticated;

-- ── 2. Прямої вставки більше немає ─────────────────────────────────────────────
drop policy ai_calls_insert_own on public.ai_calls;
revoke insert on table public.ai_calls from authenticated;
-- Читання (адміністратор), service_role і тригер прибирання 35 днів — без змін.
