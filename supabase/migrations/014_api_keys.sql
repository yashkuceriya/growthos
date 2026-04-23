-- Personal API keys for calling /api/v1/* from external systems. We store a
-- SHA-256 hash of the key, never the plaintext. `prefix` is the first 8 chars
-- of the key (shown as gos_live_xxxxxxxx) so the UI can list keys without
-- revealing the secret. `scopes` is a text[] of allowed verbs — for MVP we
-- support 'leads:write', 'projects:ingest', 'projects:read'. `expires_at`
-- optional so users can mint short-lived integration keys.

create table api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index api_keys_hash on api_keys(key_hash);
create index api_keys_user on api_keys(user_id);

alter table api_keys enable row level security;
create policy "Users can manage own api keys" on api_keys for all using (auth.uid() = user_id);
