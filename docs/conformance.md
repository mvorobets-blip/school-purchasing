# Матриця відповідності (AC → код → тест → статус)

<!--
Ваша матриця: один рядок на кожен AC з openspec/specs/** — вашої специфікації, у яку ви перекладаєте вимоги PM
(їхній знімок у requirements/ приносить команда агента /requirements-sync).
Рядок «Вимоги» під цим коментарем заповнює лише /requirements-sync: адреса репо вимог PM, звідки взято вимоги (issues
або файли docs/), і дата знімка, через « · ». Руками його не змінюйте: з нього /requirements-sync знає, звідки брати
вимоги наступного разу, а скіли spec-clarify, spec-review і /conformance — куди ставити питання й яку версію вимог ви
реалізуєте. Рядків таблиці /requirements-sync не додає.
Рядки змінюєте ви:
  PR «Специфікація» — після archive зміни: рядок кожного нового AC зі статусом «відкладено (чекає реалізації)»; рядки AC,
                      прибраних зі специфікації (REMOVED), — видалити;
  PR «Реалізація»   — рядок AC задачі в тому самому PR, що й код і тест.
Перебудувати автоматично: /conformance (Claude Code, Cursor).
Перевірка в CI: npm run ac:coverage — падає, якщо
  NO-ROW     AC є в специфікації, а рядка немає (типово — PR «Специфікація» без нових рядків або рядок видалено);
  MISSING    статус «реалізовано», а непропущеного тесту, назва якого починається з цього AC ID, у файлах
             *.test.ts / *.test.tsx немає (*.spec.ts і допоміжні файли Vitest не запускає — вони не рахуються);
  ORPHAN     тест посилається на AC, якого немає в специфікації (AC прибрано або вимогу PM ще не перекладено);
  BAD-STATUS статус не «реалізовано» і не «відкладено (причина)»;
  WRONG-REF  шляху `src/…`/`tests/…`/`supabase/…` з колонок «Код»/«Тест» немає або тест із цим AC в іншому файлі;
і попереджає, не падаючи: AC з вимог PM (requirements/), якого ще немає в openspec/specs/, — «вимогу PM ще не перекладено
в специфікацію».

Приклад рядків (усередині коментаря — скрипт їх не читає):
| AC-LEAVE-02 | заявка на дві посади дає два записи main і additional | `src/app/requests/actions.ts` (createRequest) | `tests/requests.test.ts` | реалізовано |
| AC-LEAVE-04 | заблоковані дні не рахуються | — | — | відкладено (чекаю відповідь PM на Q2, <pm>/<team-slug>-spec#5) |
| AC-LEAVE-07 | менеджер бачить лише свій відділ | — | — | відкладено (рішення PM: поза зрізом 1, <pm>/<team-slug>-spec#8) |
| AC-LEAVE-10 | діапазон лише із заблокованих днів | — | — | відкладено (чекає реалізації) |
-->

Вимоги: https://github.com/ValiaBihun/2026-quitcode-dream-team · джерело: issues · знімок 2026-10-27

| AC | Що перевіряє | Код | Тест | Статус |
|---|---|---|---|---|
| AC-ORG-01 | у профілі заявника серед його відділів — лише відділ, до якого його додано | `src/app/(portal)/profile/page.tsx`, `src/lib/org/membership.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-02 | схвалювачем не призначити не заявника відділу — «Спершу додайте працівника до відділу як заявника» | `supabase/migrations/20261021231637_department_members_functions.sql`, `src/app/(portal)/admin/departments/[id]/actions.ts`, `src/lib/org/membership.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-03 | зняття із заявників відділу знімає і схвалення цього відділу | `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-04 | працівник без ролі `admin` після зняття зі схвалювачів єдиного відділу — `requester` | `supabase/migrations/20261021213618_department_setup.sql`, `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/roles.test.ts` | реалізовано |
| AC-ORG-05 | працівник без ролі `admin`, призначений схвалювачем, стає `approver` | `supabase/migrations/20261021213618_department_setup.sql`, `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/roles.test.ts` | реалізовано |
| AC-ORG-06 | автосхвалення діє лише в обраному відділі | `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/membership.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-09 | без ролі `admin` немає доступу до працівників і відділів — «Недостатньо прав» | `src/app/(portal)/admin/layout.tsx`, `src/lib/org/access.ts` | `tests/org/access.test.ts` | реалізовано |
| AC-ORG-10 | єдиний активний адміністратор не знімає з себе роль | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-11 | адміністратор без відділів лишається `admin` | `supabase/migrations/20261021213618_department_setup.sql`, `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/roles.test.ts` | реалізовано |
| AC-ORG-12 | деактивований працівник не входить у систему й бачить «Account deactivated. Contact your administrator» | — | — | відкладено (вхід деактивованого вже блокує `src/app/login/actions.ts`, тест «AC-ORG-12: …» у `tests/org/login.test.ts`; саму деактивацію адміністратором — задача 4.1 плану impl-department-setup) |
| AC-ORG-14 | відділ без активного схвалювача позначено «Немає схвалювача» | `src/app/(portal)/admin/departments/page.tsx`, `src/lib/org/departments.ts` | `tests/org/departments.test.ts` | реалізовано |
| AC-ORG-15 | зняття із заявників відділу знімає автосхвалення цього відділу | `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-16 | деактивованого працівника немає у виборі схвалювача відділу | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-17 | у профілі працівника без ролі `admin` з дозволом є «Витрата карткою» | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-18 | єдиний активний адміністратор не деактивує себе | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-19 | схвалювач кількох відділів після зняття з одного лишається `approver` | `supabase/migrations/20261021213618_department_setup.sql`, `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/roles.test.ts` | реалізовано |
| AC-ORG-20 | адміністратор, призначений схвалювачем, лишається `admin` і схвалює заявки відділу | `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-21 | за наявності іншого адміністратора роль знято з себе, роль стає `requester` | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-22 | адміністратор без відділів обирає будь-який відділ у «Закупівлі» чи «Відшкодуванні» | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-23 | адміністратор без дозволу обирає будь-який тип закупівлі, зокрема «Самостійна закупівля» | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-24 | працівник без ролі `admin` після зняття заявника єдиного відділу схвалення — `requester` | `supabase/migrations/20261021213618_department_setup.sql`, `supabase/migrations/20261021231637_department_members_functions.sql`, `src/lib/org/roles.ts` | `tests/org/roles.test.ts` | реалізовано |
| AC-ORG-25 | у профілі адміністратора без дозволу є «Витрата карткою» | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-26 | у профілі працівника без ролі `admin` без дозволу «Витрати карткою» немає | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-27 | у профілі працівника без ролі `admin` без дозволу серед типів закупівлі лише «Відділ закупівель» | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-28 | деактивованого працівника немає у виборі особи «від імені» | — | — | відкладено (рішення PM: додатковий критерій поза спрощеним скоупом, ValiaBihun/2026-quitcode-dream-team#46) |
| AC-ORG-29 | адміністратор-заявник одного відділу обирає будь-який відділ | — | — | відкладено (задача 5.1 плану impl-department-setup — дозволи й заглушка форми заявки не реалізовані до здачі зрізу) |
| AC-ORG-30 | після повторної активації працівник схвалює той самий відділ, роль `approver` | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-31 | зняття ролі адміністратора іншим адміністратором без відділів схвалення — `requester` | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-32 | зняття ролі адміністратора іншим адміністратором зі схваленням відділу — `approver` | — | — | відкладено (задача 4.1 плану impl-department-setup — деактивація й захист адміністратора не реалізовані до здачі зрізу) |
| AC-ORG-33 | автосхвалення не ввімкнути не заявнику — «Спершу додайте працівника до відділу як заявника» | `supabase/migrations/20261021231637_department_members_functions.sql`, `src/app/(portal)/admin/departments/[id]/actions.ts`, `src/lib/org/membership.ts` | `tests/org/membership.test.ts` | реалізовано |
| AC-ORG-34 | дубль назви відділу (без урахування регістру) не створюється — «Відділ з такою назвою вже є» | `src/app/(portal)/admin/departments/actions.ts`, `supabase/migrations/20261021213618_department_setup.sql` | `tests/org/departments.test.ts` | реалізовано |
| AC-FRM-01 | у виборі відділу лише відділи, де працівник заявник | `src/lib/purchase/form.ts` (departmentOptions) | `tests/purchase/form.test.ts` | реалізовано |
| AC-FRM-02 | подання в чужий відділ напряму не подано | `supabase/migrations/20261025184732_purchase_requests.sql` (private.submit_purchase; без grant insert) | `tests/db/purchase.test.ts`, `tests/purchase/submit-purchase.test.ts` | реалізовано |
| AC-FRM-03 | без дозволу немає типу «Самостійна закупівля» | `src/lib/purchase/form.ts` (purchaseTypeOptions) | `tests/purchase/form.test.ts` | реалізовано |
| AC-FRM-04 | «Самостійна закупівля» без дозволу напряму не подана | `supabase/migrations/20261025184732_purchase_requests.sql` (private.submit_purchase) | `tests/db/purchase.test.ts` | реалізовано |
| AC-FRM-05 | працівник без відділів бачить «You have not been added to any department…» без полів | `src/app/(portal)/requests/new/page.tsx`, `src/lib/purchase/form.ts` | `tests/purchase/form.test.ts` | реалізовано |
| AC-FRM-06 | без рядків — «Add at least one line», відділ і тип лишаються | `src/app/(portal)/requests/actions.ts` (submitPurchase), `supabase/migrations/20261025184732_purchase_requests.sql` | `tests/db/purchase.test.ts`, `tests/purchase/submit-purchase.test.ts` | реалізовано |
| AC-FRM-07 | подана закупівля має статус «Очікує схвалення» | `supabase/migrations/20261025184732_purchase_requests.sql` | `tests/db/purchase.test.ts` | реалізовано |
| AC-FRM-08 | чужу закупівлю за посиланням не показано — «Not enough permissions» | `supabase/migrations/20261025184732_purchase_requests.sql` (purchase_requests_select_visible), `src/app/(portal)/requests/[id]/page.tsx` | `tests/db/purchase.test.ts` | реалізовано |
| AC-FRM-09 | гість бачить сторінку входу замість форми | `src/proxy.ts`, `supabase/migrations/20261025184732_purchase_requests.sql` (без grant для anon) | `tests/db/purchase.test.ts` | реалізовано |
| AC-FRM-10 | «Мої заявки» — лише власні заявки зі статусами | `src/app/(portal)/requests/page.tsx`, `supabase/migrations/20261025184732_purchase_requests.sql` (RLS) | `tests/db/purchase.test.ts` | реалізовано |
| AC-FRM-11 | після подання — «Мої заявки» й «Purchase submitted» | `src/app/(portal)/requests/actions.ts` (submitPurchase) | `tests/purchase/submit-purchase.test.ts` | реалізовано |
| AC-FRM-12 | подання у відділ без схвалювача — «Очікує схвалення» | `supabase/migrations/20261025184732_purchase_requests.sql` (private.submit_purchase) | `tests/db/purchase.test.ts` | реалізовано |
| AC-FRM-13 | подання єдиним схвалювачем свого відділу — «Очікує схвалення» | `supabase/migrations/20261025184732_purchase_requests.sql` (private.submit_purchase) | `tests/db/purchase.test.ts`, `tests/db/approval.test.ts` | реалізовано |
| AC-FRM-14 | порожній стан «You have not submitted any requests yet» | `src/app/(portal)/requests/page.tsx` | `tests/purchase/my-requests-page.test.tsx` | реалізовано |
| AC-FRM-15 | рядок без усіх полів — «Fill in all line fields», не подано | `supabase/migrations/20261025184732_purchase_requests.sql` (INVALID_LINE), `src/app/(portal)/requests/actions.ts` | `tests/db/purchase.test.ts`, `tests/purchase/submit-purchase.test.ts` | реалізовано |
| AC-APR-01 | у списку для рішення лише заявки свого відділу | `src/app/(portal)/approvals/page.tsx`, `supabase/migrations/20261025184732_purchase_requests.sql` (RLS, private.is_approver_of) | `tests/db/approval.test.ts` | реалізовано |
| AC-APR-02 | схвалення заявки свого відділу — «Схвалено» | `supabase/migrations/20261025192130_purchase_decisions.sql` (private.decide_purchase), `src/app/(portal)/approvals/actions.ts` | `tests/db/approval.test.ts`, `tests/purchase/decide-purchase.test.ts` | реалізовано |
| AC-APR-03 | заявку чужого відділу не показано — «Not enough permissions» | `supabase/migrations/20261025192130_purchase_decisions.sql` (private.decide_purchase), `src/app/(portal)/requests/[id]/page.tsx` | `tests/db/approval.test.ts`, `tests/purchase/decide-purchase.test.ts` | реалізовано |
| AC-APR-04 | заявник не бачить списку для рішення — «Not enough permissions» | `supabase/migrations/20261025192130_purchase_decisions.sql` (private.decide_purchase), `src/app/(portal)/approvals/page.tsx` | `tests/db/approval.test.ts`, `tests/purchase/approvals-page.test.tsx` | реалізовано |
| AC-APR-05 | схвалювач не схвалює власну заявку | `supabase/migrations/20261025192130_purchase_decisions.sql` (private.decide_purchase) (OWN_REQUEST) | `tests/db/approval.test.ts` | реалізовано |
| AC-APR-06 | відхилення без причини — «Provide a reason», статус не змінено | `supabase/migrations/20261025192130_purchase_decisions.sql` (private.decide_purchase) (NO_REASON), `src/app/(portal)/approvals/actions.ts` | `tests/db/approval.test.ts`, `tests/purchase/decide-purchase.test.ts` | реалізовано |
| AC-APR-07 | відхилення з причиною — «Відхилено», причину показано на сторінці заявки | `supabase/migrations/20261025192130_purchase_decisions.sql` (private.decide_purchase), `src/app/(portal)/requests/[id]/page.tsx` | `tests/db/approval.test.ts`, `tests/purchase/decide-purchase.test.ts` | реалізовано |
| AC-APR-08 | схвалювач бачить ім'я автора в списку для рішення й на сторінці заявки | `supabase/migrations/20261026222326_request_author_email_fallback.sql` (private.request_author_names), `src/app/(portal)/approvals/page.tsx`, `src/app/(portal)/requests/[id]/page.tsx` («Author») | `tests/db/approval.test.ts`, `tests/purchase/approvals-page.test.tsx`, `tests/purchase/request-page.test.tsx` | реалізовано |
| AC-APR-09 | без імені в профілі — email автора замість імені | `supabase/migrations/20261026222326_request_author_email_fallback.sql` (coalesce імені й email) | `tests/db/approval.test.ts` | реалізовано |
| AC-APR-10 | ролі, відділів і дозволів автора схвалювач не бачить | `supabase/migrations/20261026222326_request_author_email_fallback.sql` (лише ім'я), сторінки не читають профілю автора | `tests/db/approval.test.ts`, `tests/purchase/approvals-page.test.tsx`, `tests/purchase/request-page.test.tsx` | реалізовано |
| AC-LANG-01 | усі написи інтерфейсу англійською, без українських слів | `src/app/layout.tsx` (lang="en"), `src/lib/org/messages.ts` | `tests/lang/ui-language.test.ts` | реалізовано |
| AC-LANG-02 | сторінка входу й помилка входу англійською | `src/app/login/page.tsx` | `tests/lang/ui-language.test.ts` | реалізовано |
| AC-LANG-03 | відмова — «Not enough permissions» без розкриття вмісту | `src/lib/org/messages.ts` (FORBIDDEN) | `tests/lang/ui-language.test.ts` | реалізовано |
| AC-LANG-04 | без рядків — «Add at least one line» | `src/lib/org/messages.ts` (NO_LINES) | `tests/lang/ui-language.test.ts` | реалізовано |
| AC-LANG-05 | відхилення без причини — «Provide a reason» | `src/lib/org/messages.ts` (NO_REASON) | `tests/lang/ui-language.test.ts` | реалізовано |
| AC-LANG-06 | статуси текстом «Awaiting approval», «Approved», «Rejected» | `src/lib/purchase/status.ts` (STATUS_LABEL) | `tests/lang/ui-language.test.ts` | реалізовано |
| AC-LANG-08 | ідентифікатори ролей без змін, підпис ролі англійською | `src/lib/org/roles.ts` (ROLE_LABEL) | `tests/lang/ui-language.test.ts` | реалізовано |
