-- Multi-tenant AI usage foundation. Provider secrets are referenced through a
-- server-side secret manager and are never exposed to browser roles.
create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('openai', 'anthropic', 'gemini', 'openrouter')),
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.ai_providers (slug, name) values
  ('openai', 'OpenAI'), ('anthropic', 'Anthropic'),
  ('gemini', 'Gemini'), ('openrouter', 'OpenRouter')
on conflict (slug) do nothing;

create table public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_id uuid not null references public.ai_providers(id) on delete restrict,
  label text not null check (char_length(label) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, label)
);

-- Kept separate so browser roles can never select credential material.
create table public.api_credential_secrets (
  credential_id uuid primary key references public.api_credentials(id) on delete cascade,
  secret_ref text not null,
  secret_ciphertext text,
  key_version text,
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  environment text not null default 'production' check (environment in ('development', 'staging', 'production', 'other')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, project_id, slug, environment)
);

create table public.provider_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  provider_model text not null,
  display_name text not null,
  capabilities jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  unique (provider_id, provider_model)
);

create table public.model_pricing_versions (
  id uuid primary key default gen_random_uuid(),
  provider_model_id uuid not null references public.provider_models(id) on delete cascade,
  effective_from timestamptz not null,
  effective_to timestamptz,
  currency text not null default 'USD' check (char_length(currency) = 3),
  input_cost_per_million numeric(20, 8) not null default 0 check (input_cost_per_million >= 0),
  output_cost_per_million numeric(20, 8) not null default 0 check (output_cost_per_million >= 0),
  cached_input_cost_per_million numeric(20, 8) check (cached_input_cost_per_million >= 0),
  reasoning_cost_per_million numeric(20, 8) check (reasoning_cost_per_million >= 0),
  source text not null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  provider_id uuid not null references public.ai_providers(id) on delete restrict,
  credential_id uuid references public.api_credentials(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  model text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  cost numeric(20, 8) not null default 0 check (cost >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  cost_status text not null default 'estimated' check (cost_status in ('actual', 'estimated', 'unknown')),
  provider_request_id text,
  idempotency_key text not null,
  ingestion_source text not null check (ingestion_source in ('provider_poll', 'sdk', 'gateway', 'manual')),
  request_status text not null default 'succeeded' check (request_status in ('succeeded', 'failed', 'cancelled', 'unknown')),
  error_code text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  environment text not null default 'production' check (environment in ('development', 'staging', 'production', 'other')),
  occurred_at timestamptz not null default now(),
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, ingestion_source, idempotency_key)
);

create table public.ingestion_checkpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  credential_id uuid not null references public.api_credentials(id) on delete cascade,
  cursor text,
  window_start timestamptz,
  window_end timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider_id, credential_id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  provider_id uuid references public.ai_providers(id) on delete cascade,
  scope_type text not null default 'workspace' check (scope_type in ('workspace', 'project', 'provider')),
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(20, 8) not null check (amount > 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  alert_threshold numeric(5, 4) not null default 0.8 check (alert_threshold between 0 and 1),
  created_at timestamptz not null default now(),
  check (period_end > period_start)
  ,check ((scope_type = 'workspace' and project_id is null and provider_id is null)
    or (scope_type = 'project' and project_id is not null and provider_id is null)
    or (scope_type = 'provider' and project_id is null and provider_id is not null))
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  budget_id uuid references public.budgets(id) on delete set null,
  usage_event_id uuid references public.usage_events(id) on delete set null,
  kind text not null check (kind in ('budget', 'anomaly', 'waste')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_members_user_idx on public.workspace_members(user_id);
create index usage_events_workspace_time_idx on public.usage_events(workspace_id, occurred_at desc);
create index usage_events_provider_idx on public.usage_events(workspace_id, provider_id);
create index usage_events_model_idx on public.usage_events(workspace_id, model);
create index usage_events_project_idx on public.usage_events(workspace_id, project_id);
create index usage_events_application_idx on public.usage_events(workspace_id, application_id);
create index usage_events_workspace_model_time_idx on public.usage_events(workspace_id, model, occurred_at desc);
create index usage_events_provider_request_idx on public.usage_events(workspace_id, provider_request_id);
create index budgets_workspace_period_idx on public.budgets(workspace_id, period_start, period_end);
create index alerts_workspace_created_idx on public.alerts(workspace_id, created_at desc);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid());
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
      and role in ('owner', 'admin'));
$$;

create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.add_workspace_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger workspace_owner_after_insert
after insert on public.workspaces
for each row execute function public.add_workspace_owner();

create or replace function public.validate_workspace_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'applications' and not exists (
    select 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id
  ) then
    raise exception 'project does not belong to workspace';
  end if;
  if tg_table_name = 'usage_events' then
    if new.project_id is not null and not exists (
      select 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id
    ) then raise exception 'project does not belong to workspace'; end if;
    if new.application_id is not null and not exists (
      select 1 from public.applications where id = new.application_id and workspace_id = new.workspace_id
    ) then raise exception 'application does not belong to workspace'; end if;
    if new.credential_id is not null and not exists (
      select 1 from public.api_credentials where id = new.credential_id and workspace_id = new.workspace_id
    ) then raise exception 'credential does not belong to workspace'; end if;
  end if;
  if tg_table_name = 'budgets' and new.project_id is not null and not exists (
    select 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id
  ) then raise exception 'project does not belong to workspace'; end if;
  return new;
end;
$$;

create trigger applications_workspace_links before insert or update on public.applications
for each row execute function public.validate_workspace_links();
create trigger usage_events_workspace_links before insert or update on public.usage_events
for each row execute function public.validate_workspace_links();
create trigger budgets_workspace_links before insert or update on public.budgets
for each row execute function public.validate_workspace_links();

create or replace function public.prevent_last_owner_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') and not exists (
    select 1 from public.workspace_members
    where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id
  ) then
    raise exception 'a workspace must retain at least one owner';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger workspace_members_owner_guard before update or delete on public.workspace_members
for each row execute function public.prevent_last_owner_removal();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.ai_providers enable row level security;
alter table public.api_credentials enable row level security;
alter table public.api_credential_secrets enable row level security;
alter table public.projects enable row level security;
alter table public.applications enable row level security;
alter table public.provider_models enable row level security;
alter table public.model_pricing_versions enable row level security;
alter table public.usage_events enable row level security;
alter table public.budgets enable row level security;
alter table public.alerts enable row level security;

create policy "members can view workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "users can create workspaces" on public.workspaces for insert with check (created_by = auth.uid());
create policy "admins can update workspaces" on public.workspaces for update using (public.is_workspace_admin(id));
create policy "members can view membership" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "admins can add non-owner membership" on public.workspace_members for insert
  with check (public.is_workspace_admin(workspace_id)
    and (role in ('member', 'viewer') or public.is_workspace_owner(workspace_id)));
create policy "admins can update non-owner membership" on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id)
    and (role in ('member', 'viewer') or public.is_workspace_owner(workspace_id)));
create policy "admins can remove membership" on public.workspace_members for delete using (public.is_workspace_admin(workspace_id));
create policy "workspace creators can add themselves" on public.workspace_members for insert with check (user_id = auth.uid() and exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid()));
create policy "authenticated users can view providers" on public.ai_providers for select to authenticated using (enabled);
create policy "authenticated users can view enabled models" on public.provider_models for select to authenticated using (enabled);
create policy "authenticated users can view model pricing" on public.model_pricing_versions for select to authenticated using (true);
create policy "members can view credential metadata" on public.api_credentials for select using (public.is_workspace_member(workspace_id));
create policy "admins can insert credential metadata" on public.api_credentials for insert with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());
create policy "admins can update credential metadata" on public.api_credentials for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "admins can delete credential metadata" on public.api_credentials for delete using (public.is_workspace_admin(workspace_id));
create policy "no browser access to credential secrets" on public.api_credential_secrets for all using (false) with check (false);
create policy "members can view projects" on public.projects for select using (public.is_workspace_member(workspace_id));
create policy "members can create projects" on public.projects for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "admins can update projects" on public.projects for update using (public.is_workspace_admin(workspace_id));
create policy "admins can delete projects" on public.projects for delete using (public.is_workspace_admin(workspace_id));
create policy "members can view applications" on public.applications for select using (public.is_workspace_member(workspace_id));
create policy "members can create applications" on public.applications for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "admins can update applications" on public.applications for update using (public.is_workspace_admin(workspace_id));
create policy "admins can delete applications" on public.applications for delete using (public.is_workspace_admin(workspace_id));
create policy "members can view usage" on public.usage_events for select using (public.is_workspace_member(workspace_id));
-- Usage is immutable and must be written by the trusted server/Edge Function.
create policy "members can view budgets" on public.budgets for select using (public.is_workspace_member(workspace_id));
create policy "admins can manage budgets" on public.budgets for all using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "members can view alerts" on public.alerts for select using (public.is_workspace_member(workspace_id));
create policy "admins can manage alerts" on public.alerts for all using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

revoke all on table public.api_credential_secrets from anon, authenticated;
revoke all on table public.ingestion_checkpoints from anon, authenticated;

create view public.usage_daily with (security_invoker = true) as
select workspace_id, date_trunc('day', occurred_at at time zone 'UTC')::date as day,
  sum(input_tokens)::bigint as input_tokens, sum(output_tokens)::bigint as output_tokens,
  sum(cached_input_tokens)::bigint as cached_input_tokens,
  sum(reasoning_tokens)::bigint as reasoning_tokens,
  sum(input_tokens + output_tokens)::bigint as total_tokens,
  sum(cost)::numeric(20, 8) as total_cost, count(*)::bigint as request_count
from public.usage_events group by workspace_id, date_trunc('day', occurred_at at time zone 'UTC')::date;

create view public.usage_cost_by_provider with (security_invoker = true) as
select u.workspace_id, p.slug as provider, p.name, sum(u.cost)::numeric(20, 8) as total_cost,
  sum(u.input_tokens + u.output_tokens)::bigint as total_tokens, count(*)::bigint as request_count
from public.usage_events u join public.ai_providers p on p.id = u.provider_id
group by u.workspace_id, p.slug, p.name;

create view public.usage_cost_by_model with (security_invoker = true) as
select workspace_id, provider_id, model, sum(cost)::numeric(20, 8) as total_cost,
  sum(input_tokens + output_tokens)::bigint as total_tokens, count(*)::bigint as request_count
from public.usage_events group by workspace_id, provider_id, model;

create view public.usage_cost_by_project with (security_invoker = true) as
select u.workspace_id, u.project_id, coalesce(p.name, 'Unassigned') as project,
  sum(u.cost)::numeric(20, 8) as total_cost,
  sum(u.input_tokens + u.output_tokens)::bigint as total_tokens, count(*)::bigint as request_count
from public.usage_events u left join public.projects p on p.id = u.project_id
group by u.workspace_id, u.project_id, p.name;

create view public.usage_cost_by_application with (security_invoker = true) as
select u.workspace_id, u.application_id, coalesce(a.name, 'Unassigned') as application,
  sum(u.cost)::numeric(20, 8) as total_cost,
  sum(u.input_tokens + u.output_tokens)::bigint as total_tokens, count(*)::bigint as request_count
from public.usage_events u left join public.applications a on a.id = u.application_id
group by u.workspace_id, u.application_id, a.name;

create view public.budget_consumption with (security_invoker = true) as
select b.id, b.workspace_id, b.scope_type, b.project_id, b.provider_id, b.name, b.amount,
  b.period_start, b.period_end, b.alert_threshold,
  coalesce(sum(u.cost), 0)::numeric(20, 8) as spent,
  greatest(b.amount - coalesce(sum(u.cost), 0), 0)::numeric(20, 8) as remaining,
  (coalesce(sum(u.cost), 0) / nullif(b.amount, 0))::numeric(12, 8) as consumed_ratio
from public.budgets b left join public.usage_events u
  on u.workspace_id = b.workspace_id
  and (b.project_id is null or u.project_id = b.project_id)
  and (b.provider_id is null or u.provider_id = b.provider_id)
  and u.occurred_at >= b.period_start and u.occurred_at < b.period_end
group by b.id, b.workspace_id, b.scope_type, b.project_id, b.provider_id, b.name,
  b.amount, b.period_start, b.period_end, b.alert_threshold;

create view public.potential_waste with (security_invoker = true) as
select id, workspace_id, project_id, provider_id, model, cost, input_tokens, output_tokens,
  occurred_at, request_metadata->>'waste_reason' as waste_reason
from public.usage_events
where request_metadata ? 'waste_reason' or (input_tokens > 100000 and cost > 0);

create view public.usage_anomalies with (security_invoker = true) as
with daily as (select * from public.usage_daily), stats as (
  select workspace_id, avg(total_cost) as mean_cost, stddev_pop(total_cost) as stddev_cost
  from daily group by workspace_id
)
select d.*, s.mean_cost, s.stddev_cost
from daily d join stats s using (workspace_id)
where s.stddev_cost > 0 and d.total_cost > s.mean_cost + (3 * s.stddev_cost);
