begin;

select plan(10);

-- Test fixtures are created as the database owner, then requests are evaluated
-- as authenticated users through the same JWT claims Supabase sets in Postgres.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@example.test', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@example.test', '', '', '', '', '')
on conflict (id) do nothing;

insert into public.workspaces (id, name, slug, created_by)
values
  ('10000000-0000-0000-0000-000000000001', 'Workspace A', 'workspace-a', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Workspace B', 'workspace-b', '00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.projects (id, workspace_id, name, slug, created_by)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Project A', 'project-a', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Project B', 'project-b', '00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::int from public.workspaces$$,
  array[1],
  'a member can only read their own workspace'
);

select results_eq(
  $$select count(*)::int from public.projects$$,
  array[1],
  'a member can only read projects in their workspace'
);

select throws_ok(
  $$insert into public.projects (workspace_id, name, slug, created_by)
    values ('10000000-0000-0000-0000-000000000002', 'Cross tenant', 'cross-tenant', '00000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'a member cannot create a project in another workspace'
);

select throws_ok(
  $$insert into public.usage_events
    (workspace_id, project_id, provider_id, model, idempotency_key, ingestion_source)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      (select id from public.ai_providers where slug = 'openai'), 'test-model', 'member-write', 'manual')$$,
  '42501',
  null,
  'ordinary members cannot fabricate usage events'
);

select throws_ok(
  $$select count(*)::int from public.api_credential_secrets$$,
  '42501',
  null,
  'authenticated clients cannot read credential secrets'
);

select throws_ok(
  $$insert into public.usage_events
    (workspace_id, project_id, provider_id, model, idempotency_key, ingestion_source)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
      (select id from public.ai_providers where slug = 'openai'), 'test-model', 'cross-project', 'provider_poll')$$,
  'P0001',
  'project does not belong to workspace',
  'workspace link validation blocks cross-tenant usage attribution'
);

select results_eq(
  $$select count(*)::int from public.usage_daily$$,
  array[0],
  'a member cannot see usage before trusted ingestion'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

insert into public.usage_events
  (workspace_id, project_id, provider_id, model, input_tokens, output_tokens, cost,
   currency, cost_status, idempotency_key, ingestion_source, occurred_at)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   (select id from public.ai_providers where slug = 'openai'), 'test-model', 100, 25, 0.50,
   'USD', 'actual', 'trusted-usage-1', 'manual', '2026-01-01T12:00:00Z');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$select total_tokens::bigint from public.usage_daily where workspace_id = '10000000-0000-0000-0000-000000000001'$$,
  array[125::bigint],
  'trusted usage is visible through the daily aggregate'
);

select results_eq(
  $$select total_cost::numeric from public.usage_cost_by_project where workspace_id = '10000000-0000-0000-0000-000000000001'$$,
  array[0.50::numeric],
  'project aggregation preserves cost'
);

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'owner')$$,
  '42501',
  null,
  'an authenticated member cannot grant cross-tenant ownership'
);

select * from finish();
rollback;
