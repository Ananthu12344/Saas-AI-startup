begin;
select plan(25);

-- All fixtures and attack effects are rolled back, including failing assertions.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000101', 'membership-owner@clarity.test'),
 ('00000000-0000-0000-0000-000000000102', 'membership-admin@clarity.test'),
 ('00000000-0000-0000-0000-000000000103', 'membership-member@clarity.test'),
 ('00000000-0000-0000-0000-000000000104', 'membership-outsider@clarity.test'),
 ('00000000-0000-0000-0000-000000000105', 'membership-second-owner@clarity.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select lives_ok($$insert into public.workspaces(id,name,slug,created_by) values
 ('10000000-0000-0000-0000-000000000101','Membership A','membership-test-a','00000000-0000-0000-0000-000000000101')$$,
 'authenticated user creates workspace without RETURNING');
select results_eq($$select role from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid()$$,array['owner'::text], 'trigger assigns creator ownership');
select throws_ok($$insert into public.workspaces(name,slug,created_by) values ('Forged','membership-test-forged','00000000-0000-0000-0000-000000000104')$$,'42501',null,'cannot forge workspace creator');
select lives_ok($$insert into public.workspace_members(workspace_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','admin'),
 ('10000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000103','member')$$,'owner assigns admin and member');
select throws_ok($$delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid()$$,'P0001','a workspace must retain at least one owner','last owner cannot be deleted');
select throws_ok($$update public.workspace_members set role='member' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid()$$,'P0001','a workspace must retain at least one owner','last owner cannot be demoted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}', true);
select results_eq($$with changed as (update public.workspace_members set role='owner' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid() returning user_id) select count(*)::int from changed$$,array[0],'member cannot promote themselves');
select throws_ok($$insert into public.workspace_members(workspace_id,user_id,role) values ('10000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000104','member')$$,'42501',null,'member cannot invite users');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000104","role":"authenticated"}', true);
select results_eq($$select count(*)::int from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101'$$,array[0],'outsider cannot read membership');
select throws_ok($$insert into public.workspace_members(workspace_id,user_id,role) values ('10000000-0000-0000-0000-000000000101',auth.uid(),'owner')$$,'42501',null,'outsider cannot self-assign owner');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select lives_ok($$insert into public.workspace_members(workspace_id,user_id,role) values ('10000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000104','viewer')$$,'admin can add viewer');
select throws_ok($$update public.workspace_members set role='owner' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid()$$,'42501',null,'admin cannot promote themselves to owner');
select throws_ok($$update public.workspace_members set role='admin' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000103'$$,'42501',null,'admin cannot grant admin role');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select lives_ok($$insert into public.workspace_members(workspace_id,user_id,role) values ('10000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000105','owner')$$,'owner can add another owner');

-- Adversarial: administrators must not control existing owner memberships.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select results_eq($$with changed as (update public.workspace_members set role='member' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105' returning user_id) select count(*)::int from changed$$,array[0],'admin cannot demote an existing owner');
-- Restore fixture after any unexpected successful attack, preserving test isolation.
reset role;
update public.workspace_members set role='owner' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select results_eq($$with changed as (delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105' returning user_id) select count(*)::int from changed$$,array[0],'admin cannot delete an existing owner');

-- Move the sole owner row without changing its role. The destination caller
-- owns another workspace, so RLS checks there must not mask source corruption.
reset role;
delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
insert into public.workspaces(id,name,slug,created_by) values ('10000000-0000-0000-0000-000000000102','Membership B','membership-test-b',auth.uid());
select throws_ok($$update public.workspace_members set workspace_id='10000000-0000-0000-0000-000000000102', user_id='00000000-0000-0000-0000-000000000105' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid()$$, 'P0001',null,'membership identity cannot move and leave source ownerless');
-- The automatic owner trigger makes creator self-insertion unnecessary.
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values ('10000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000102','admin');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
update public.workspaces set created_by=auth.uid() where id='10000000-0000-0000-0000-000000000102';
select throws_ok($$with removed as (
 delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000102' and user_id=auth.uid() returning workspace_id,user_id
) insert into public.workspace_members(workspace_id,user_id,role) select workspace_id,user_id,'owner' from removed$$,
'42501',null,'creator policy cannot bypass owner assignment rules in a replacement statement');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select throws_ok($$update public.workspace_members set user_id='00000000-0000-0000-0000-000000000105' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id=auth.uid()$$,'P0001','membership identity cannot be changed','owner identity cannot be reassigned');
select throws_ok($$update public.workspace_members set workspace_id='10000000-0000-0000-0000-000000000102' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000103'$$,'P0001','membership identity cannot be changed','ordinary member identity cannot move either');
insert into public.workspace_members(workspace_id,user_id,role) values ('10000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000105','owner');
select lives_ok($$update public.workspace_members set role='member' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105'$$,'owner can demote another owner while retaining ownership');
update public.workspace_members set role='owner' where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105';
select throws_ok($$delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and role='owner'$$,'P0001',null,'bulk owner removal cannot leave an ownerless workspace');
select lives_ok($$delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000105'$$,'owner can remove another owner');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select results_eq($$with changed as (delete from public.workspace_members where workspace_id='10000000-0000-0000-0000-000000000101' and user_id='00000000-0000-0000-0000-000000000103' returning user_id) select count(*)::int from changed$$,array[1],'admin can still remove ordinary members');
reset role;
select lives_ok($$delete from public.workspaces where id='10000000-0000-0000-0000-000000000102'$$,'trusted workspace deletion still cascades memberships');
select * from finish();
rollback;
