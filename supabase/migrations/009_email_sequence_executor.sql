-- ================================
-- EMAIL SEQUENCE ENROLLMENTS
-- ================================
-- Tracks which subscribers are currently flowing through which sequence,
-- which step they're on, and when the next step should fire. Populated by
-- the /api/email/sequence-tick cron and drained by the same job as steps
-- come due.

create table email_sequence_enrollments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_id uuid not null references email_sequences(id) on delete cascade,
  subscriber_id uuid not null references email_subscribers(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  next_step_order integer not null default 1,
  next_send_at timestamptz,
  last_sent_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled', 'failed')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_sequence_enrollments_unique on email_sequence_enrollments(sequence_id, subscriber_id);
-- Partial index to make the cron's "what's due?" query fast
create index email_sequence_enrollments_due on email_sequence_enrollments(next_send_at)
  where status = 'active' and next_send_at is not null;
create index email_sequence_enrollments_subscriber on email_sequence_enrollments(subscriber_id);

alter table email_sequence_enrollments enable row level security;
create policy "Users can manage own enrollments" on email_sequence_enrollments for all using (auth.uid() = user_id);

create trigger email_sequence_enrollments_updated_at before update on email_sequence_enrollments
  for each row execute function update_updated_at();
