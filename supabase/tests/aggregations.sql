begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aggregate@example.test', '', '', '', '', '')
on conflict (id) do nothing;

insert into public.workspaces (id, name, slug, created_by)
values ('10000000-0000-0000-0000-000000000011', 'Aggregate Workspace', 'aggregate-workspace', '00000000-0000-0000-0000-000000000011')
on conflict (id) do nothing;

insert into public.projects (id, workspace_id, name, slug, created_by)
values ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'Aggregate Project', 'aggregate-project', '00000000-0000-0000-0000-000000000011')
on conflict (id) do nothing;

insert into public.usage_events
  (workspace_id, project_id, provider_id, model, input_tokens, output_tokens, cost,
   currency, cost_status, idempotency_key, ingestion_source, occurred_at)
values
  ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011',
   (select id from public.ai_providers where slug = 'openai'), 'model-a', 100, 25, 1.25,
   'USD', 'actual', 'aggregate-1', 'manual', '2026-02-01T10:00:00Z'),
  ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011',
   (select id from public.ai_providers where slug = 'openai'), 'model-a', 200, 50, 2.50,
   'USD', 'actual', 'aggregate-2', 'manual', '2026-02-01T11:00:00Z'),
  ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011',
   (select id from public.ai_providers where slug = 'openai'), 'model-b', 50, 10, 0.75,
   'USD', 'actual', 'aggregate-3', 'manual', '2026-02-02T10:00:00Z');

select results_eq(
  $$select count(*)::int from public.usage_daily where workspace_id = '10000000-0000-0000-0000-000000000011'$$,
  array[2],
  'daily usage has one row per UTC day'
);

select results_eq(
  $$select total_cost::numeric from public.usage_cost_by_model where workspace_id = '10000000-0000-0000-0000-000000000011' and model = 'model-a'$$,
  array[3.75::numeric],
  'model aggregation sums cost'
);

select results_eq(
  $$select total_tokens::bigint from public.usage_cost_by_project where workspace_id = '10000000-0000-0000-0000-000000000011'$$,
  array[435::bigint],
  'project aggregation sums input and output tokens'
);

select results_eq(
  $$select total_cost::numeric from public.usage_cost_by_provider where workspace_id = '10000000-0000-0000-0000-000000000011' and provider = 'openai'$$,
  array[4.50::numeric],
  'provider aggregation sums cost'
);

select results_eq(
  $$select total_cost::numeric from public.usage_daily where workspace_id = '10000000-0000-0000-0000-000000000011' and day = '2026-02-01'$$,
  array[3.75::numeric],
  'daily aggregation preserves UTC date boundaries'
);

select throws_ok(
  $$insert into public.usage_events
    (workspace_id, project_id, provider_id, model, input_tokens, output_tokens, cost,
     currency, cost_status, idempotency_key, ingestion_source, occurred_at)
    values ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011',
      (select id from public.ai_providers where slug = 'openai'), 'model-a', 100, 25, 1.25,
      'USD', 'actual', 'aggregate-1', 'manual', '2026-02-01T10:00:00Z')$$,
  '23505',
  null,
  'duplicate ingestion keys are rejected'
);

select * from finish();
rollback;
