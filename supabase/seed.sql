-- Family Finance seed data
-- Safe system templates only — no real users, households, or financial data.
-- Apply after the init migration (SQL Editor or `supabase db reset` / seed hook).

-- Global system categories (household_id IS NULL, is_system = true)
-- Nested expense tree + income categories (Russian names; migration
-- 20261027100000_russian_db_texts.sql renames older English rows).

WITH inserted AS (
  INSERT INTO public.categories (
    id, household_id, name, icon, color, type, parent_id, is_system, sort_order, is_active
  )
  VALUES
    -- Root expense categories
    ('11111111-1111-1111-1111-111111111101', NULL, 'Жильё', 'home', '#64748B', 'expense', NULL, true, 10, true),
    ('11111111-1111-1111-1111-111111111102', NULL, 'Еда', 'utensils', '#F97316', 'expense', NULL, true, 20, true),
    ('11111111-1111-1111-1111-111111111103', NULL, 'Транспорт', 'car', '#0EA5E9', 'expense', NULL, true, 30, true),
    ('11111111-1111-1111-1111-111111111104', NULL, 'Здоровье', 'heart-pulse', '#EF4444', 'expense', NULL, true, 40, true),
    ('11111111-1111-1111-1111-111111111105', NULL, 'Покупки', 'shopping-bag', '#EC4899', 'expense', NULL, true, 50, true),
    ('11111111-1111-1111-1111-111111111106', NULL, 'Развлечения', 'clapperboard', '#A855F7', 'expense', NULL, true, 60, true),
    ('11111111-1111-1111-1111-111111111107', NULL, 'Подписки', 'repeat', '#6366F1', 'expense', NULL, true, 70, true),
    ('11111111-1111-1111-1111-111111111108', NULL, 'Коммуналка', 'zap', '#EAB308', 'expense', NULL, true, 80, true),
    ('11111111-1111-1111-1111-111111111109', NULL, 'Страховка', 'shield', '#14B8A6', 'expense', NULL, true, 90, true),
    ('11111111-1111-1111-1111-111111111110', NULL, 'Прочие расходы', 'circle-ellipsis', '#94A3B8', 'expense', NULL, true, 100, true),

    -- Food children
    ('11111111-1111-1111-1111-111111111121', NULL, 'Продукты', 'shopping-cart', '#F97316', 'expense', '11111111-1111-1111-1111-111111111102', true, 21, true),
    ('11111111-1111-1111-1111-111111111122', NULL, 'Кафе и рестораны', 'utensils-crossed', '#FB923C', 'expense', '11111111-1111-1111-1111-111111111102', true, 22, true),

    -- Income categories
    ('11111111-1111-1111-1111-111111111201', NULL, 'Зарплата', 'briefcase', '#22C55E', 'income', NULL, true, 10, true),
    ('11111111-1111-1111-1111-111111111202', NULL, 'Фриланс', 'laptop', '#16A34A', 'income', NULL, true, 20, true),
    ('11111111-1111-1111-1111-111111111203', NULL, 'Прочие доходы', 'plus-circle', '#86EFAC', 'income', NULL, true, 30, true)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT count(*) AS seeded_categories FROM inserted;
