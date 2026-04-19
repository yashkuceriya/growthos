create table budget_allocations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  channel text not null,
  planned_amount numeric(10,2) not null,
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index budget_allocations_campaign on budget_allocations(campaign_id);

alter table budget_allocations enable row level security;
create policy "Users can manage own allocations" on budget_allocations for all using (auth.uid() = user_id);

create trigger budget_allocations_updated_at before update on budget_allocations
  for each row execute function update_updated_at();

create table budget_expenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  allocation_id uuid not null references budget_allocations(id) on delete cascade,
  amount numeric(10,2) not null,
  description text,
  expense_date date not null,
  receipt_url text,
  created_at timestamptz not null default now()
);

create index budget_expenses_allocation on budget_expenses(allocation_id);

alter table budget_expenses enable row level security;
create policy "Users can manage own expenses" on budget_expenses for all using (auth.uid() = user_id);
