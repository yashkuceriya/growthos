-- Follow-up to 015. The unique index on social_accounts(project_id, platform)
-- was created with `if not exists`, which silently no-ops if the index is
-- already there OR if duplicates exist (the index just wouldn't apply). This
-- migration verifies the precondition: it raises an exception if duplicates
-- exist before retrying the index. Idempotent.

do $$
declare
  dup_count integer;
begin
  -- Drop in case 015's `if not exists` created a non-unique stub or it
  -- somehow ended up missing on a partial run.
  execute 'drop index if exists social_accounts_default_per_platform';

  select count(*) into dup_count from (
    select project_id, platform, count(*) c
    from social_accounts
    group by project_id, platform
    having count(*) > 1
  ) dups;

  if dup_count > 0 then
    raise exception
      'Cannot apply unique (project_id, platform) on social_accounts: % group(s) of duplicates exist. Resolve manually before re-running.',
      dup_count;
  end if;
end $$;

create unique index social_accounts_default_per_platform
  on social_accounts(project_id, platform);
