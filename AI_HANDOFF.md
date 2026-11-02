# Family Finance — AI Handoff / Передача проекта

**Дата сборки handoff:** 2026-10-24  
**Назначение:** другая ИИ / разработчик может продолжить без потери контекста.  
**Внимание:** файл содержит секреты. Не коммитить в публичный репозиторий. Не публиковать.

---

## 1. Секреты и доступы (как в `.env.local`)

### Supabase (облачный проект)

| Переменная | Значение |
|------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | `<NEXT_PUBLIC_SUPABASE_URL - см. .env.local>` |
| Project ref (из URL) | `ulvqxlfnnuqsucsybleh` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<NEXT_PUBLIC_SUPABASE_ANON_KEY - см. .env.local>` |
| `SUPABASE_SERVICE_ROLE_KEY` | `<SUPABASE_SERVICE_ROLE_KEY - см. .env.local>` |

### Где лежат env-файлы

- Рабочий: `/home/deardeadcat/projects/family-finance/.env.local` (в `.gitignore`)
- Шаблон: `.env.example`
- В архиве handoff `.env.local` **включён** намеренно (по запросу владельца)

### Правила использования ключей в коде

- **Anon key** — клиент и SSR (`lib/supabase/client.ts`, `lib/supabase/server.ts`, `proxy.ts`)
- **Service role** — только сервер, только админские/системные операции (`lib/supabase/env.ts` → `getServiceRoleKey()`). Обычные user API **не** должны использовать service role; работают через user session + RLS.
- Dashboard Supabase: https://supabase.com/dashboard/project/ulvqxlfnnuqsucsybleh

### Чего в репозитории нет

- Пароль от аккаунта Supabase / GitHub / Vercel — не сохранён в проекте
- `DATABASE_URL` / connection string Postgres — не в `.env.local` (доступ через Supabase API/Dashboard)
- Тестовые логины пользователей приложения — не зафиксированы в коде (регистрация через `/register`)
- Remote git origin — **не настроен** (только локальный `.git`, один коммит Create Next App + куча untracked)

### Cursor / локальные пути

- Workspace: `/home/deardeadcat/projects/family-finance`
- OS: WSL2 Linux (`linux 6.18.33.1-microsoft-standard-WSL2`)
- Agent transcripts: `/home/deardeadcat/.cursor/projects/home-deardeadcat-projects-family-finance/agent-transcripts/`
- Основной chat id: `49b5acf7-54b3-4e84-b9db-e3296fcb9d42`
- Agent store: `/home/deardeadcat/.local/state/cursor/agent-stores/cursor_agent_stores/49b5acf7-54b3-4e84-b9db-e3296fcb9d42/files`

---

## 2. Стек

| Слой | Технология |
|------|------------|
| App | Next.js **16.3.7** (App Router, Turbopack), React **19.2.8**, TypeScript 5 |
| UI | Tailwind 4, shadcn/ui (Base UI), lucide-react |
| Charts | **recharts ^3.10.1** (ставить с `--legacy-peer-deps` при конфликтах peer) |
| Validation | Zod **4** |
| Dates | date-fns в deps (много логики на своих ISO/UTC helpers) |
| Backend data | Supabase Auth + PostgreSQL + RLS |
| Tests | Vitest 5 |
| Money | `numeric(15,2)` → string `Money`, арифметика в центах (`lib/calculations/money.ts`) |

**Важно (AGENTS.md / CLAUDE.md):** это не «классический» Next.js из обучающих данных. Перед правками смотреть `node_modules/next/dist/docs/` (после `npm install`).

---

## 3. Как запустить

```bash
cd /home/deardeadcat/projects/family-finance
# или распаковать архив и cd в папку
cp .env.local .env.local   # уже должен быть в архиве
npm install --legacy-peer-deps   # recharts peers
npm run dev                      # http://localhost:3000
```

Проверки качества (после Phase 3C все проходили):

```bash
npx tsc --noEmit
npm run lint
npm test          # Vitest: 126 passed, 1 skipped (integration placeholder)
npm run build
```

Скрипты в `package.json`: `dev`, `build`, `start`, `lint`, `test`, `test:watch`.

Интеграционный тест invitations включается только при:

```bash
RUN_SUPABASE_INTEGRATION=1
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 4. Архитектура (обязательно сохранить)

```
UI (app/(dashboard)/app/*) 
  → services/* (бизнес-логика)
  → Supabase client (user JWT) + RLS
API (app/api/*) 
  → requireHousehold() из lib/auth/api.ts
  → Zod schemas в lib/validations/*
  → services/*
Чистые расчёты: lib/calculations/*
Типы БД: types/database.ts
```

### Auth / household

- `getSessionUser()` — `lib/auth/session.ts`
- `getHouseholdContext()` — `lib/auth/household.ts` (cookie household + membership)
- `requireHousehold()` — для API routes
- Роли: owner / admin / member → `canWrite`, `canAdmin`
- Middleware/proxy: `proxy.ts` (Next 16 proxy pattern)

### Деньги и валюты

- **Никакой FX-конвертации.** Не складывать EUR+USD.
- Transfers ≠ income/expense семьи (только перемещение между счетами).
- Soft-delete: `transactions.deleted_at` — исключать из агрегатов.
- Баланс **не хранится**: считается из `initial_balance ± txs ± transfers` (`lib/calculations/account-balance.ts`, `listAccountsWithBalances`).

### Мультивалютность

Всегда: отдельные серии / фильтр по валюте / явное разделение в UI.

---

## 5. Что уже реализовано (фазы)

### Phase 0–1 — Foundation

- Auth register/login/logout
- Households, members, profiles, RLS
- Invitations (accept/preview)
- Accounts, transactions, transfers
- Dashboard с базовыми агрегатами

### Phase 2

- Categories, tags, income_sources
- Monthly category budgets + progress
- Financial goals + operations
- Recurring payments: create, confirm, skip (RPC)
- Occurrence statuses: `pending | paid | skipped | overdue` (confirm → **paid**, не "confirmed")
- Financial calendar: materialised + projected recurring

### Phase 3A — Settings

- Profile + household settings (timezone, week_starts_on, month_starts_on, defaults)
- CRUD categories / tags / income_sources
- Миграция: `20261018180000_settings_reference_data.sql`  
  (`tags.is_active`, `transactions.income_source_id`, …)

### Phase 3B — Analytics

- Recharts charts
- `services/analytics-service.ts`
- API: `/api/analytics/{summary,cash-flow,categories,budgets}`
- Page: `/app/analytics`
- Периоды: current/previous month, 3/6 months, year, custom
- Без FX; percent change без Infinity/NaN
- CSV export — **не делали**

### Phase 3C — Forecasts & Safe-to-Spend

- `services/forecast-service.ts`
- `lib/calculations/forecast.ts`, `forecast-horizon.ts`, `timezone-date.ts`
- API: `GET /api/forecast`
- UI: Dashboard compact panel + Analytics full panel
- Горизонты: `end_of_month | next_7_days | next_30_days | custom`
- `today` через `household_settings.timezone`
- **Миграций для 3C нет**

#### Формулы 3C (на валюту)

```
forecastBalance = currentBalance + expectedIncome − expectedExpense
safeToSpend     = currentBalance − mandatoryOutflows − reserve
```

- `reserve` = **0** (поля в схеме нет; в UI явно «не настроен»)
- Доход **не** увеличивает Safe-to-Spend
- Бюджеты **не** вычитаются из STS (информационный блок near-limit)
- Expected income: только recurring `type=income` по расписанию; **income_sources не прогнозируются**
- Eligible expenses: pending/overdue occurrences + future projected без дубля occurrence
- Исключать: paid / skipped / с `transaction_id` / past projected gaps

### Стабилизация (2026-10-26, после аудита)

- Пагинация всех агрегатов через `lib/supabase/fetch-all.ts` (лимит PostgREST 1000 строк искажал балансы/аналитику); ошибки запросов больше не глотаются.
- Календарь: факт = только транзакции (оплаченный occurrence больше не дублирует сумму); итоги по валютам. Чистая функция `buildCalendarEvents` + реальные тесты.
- Валюта транзакции = валюта счёта (сервис + триггер); валюту счёта с операциями менять нельзя.
- Dashboard: доходы/расходы месяца по валютам (`otherCurrencies`), без смешивания.
- Часовой пояс семьи везде: `getHouseholdToday()` в `settings-service` (dashboard, аналитика, календарь, бюджеты, overdue, формы).
- Recurring: при изменении расписания будущие pending помечаются skipped («Superseded by schedule change») и пересчитывается `next_due_date`; `day_of_month` хранится для monthly/yearly; 29 февраля одинаково в JS и SQL.
- Удаление транзакции, подтвердившей recurring, возвращает occurrence в pending.
- Прогноз: график заканчивается на `forecastBalance` (просроченные учитываются сегодня); custom-горизонт ограничен от today.
- % изменения корректен при отрицательной базе.
- Бюджеты: один запрос на месяц вместо N+1; recurring list: пакетный ensure.
- Безопасность БД (миграция `20261026120000`): нельзя вставить чужого user в семью; участник меняет только своё display_name; админ не может стать owner; строки участников нельзя переносить; история целей только через RPC; email профиля = auth email; файлы чеков перезаписывает только owner/admin; income_source только своей семьи; удаление household больше не блокируется триггером.
- `handleRouteError` не отдаёт сырые исключения; `token_hash` не возвращается в API приглашений; ссылка-инвайт строится от `APP_URL`.

### Phase 4A — Receipts

- `services/receipt-service.ts`, `lib/validations/receipt.ts` (тип по magic bytes, ≤ 8 MB — запас под 10 MB буфер proxy), имя объекта генерирует сервер.
- API: `GET/POST /api/transactions/[id]/receipts`, `GET /api/receipts/[id]` (302 на signed URL 60 с, no-store), `DELETE /api/receipts/[id]`.
- UI: блок «Receipts» у каждой транзакции на `/app/transactions`.
- Миграция `20261026130000`: чек ↔ транзакция и путь той же семьи; удалять может загрузивший или owner/admin.
- При сбое записи метаданных загруженный объект удаляется service-role (точечно, только этот путь).

### Phase 4B — Notifications & Audit log

- Пишут только SECURITY DEFINER-триггеры (миграция `20261026140000`); клиент: чтение своих уведомлений + `is_read`; аудит читают owner/admin, никто не пишет.
- События: member joined / role changed / removed, invitations, household settings, accounts (create/currency/opening balance/active), transaction deleted, recurring paid/skipped (уведомление остальным).
- Payload аудита — белые списки полей (без token_hash).
- `/app/notifications` (+ счётчик в шапке), `/app/activity` (owner/admin), API `/api/notifications`, `/api/audit`.

### Phase 4C — PWA / mobile

- `app/manifest.ts`, иконки `public/icon-*.png` (генератор `scripts/generate-pwa-icons.mjs`).
- `public/sw.js`: кэширует только `/offline.html`, перехватывает только навигации — приватные данные/API не кэшируются.
- Заголовки безопасности в `next.config.ts`; `/api/*` → `Cache-Control: private, no-store`.
- Мобильная навигация (`components/nav/app-nav.tsx`), `loading.tsx`, `error.tsx` (Next 16: проп `retry`), `not-found.tsx`, баннер офлайна.

### Phase 4D — CSV export

- `lib/export/csv.ts`: RFC 4180, BOM, CRLF, защита от CSV-инъекций (`= + - @ TAB CR` → префикс `'`).
- `GET /api/export/transactions?from&to[&currency][&accountId]` (≤ 5 лет, без удалённых и transfers), `GET /api/export/analytics?…` (long format).
- UI: форма на `/app/transactions`, ссылка «Export CSV» в аналитике.

### Safe-to-Spend: резерв и обязательные платежи (миграция 13)

- `household_settings.safe_to_spend_reserves` (jsonb `{"EUR":"500.00"}`, CHECK формата) — резерв по валютам, вычитается из STS; поля в Settings появляются после миграции.
- `recurring_payments.is_mandatory` (default true): необязательные расходы уменьшают forecast balance, но не STS. Чекбокс в формах recurring, пометка «optional».
- Смена расписания recurring: `lib/calculations/recurring-reschedule.ts` — пересчёт только при реальном изменении полей; вытесняются только даты, выпавшие из нового расписания; возвращённые даты оживают.

### Purrfect Home — расширение (2026-10-26)

Приложение переименовано в **Purrfect Home** (папка/пакет остались `family-finance`). План владельца, по порядку (всё ✅): дела и расписание → привычки → питание → ИИ-помощник (только **бесплатный** провайдер; делать через OpenAI-совместимый API — Gemini / Groq / OpenRouter / Ollama; ИИ предлагает изменения карточкой, применяются только по кнопке).

**Дела и расписание (миграция 14):**
- Одна таблица `tasks` для дел (без времени) и событий (со временем); `assignee_member_id` NULL = «вместе». Повторы: none / daily (каждые N дней) / weekly (ISO-дни, каждые N недель) / monthly (день месяца с клампом, каждые N месяцев) + `repeat_until`. Разовые — `tasks.completed_at`; повторяющиеся — `task_completions(task_id, occurrence_date)`.
- Разворачивание дат и повестка — `lib/calculations/task-schedule.ts` (покрыто тестами); пропущенные даты повторов не становятся «просроченными», только разовые.
- Цвета партнёров — `lib/people.ts` (по порядку вступления: розовый, бирюзовый; «вместе» — лаванда).
- Страницы `/app/tasks` (секции + фильтр по человеку), `/app/schedule` (неделя); карточка «Today together» на Dashboard (скрывается, если таблицы ещё нет). API: `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/complete`.
- Уведомление партнёру при назначении (триггер). Редактирование повторяющегося меняет все даты (переноса одной даты пока нет).

**Привычки (миграция 15):**
- `habits`: `owner_member_id` NULL = для всех (каждый отмечает своё); цель `check` (target=1) или `count` (target + unit); частота `daily` / `days` (ISO-дни) / `per_week` (N раз в неделю). `habit_checkins(habit_id, member_id, checkin_date, value)`.
- БД-правила: отмечать только себя и только участнику привычки; дата не в будущем и ≤ 7 дней назад (по часовому поясу семьи; для service-role окно не применяется). Серия 7/30/100/365 дней (daily) → уведомление партнёру, без повторов при повторном обновлении значения.
- Логика серий/статусов — `lib/calculations/habits.ts` (недельные серии для per_week; незавершённый сегодняшний день не рвёт серию; `roundAmount` против float-артефактов).
- `/app/habits`: карточки с полосой 7 дней на каждого, кнопка «сегодня» / степпер −/+; API `/api/habits`, `/api/habits/[id]`, `/api/habits/[id]/checkin`.

**Питание (миграция 16):**
- План владельца («План питания на 7 дней», PDF) перенесён в `lib/meals/seven-day-plan.ts`: 30 продуктов (значения на 100 г — усреднённые, откалиброваны так, что все 56 итогов приёмов совпадают с PDF в пределах 6%, см. тест), 28 приёмов с граммами «муж/жена», цели, привычки (вода, шаги, силовая пн/чт), заметки (взвешивание, готовка, лактоза).
- Таблицы: `foods` (на 100 г, метка взвешивания С/Р/У/Б/О/Я, отдел для покупок), `meal_plans` (один активный), `meal_plan_meals` (день 1–7 + слот), `meal_plan_portions` (граммы на человека), `nutrition_targets`. Продукт из плана удалить нельзя (FK RESTRICT).
- `/app/meals`: Today / Week plan (редактор: блюдо, граммы каждому, добавление/удаление) / Shopping (+ «Add to To-do») / Foods / Targets. Импорт: выбрать, кто «Муж» и кто «Жена».
- Шаги в плане растут понедельно (2 500 → 7 000) — цель привычки «Шаги» пока меняется вручную.

**ИИ-помощник (без миграций):**
- Имя помощника — **Морти** (Morty), с 2026-10-27.
- Провайдер: Google Gemini (бесплатный уровень) через OpenAI-совместимый API, обычный `fetch` без SDK — `lib/ai/client.ts`. Env (server only): `AI_API_KEY` (без него страница показывает подсказку, API отдаёт 503), `AI_BASE_URL` (по умолчанию Gemini `/v1beta/openai/`), `AI_MODEL` (по умолчанию `gemini-flash-latest`), `AI_FALLBACK_MODEL` (по умолчанию `gemini-flash-lite-latest`, `off` — выключить). Можно переключить на Groq/OpenRouter/Ollama одной сменой env.
- Запасная модель: если основная отвечает 429/5xx или не укладывается в 25 с, тот же запрос уходит в fallback (401/403 — нет). После переключения ход доигрывается на fallback до конца (подписи tool-call принадлежат модели). `gemini-2.5-*` для новых ключей отдают 404.
- Дедлайн хода 75 с (`TURN_BUDGET_MS`, таймауты запросов режутся по остатку), `maxDuration` 90 у `/api/assistant` и `/api/receipts/scan`; после сбоя основная модель пропускается 5 минут (в памяти инстанса).
- Квота ИИ — в БД: `take_ai_quota()` (миграция `20261027110000`), 20 / 10 мин и 100 / сутки на пользователя, общая для `assistant` и `receipt_scan`; `lib/ai/rate-limit.ts` `takeAiQuota()` (fallback — in-memory, пока миграции нет).
- Распознавание чеков: `POST /api/receipts/scan` → `services/receipt-scan-service.ts`; фото только уходит в Gemini, не хранится; ответ модели валидируется поле за полем.
- Живая проверка: `npm run check:ai` (`vitest.live.config.mts`, `services/assistant-service.live.ts`) — выдуманные вопросы, БД замокана; не входит в `npm test`.
- `services/assistant-service.ts`: цикл tool-calling (≤5 раундов). Читающие инструменты (`get_overview`, `get_day_meals`, `get_agenda`, `get_habits`, `get_foods`) выполняются от имени пользователя под RLS. Изменения — только `propose_*` (создать/изменить дело, граммы приёма, переименовать блюдо): модель получает «shown_to_user», пользователь видит карточку с описанием, которое собирает сервер, а не модель.
- `POST /api/assistant` (≤20 сообщений, лимит 20 запросов / 10 мин на пользователя, в памяти процесса) и `POST /api/assistant/apply` (повторная валидация `proposalSchema` → обычные сервисы, т.е. ИИ не может больше, чем формы).
- UI: `/app/assistant` (`?q=` — предзаполнение), быстрые вопросы, карточки Apply/Dismiss, история только в sessionStorage вкладки. На карточке приёма пищи — ссылка «✨ Recipe idea».
- Приватность: вопрос и найденные данные уходят в Google; на бесплатном уровне Google может использовать их для улучшения продуктов — это написано под чатом.

### Phase 4E — polish (код)

- Удалены пустые папки-заготовки и мёртвый `api/analytics/cashflow`.
- Ошибки загрузки на Dashboard/Accounts показываются, а не маскируются нулями.
- Даты по умолчанию в формах = «сегодня» семьи с сервера (без hydration mismatch).

---

## 6. Миграции (порядок применения)

Каталог: `supabase/migrations/`

1. `20260930130000_init_family_finance_schema.sql`
2. `20261017140000_fix_grants_and_household_insert.sql`
3. `20261017150000_audit_security_integrity_fixes.sql`
4. `20261018120000_household_invitations.sql`
5. `20261018130000_fix_invite_digest_search_path.sql`
6. `20261018140000_monthly_category_budgets.sql`
7. `20261018150000_goals_currency_archive_operations.sql`
8. `20261018160000_recurring_payments_confirm.sql`
9. `20261018180000_settings_reference_data.sql` ← **убедиться что применена на remote**
10. `20261026120000_stabilization_security_integrity.sql` ← новая, не применена
11. `20261026130000_receipts_upload_delete.sql` ← новая, не применена
12. `20261026140000_notifications_audit_log.sql` ← новая, не применена
13. `20261026150000_safe_to_spend_reserve.sql` ← новая, не применена
14. `20261026160000_tasks_schedule.sql` ← новая, не применена
15. `20261026170000_habits.sql` ← новая, не применена
16. `20261026180000_meal_plans.sql` ← новая, не применена

**Как применить 9–16 разом:** `supabase/pending/apply-pending-migrations.sql` → Supabase SQL Editor → Run; последняя таблица — чек-лист, везде `ok = true`. Затем `npm run check:remote`. Файл пересобирается `npm run db:bundle`.

Код совместим со схемой до миграций 13 (резерв/is_mandatory не отправляются, пока колонок нет), но страница настроек и Quick Add требуют миграции 9.

Все миграции идемпотентны и проверяются тестом `supabase/tests/schema.pglite.test.ts` (PGlite).

Seed: `supabase/seed.sql`  
CLI config: `supabase/config.toml` (Postgres 15)

Применить на remote (если ещё не все):

```bash
npx supabase link --project-ref ulvqxlfnnuqsucsybleh
npx supabase db push
# или через Dashboard → SQL Editor по файлам по порядку
```

---

## 7. Карта маршрутов UI

| URL | Назначение |
|-----|------------|
| `/login`, `/register`, `/invite` | Auth |
| `/app/dashboard` | Dashboard + forecast compact |
| `/app/accounts` | Счета |
| `/app/transactions` | Операции |
| `/app/budgets` | Бюджеты |
| `/app/goals` | Цели |
| `/app/recurring` | Повторяющиеся платежи |
| `/app/calendar` | Календарь |
| `/app/analytics` | Аналитика + forecast full |
| `/app/family` | Семья / инвайты |
| `/app/settings` | Настройки и справочники |
| `/app/notifications` | Уведомления |
| `/app/activity` | Журнал активности (owner/admin) |

Навигация: `app/(dashboard)/app/layout.tsx` + `components/nav/app-nav.tsx` (десктоп и мобильная).

---

## 8. Ключевые сервисы

| Файл | Роль |
|------|------|
| `services/account-service.ts` | Счета + балансы |
| `services/transaction-service.ts` | Операции, monthly income/expense |
| `services/transfer-service.ts` | Переводы |
| `services/budget-service.ts` | Бюджеты plan/fact |
| `services/goal-service.ts` | Цели |
| `services/recurring-service.ts` | Recurring + confirm/skip |
| `services/calendar-service.ts` | Календарь месяца |
| `services/analytics-service.ts` | Отчёт аналитики |
| `services/forecast-service.ts` | Прогноз + STS |
| `services/settings-service.ts` | Profile / household settings |
| `services/category-service.ts`, `tag-service.ts`, `income-source-service.ts` | Справочники |
| `services/invitation-service.ts`, `family-service.ts`, `auth-service.ts` | Auth/family |

---

## 9. Известные ограничения и долги

1. **Ручной QA в браузере отложен** намеренно (владелец просил не делать до отдельного этапа).
2. `timezone` используется везде; `week_starts_on` / `month_starts_on` хранятся, но периоды — календарные месяцы (бюджеты по схеме помесячные).
3. Резерв и `is_mandatory` реализованы (миграция 13), работают после её применения.
4. Phase 5 (лимиты Supabase) выполнена только в части кода: пагинация, N+1, индексы, секреты вне бандла. Измерение реального потребления — в Dashboard Supabase.
5. Удаление аккаунта пользователя блокируют FK `ON DELETE RESTRICT` (transactions/goal_operations/receipts.created_by/uploaded_by) — нужен отдельный дизайн (анонимизация).
6. Сообщения ошибок БД (код `DB`) по-прежнему пробрасываются клиенту как есть (только авторизованным).
7. Транзакции с будущей датой уже входят в текущий баланс (как и раньше).
8. Push/email-уведомления не делались (только in-app).
7. Hydration mismatch от Cursor `data-cursor-ref` — ложное срабатывание, не баг приложения.
8. Confirm recurring: PostgREST может отдавать `amount` number — Zod принимает number|string; UI через `asMoney`.

---

## 10. Что делать дальше (рекомендуемый порядок)

Не начинать автоматически без запроса владельца. Кандидаты:

**Актуальный план (2026-10-27, согласован с владельцем; подробно — `ИНСТРУКЦИЯ.md`, раздел 11):**
владелец дома применяет миграции 9–20, деплоит на Vercel (env: `AI_API_KEY`, `VAPID_*`, `CRON_SECRET`, `APP_URL`), перевыпускает ключи.
Затем по команде «поехали по плану»: (1) browser QA всего UI на 360 px и десктопе (Playwright MCP, скриншоты) — после перевода 100+ файлов;
(2) бэкапы: `npm run backup` (выгрузка данных семьи в файл) и/или ежемесячная автовыгрузка; (3) push-дыра — уведомления вне `requireHousehold()`
(напр. accept invitation) и старше 1 ч не отправляются; (4) подстройка распознавания на реальных чеках; (5) монохромная badge-иконка Android;
(6) Главная: убрать двойное чтение операций, балансы — агрегатом в БД. Отложено владельцем: автоцель шагов, экспорт .ics.

Старый список (частично выполнен):

1. **Применить миграции 9–20** на remote через `supabase/pending/apply-pending-migrations.sql`, затем `npm run check:remote`.
2. **Ручной browser QA**: auth → invite → accounts → txs (+ чеки) → transfers → budgets → recurring confirm/skip (+ уведомление второму участнику) → calendar → analytics/forecast → CSV → activity → установка PWA на телефон.
3. Phase 5 в Dashboard Supabase: тариф, размер БД/Storage, egress, Auth; политика хранения чеков/аудита.
4. Перевыпустить ключи Supabase и убрать их из этого файла перед публикацией репозитория.
5. Опционально: `reserve_amount` / `is_mandatory`; `month_starts_on`; push-уведомления.
6. `git init`: первый commit всего приложения; `.env.local` и этот файл (с ключами) **не** коммитить.

---

## 11. Соглашения для продолжающей ИИ

- Не переписывать архитектуру.
- Не ослаблять RLS / auth.
- Не добавлять фиктивную FX.
- Не выдавать forecast за actual.
- Не дублировать расчёт баланса — переиспользовать `listAccountsWithBalances`.
- Новые фичи: `service → API → UI` + Zod + Vitest.
- Не коммитить без явной просьбы пользователя.
- Не пушить force / не трогать git config.
- Дизайн (по просьбе владельца, 2026-10-26): «милый, для пары» — палитра blush & mint, шрифты Fredoka (заголовки) + Nunito (текст, кириллица), котики и сердечки. Всё на токенах `app/globals.css` (`--income/--expense` для текста, `--*-mark` и `--chart-1..8` для графиков — палитры проверены dataviz-валидатором, порядок категорий фиксирован, >8 → «Other»). Иллюстрации: `components/cute/illustrations.tsx`; `StatCard`, `EmptyState` в `components/cute/`; карточки — утилита `card-soft`; стили графиков — `components/analytics/chart-theme.tsx` (текст легенды всегда цветом текста). Сохранять этот стиль; новые цвета — только через токены.
- После изменений: `tsc`, `lint`, `vitest`, `build`.

---

## 12. Последние результаты проверок (2026-10-26, после Phase 4E)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | OK |
| ESLint | OK |
| Vitest | 209 passed, 1 skipped (вкл. тесты схемы и бандла миграций на PGlite) |
| Браузер без входа (360 px) | главная, регистрация, вход, офлайн, редирект `/app`, SW, manifest, заголовки — OK |
| `next build` | OK |

---

## 13. Архив

Соседний файл/путь архива (создаётся скриптом handoff):

- Последний: `purrfect-home-2026-10-27.tar.gz` (в `Desktop\fam`); раньше — `family-finance-handoff-2026-10-24.tar.gz`
- Содержимое: исходники + `.env.local` + этот `AI_HANDOFF.md`
- **Исключено:** `node_modules/`, `.next/`, `*.tsbuildinfo`, coverage

После распаковки: `npm install` (с 2026-10-27 без `--legacy-peer-deps`: `@types/node` ^22 под peer-диапазон vitest 5; нужен Node ≥ 22.12).

---

## 14. Контакты контекста владельца

- Пользователь workspace: `deardeadcat`
- Проект семейных финансов; общение по задачам часто на **русском**, код — **английский**, интерфейс — **русский** (с 2026-10-27; даты/суммы через `LOCALE` из `lib/locale.ts`, обращение на «ты»). Промпт и описания инструментов для модели — на английском.
- Тексты, которые пишет БД (уведомления, категории по умолчанию, «Наша семья»/«Наличные»), переведены миграцией `20261027100000_russian_db_texts.sql` (+ `seed.sql`). `RAISE EXCEPTION` остаются английскими — сервисы мапят их на русский.

### 2026-10-27 — push, сводка, лимиты
- **Push:** `20261027120000_push_subscriptions.sql` (`push_subscriptions`, `notifications.pushed_at`, `claim_notification_pushes()`), `services/push-service.ts`, `lib/push/*`, `/api/push/{subscribe,test}`, обработчики в `public/sw.js`. Рассылка запускается из `requireHousehold()` через `after()` для POST/PATCH/PUT/DELETE (метод пробрасывает `proxy.ts` заголовком `x-ph-request-method`). Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Сводка:** `services/summary-service.ts` (`buildDailySummary`, `buildMorningDigests`), `lib/summary/daily-summary.ts`, `components/summary/daily-summary-card.tsx` на Главной (старый `today-card` удалён).
- **Лимиты:** `20261027130000_retention_cleanup.sql` (`cleanup_expired_data()` и др., только service_role), `services/maintenance-service.ts` `runDailyCleanup`, `services/usage-service.ts` (потолок 800 МБ чеков на семью), сжатие фото `lib/image/compress-receipt.ts`, карточка «Использование» в Настройках, `listAccounts` без чтения операций.
- **Cron:** `vercel.json` → `/api/cron/daily` в 05:00 UTC (очистка + утренние push, заодно не даёт Supabase уснуть). Защита — `CRON_SECRET`.
- Next 16.4.3 (в 16.3.7 критические уязвимости), `npm audit` — 0.
- Приоритет: корректная финансовая семантика > красивые фичи

---

*Конец handoff. При обновлении секретов — сразу править этот файл и `.env.local`, затем пересобрать архив.*
