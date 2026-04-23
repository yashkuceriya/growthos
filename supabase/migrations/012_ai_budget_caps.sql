-- Per-project monthly AI budget. When the running month's ai_cost_ledger total
-- for the project exceeds this cap, expensive routes should return 402 Payment
-- Required instead of running. NULL = no cap (unlimited, default).

alter table projects add column if not exists monthly_ai_budget_usd numeric(10, 2);

-- Helper: month-to-date AI spend for a project (in the Postgres server's TZ,
-- which matches default Supabase UTC). Used by the budget check + UI.
create or replace function project_month_ai_spend(p_project_id uuid)
returns numeric
language sql
security invoker
stable
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from ai_cost_ledger
  where project_id = p_project_id
    and created_at >= date_trunc('month', now());
$$;
