-- Deterministic, local-only fixtures for dashboard development.
-- These rows are loaded by `supabase db reset` and contain no credentials.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-a@clarity.test', '', now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-b@clarity.test', '', now()),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-c@clarity.test', '', now())
on conflict (id) do nothing;

insert into public.workspaces (id, name, slug, created_by)
values
  ('10000000-0000-0000-0000-0000000000a1', 'Acme AI', 'acme-ai', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000b1', 'Beta Labs', 'beta-labs', '00000000-0000-0000-0000-0000000000c1')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'member')
on conflict (workspace_id, user_id) do nothing;

insert into public.projects (id, workspace_id, name, slug, created_by)
values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Customer Support', 'customer-support', '00000000-0000-0000-0000-0000000000a1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', 'Content Generator', 'content-generator', '00000000-0000-0000-0000-0000000000a1'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'Beta Assistant', 'beta-assistant', '00000000-0000-0000-0000-0000000000c1')
on conflict (id) do nothing;

insert into public.applications (id, workspace_id, project_id, name, slug, environment, created_by)
values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'Support Bot', 'support-bot', 'production', '00000000-0000-0000-0000-0000000000a1'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', 'Marketing Generator', 'marketing-generator', 'development', '00000000-0000-0000-0000-0000000000a1'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'Beta Assistant', 'beta-assistant', 'development', '00000000-0000-0000-0000-0000000000c1')
on conflict (id) do nothing;

insert into public.budgets (id, workspace_id, scope_type, name, amount, period_start, period_end, alert_threshold)
values
  ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'workspace', 'September AI budget', 30, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 0.8),
  ('50000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'workspace', 'September AI budget', 20, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 0.8)
on conflict (id) do nothing;

insert into public.usage_events (
  id, workspace_id, project_id, application_id, provider_id, user_id, model,
  input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, cost,
  currency, cost_status, provider_request_id, idempotency_key, ingestion_source,
  request_status, latency_ms, environment, occurred_at, request_metadata
)
select
  ('60000000-0000-0000-0000-' || lpad((100 + n)::text, 12, '0'))::uuid,
  '10000000-0000-0000-0000-0000000000a1',
  case when n % 2 = 0 then '20000000-0000-0000-0000-0000000000a1'::uuid else '20000000-0000-0000-0000-0000000000a2'::uuid end,
  case when n % 2 = 0 then '30000000-0000-0000-0000-0000000000a1'::uuid else '30000000-0000-0000-0000-0000000000a2'::uuid end,
  p.id,
  '00000000-0000-0000-0000-0000000000a1',
  case when n % 3 = 0 then 'gpt-4o-mini' else 'gpt-4o' end,
  case when n = 13 then 180000 else 3200 + n * 80 end,
  case when n = 13 then 42000 else 1100 + n * 40 end,
  case when n = 4 then 900 else 0 end,
  case when n = 13 then 9000 else 0 end,
  case when n = 13 then 18.00 else round((0.45 + (n * 0.03))::numeric, 2) end,
  'USD', 'actual', 'seed-openai-' || n, 'seed-openai-' || n, 'manual', 'succeeded',
  180 + n * 7, 'development', ('2026-09-' || lpad(n::text, 2, '0') || 'T12:00:00Z')::timestamptz,
  case when n = 13 then '{"waste_reason":"Large prompt and reasoning-token spike"}'::jsonb else '{}'::jsonb end
from generate_series(1, 13) as g(n)
cross join lateral (select id from public.ai_providers where slug = 'openai') p
on conflict (id) do nothing;

insert into public.usage_events (
  id, workspace_id, project_id, application_id, provider_id, user_id, model,
  input_tokens, output_tokens, cost, currency, cost_status, provider_request_id,
  idempotency_key, ingestion_source, request_status, latency_ms, environment,
  occurred_at, request_metadata
)
select
  '60000000-0000-0000-0000-000000000401'::uuid,
  '10000000-0000-0000-0000-0000000000a1',
  '20000000-0000-0000-0000-0000000000a1',
  '30000000-0000-0000-0000-0000000000a1',
  p.id, '00000000-0000-0000-0000-0000000000a1', 'gpt-4o-mini',
  8000, 2400, 1.15, 'USD', 'actual', 'seed-openai-today', 'seed-openai-today',
  'manual', 'succeeded', 190, 'development', '2026-09-17T09:30:00Z', '{}'
from (select id from public.ai_providers where slug = 'openai') p
on conflict (id) do nothing;

insert into public.usage_events (
  id, workspace_id, project_id, application_id, provider_id, user_id, model,
  input_tokens, output_tokens, cost, currency, cost_status, provider_request_id,
  idempotency_key, ingestion_source, request_status, latency_ms, environment,
  occurred_at, request_metadata
)
select
  '60000000-0000-0000-0000-000000000201'::uuid,
  '10000000-0000-0000-0000-0000000000a1',
  '20000000-0000-0000-0000-0000000000a1',
  '30000000-0000-0000-0000-0000000000a1',
  p.id, '00000000-0000-0000-0000-0000000000b1', 'claude-3-5-sonnet',
  15000, 6000, 3.75, 'USD', 'actual', 'seed-anthropic-1', 'seed-anthropic-1',
  'manual', 'succeeded', 420, 'development', '2026-09-08T14:00:00Z', '{}'
from (select id from public.ai_providers where slug = 'anthropic') p
on conflict (id) do nothing;

insert into public.usage_events (
  id, workspace_id, project_id, application_id, provider_id, user_id, model,
  input_tokens, output_tokens, cost, currency, cost_status, provider_request_id,
  idempotency_key, ingestion_source, request_status, latency_ms, environment,
  occurred_at, request_metadata
)
select
  '60000000-0000-0000-0000-000000000301'::uuid,
  '10000000-0000-0000-0000-0000000000b1',
  '20000000-0000-0000-0000-0000000000b1',
  '30000000-0000-0000-0000-0000000000b1',
  p.id, '00000000-0000-0000-0000-0000000000c1', 'gpt-4o-mini',
  6000, 2200, 0.85, 'USD', 'actual', 'seed-beta-1', 'seed-beta-1',
  'manual', 'succeeded', 210, 'development', '2026-09-10T09:00:00Z', '{}'
from (select id from public.ai_providers where slug = 'openai') p
on conflict (id) do nothing;
