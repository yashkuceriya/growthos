-- ================================
-- EMAIL TEMPLATES
-- ================================
create table email_templates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text,
  body_json jsonb,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_templates_project on email_templates(user_id, project_id);

alter table email_templates enable row level security;
create policy "Users can manage own templates" on email_templates for all using (auth.uid() = user_id);

create trigger email_templates_updated_at before update on email_templates
  for each row execute function update_updated_at();

-- ================================
-- EMAIL LISTS
-- ================================
create table email_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  subscriber_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_lists_project on email_lists(user_id, project_id);

alter table email_lists enable row level security;
create policy "Users can manage own lists" on email_lists for all using (auth.uid() = user_id);

create trigger email_lists_updated_at before update on email_lists
  for each row execute function update_updated_at();

-- ================================
-- EMAIL SUBSCRIBERS
-- ================================
create table email_subscribers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references email_lists(id) on delete cascade,
  email text not null,
  name text,
  metadata jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced')),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index email_subscribers_list_email on email_subscribers(list_id, email);
create index email_subscribers_status on email_subscribers(status);

alter table email_subscribers enable row level security;
create policy "Users can manage own subscribers" on email_subscribers for all using (auth.uid() = user_id);

-- Update list subscriber count via trigger
create or replace function update_subscriber_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update email_lists set subscriber_count = subscriber_count + 1 where id = NEW.list_id;
  elsif TG_OP = 'DELETE' then
    update email_lists set subscriber_count = subscriber_count - 1 where id = OLD.list_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

create trigger email_subscribers_count_trigger
  after insert or delete on email_subscribers
  for each row execute function update_subscriber_count();

-- ================================
-- EMAIL SEQUENCES (drip campaigns)
-- ================================
create table email_sequences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'manual' check (trigger_type in ('signup', 'tag_added', 'manual', 'event')),
  trigger_config jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_sequences enable row level security;
create policy "Users can manage own sequences" on email_sequences for all using (auth.uid() = user_id);

create trigger email_sequences_updated_at before update on email_sequences
  for each row execute function update_updated_at();

-- ================================
-- EMAIL SEQUENCE STEPS
-- ================================
create table email_sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references email_sequences(id) on delete cascade,
  template_id uuid references email_templates(id) on delete set null,
  step_order integer not null,
  delay_hours integer not null default 24,
  condition jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index email_sequence_steps_order on email_sequence_steps(sequence_id, step_order);

-- RLS via sequence ownership
alter table email_sequence_steps enable row level security;
create policy "Users can manage steps via sequence" on email_sequence_steps for all
  using (exists (select 1 from email_sequences where email_sequences.id = email_sequence_steps.sequence_id and email_sequences.user_id = auth.uid()));

-- ================================
-- EMAIL SENDS (tracking)
-- ================================
create table email_sends (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references email_templates(id) on delete set null,
  subscriber_id uuid references email_subscribers(id) on delete set null,
  sequence_id uuid references email_sequences(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index email_sends_template on email_sends(template_id);
create index email_sends_status on email_sends(status);
create index email_sends_subscriber on email_sends(subscriber_id);

alter table email_sends enable row level security;
create policy "Users can manage own sends" on email_sends for all using (auth.uid() = user_id);
