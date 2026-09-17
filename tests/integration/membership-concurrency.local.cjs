// Local Colima only. Uses psql inside the existing disposable database container.
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn, execFileSync } = require("node:child_process")
const { randomUUID } = require("node:crypto")
const assert = require("node:assert/strict")
const env = {
  ...process.env,
  DOCKER_HOST: `unix://${process.env.HOME}/.colima/default/docker.sock`,
}
const args = [
  "exec",
  "-i",
  "supabase_db_Saas-AI-startup",
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
]
const sql = (input) =>
  execFileSync("docker", args, {
    env,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim()
function connection() {
  const child = spawn("docker", args, { env, stdio: ["pipe", "pipe", "pipe"] })
  let output = "",
    errors = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    errors += chunk
  })
  const ended = new Promise((resolve) =>
    child.once("close", (code) => resolve({ code, errors }))
  )
  return { child, ended, read: () => output }
}
async function until(fn) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (await fn()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw Error("Local concurrency synchronization timed out")
}
;(async () => {
  for (const isolation of ["READ COMMITTED", "REPEATABLE READ"]) {
    for (const operation of ["delete", "demote"]) {
      const ownerA = randomUUID(),
        ownerB = randomUUID(),
        workspace = randomUUID()
      const tag = "clarity-race-" + randomUUID()
      let first, second
      try {
        sql(`begin; insert into auth.users(id,email) values ('${ownerA}','${ownerA}@clarity.test'),('${ownerB}','${ownerB}@clarity.test');
      insert into public.workspaces(id,name,slug,created_by) values ('${workspace}','Concurrency fixture','race-${workspace}','${ownerA}');
      insert into public.workspace_members(workspace_id,user_id,role) values ('${workspace}','${ownerB}','owner'); commit;`)
        const mutation = (user) =>
          operation === "delete"
            ? `delete from public.workspace_members where workspace_id='${workspace}' and user_id='${user}';`
            : `update public.workspace_members set role='member' where workspace_id='${workspace}' and user_id='${user}';`
        const begin = (user) =>
          `begin isolation level ${isolation}; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);`
        first = connection()
        first.child.stdin.write(
          begin(ownerA) + mutation(ownerA) + "select 'FIRST_READY';\n"
        )
        await until(() => first.read().includes("FIRST_READY"))
        second = connection()
        second.child.stdin.end(
          `set application_name='${tag}';` +
            begin(ownerB) +
            mutation(ownerB) +
            "commit;\n"
        )
        // Verify actual lock contention before committing the first transaction.
        await until(
          () =>
            sql(
              `select count(*) from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock';`
            ) === "1"
        )
        first.child.stdin.end("commit;\n")
        assert.equal((await first.ended).code, 0)
        const blocked = await second.ended
        assert.notEqual(blocked.code, 0)
        assert.match(
          blocked.errors,
          isolation === "READ COMMITTED"
            ? /must retain at least one owner/
            : /could not serialize access/
        )
        assert.equal(
          sql(
            `select count(*) from public.workspace_members where workspace_id='${workspace}' and role='owner';`
          ),
          "1"
        )
        console.log(
          `PASS concurrent ${operation}: ${isolation} retains one owner`
        )
      } finally {
        for (const conn of [first, second])
          if (conn && conn.child.exitCode === null) {
            conn.child.stdin.end("rollback;\n")
            await conn.ended
          }
        sql(
          `begin; delete from public.workspaces where id='${workspace}'; delete from auth.users where id in ('${ownerA}','${ownerB}'); commit;`
        )
      }
    }
  }
  console.log("Concurrency fixtures removed")
})().catch(() => {
  console.error(
    "FAIL local concurrency validation (sensitive diagnostics suppressed)"
  )
  process.exitCode = 1
})
