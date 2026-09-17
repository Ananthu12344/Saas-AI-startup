// Run from the repository root: node tests/integration/dashboard.local.cjs
// Requires the disposable local Supabase stack and seed. No remote access.
/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync, spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { randomBytes } = require("node:crypto")
const { createRequire } = require("node:module")
const assert = require("node:assert/strict")
const net = require("node:net")
const root = process.cwd(),
  req = createRequire(root + "/package.json")
const { createClient } = req("@supabase/supabase-js")
const { createServerClient } = req("@supabase/ssr")
const config = JSON.parse(
  execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
    env: {
      ...process.env,
      DOCKER_HOST: `unix://${process.env.HOME}/.colima/default/docker.sock`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).toString()
)
assert.equal(new URL(config.API_URL).hostname, "127.0.0.1")
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const users = []
const fixtureEventIds = []
let server
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clarity-route-validation-"))
let fail = 0
async function check(label, fn) {
  try {
    await fn()
    console.log("PASS " + label)
  } catch (error) {
    console.log(
      "Failure category:",
      error.name,
      error.code ?? error.cause?.code ?? "unknown"
    )
    if (typeof error.actual === "number" && typeof error.expected === "number")
      console.log(
        `HTTP/assertion expected ${error.expected}, received ${error.actual}`
      )
    fail++
    console.log("FAIL " + label)
  }
}
;(async () => {
  try {
    // Refuse to send test cookies to a pre-existing process on the test port.
    await new Promise((resolve, reject) => {
      const probe = net.createServer()
      probe.once("error", reject)
      probe.listen(3017, "127.0.0.1", () => probe.close(resolve))
    })

    for (const name of [
      "app",
      "components",
      "lib",
      "hooks",
      "public",
      "package.json",
      "tsconfig.json",
      "postcss.config.mjs",
      "proxy.ts",
      "next.config.ts",
    ])
      if (fs.existsSync(path.join(root, name)))
        fs.cpSync(path.join(root, name), path.join(dir, name), {
          recursive: true,
        })
    fs.symlinkSync(
      path.join(root, "node_modules"),
      path.join(dir, "node_modules"),
      "dir"
    )
    // Isolate data/session rendering from Google font downloads and visual providers.
    fs.writeFileSync(
      path.join(dir, "app/layout.tsx"),
      "export default function Layout({children}:{children:React.ReactNode}) {return <html><body>{children}</body></html>}"
    )
    server = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/next/dist/bin/next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3017",
      ],
      {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_SUPABASE_URL: config.API_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: config.ANON_KEY,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    )
    let diagnostics = ""
    server.stdout.resume()
    server.stderr.on("data", (chunk) => {
      diagnostics += chunk.toString()
    })
    const origin = "http://127.0.0.1:3017"
    let ready = false
    for (let i = 0; i < 45; i++) {
      assert.equal(server.exitCode, null, "Test server exited before readiness")
      try {
        const response = await fetch(origin + "/login", {
          signal: AbortSignal.timeout(15000),
        })
        assert.equal(response.status, 200)
        ready = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    assert.ok(ready)
    await check("Next dashboard redirects anonymous visitor", async () => {
      const r = await fetch(origin + "/dashboard", { redirect: "manual" })
      if (r.status === 307) {
        assert.ok(r.headers.get("location").startsWith("/login"))
      } else {
        // loading.tsx can flush HTTP 200 before Next emits a streamed redirect.
        assert.equal(r.status, 200)
        const html = await r.text()
        assert.match(
          html,
          /<meta[^>]+http-equiv="refresh"[^>]+content="[^"]*\/login/
        )
        assert.ok(!html.includes("Acme AI"))
      }
    })
    for (const [label, workspace, expected, hidden] of [
      ["A", "10000000-0000-0000-0000-0000000000a1", "Acme AI", "Beta Labs"],
      ["B", "10000000-0000-0000-0000-0000000000a1", "Acme AI", "Beta Labs"],
      ["C", "10000000-0000-0000-0000-0000000000b1", "Beta Labs", "Acme AI"],
      ["D", null, null, null],
    ]) {
      const email = `route-${randomBytes(8).toString("hex")}@clarity.test`,
        password = randomBytes(24).toString("hex")
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      assert.equal(error, null)
      users.push(data.user.id)
      if (workspace)
        assert.equal(
          (
            await admin.from("workspace_members").insert({
              workspace_id: workspace,
              user_id: data.user.id,
              role: "member",
            })
          ).error,
          null
        )
      const jar = new Map()
      const client = createServerClient(config.API_URL, config.ANON_KEY, {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach(({ name, value }) => jar.set(name, value)),
        },
      })
      assert.equal(
        (await client.auth.signInWithPassword({ email, password })).error,
        null
      )
      const headers = {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      }
      if (workspace)
        await check(
          `Next authenticated ${label} renders only own workspace`,
          async () => {
            const r = await fetch(origin + "/dashboard", {
              headers,
              redirect: "manual",
            })
            assert.equal(r.status, 200)
            const html = await r.text()
            assert.ok(html.includes(expected))
            assert.ok(!html.includes(hidden))
            assert.ok(!html.includes(config.SERVICE_ROLE_KEY))
          }
        )
      else
        await check(
          "Next authenticated user without workspace gets empty state",
          async () => {
            const r = await fetch(origin + "/dashboard", {
              headers,
              redirect: "manual",
            })
            assert.equal(r.status, 200)
            assert.equal(r.headers.get("location"), null)
            const html = await r.text()
            assert.ok(html.includes("No workspace yet"))
            assert.ok(!html.includes("Acme AI"))
            assert.ok(!html.includes("Beta Labs"))
            assert.ok(!html.includes("Spend this month"))
          }
        )
      if (label === "A") {
        const { data: provider, error: providerError } = await admin
          .from("ai_providers")
          .select("id")
          .eq("slug", "openai")
          .single()
        assert.equal(providerError, null)
        const makeEvent = (id, extra = {}) => ({
          id,
          workspace_id: workspace,
          provider_id: provider.id,
          model: `validation-model-${id}`,
          ingestion_source: "manual",
          idempotency_key: id,
          input_tokens: 1,
          output_tokens: 2,
          cost: 1,
          currency: "USD",
          cost_status: "actual",
          occurred_at: "2026-08-01T12:00:00Z",
          ...extra,
        })
        const dashboardHtml = async () => {
          const response = await fetch(origin + "/dashboard", {
            headers,
            redirect: "manual",
          })
          assert.equal(response.status, 200)
          return response.text()
        }
        const clearEvents = async () => {
          if (fixtureEventIds.length) {
            for (let start = 0; start < fixtureEventIds.length; start += 100)
              assert.equal(
                (
                  await admin
                    .from("usage_events")
                    .delete()
                    .in("id", fixtureEventIds.slice(start, start + 100))
                ).error,
                null
              )
            fixtureEventIds.length = 0
          }
        }
        await check(
          "Next dashboard paginates more than 1000 model groups",
          async () => {
            const events = Array.from({ length: 1001 }, () =>
              makeEvent(require("node:crypto").randomUUID())
            )
            fixtureEventIds.push(...events.map((event) => event.id))
            for (let start = 0; start < events.length; start += 250)
              assert.equal(
                (
                  await admin
                    .from("usage_events")
                    .insert(events.slice(start, start + 250))
                ).error,
                null
              )
            const html = await dashboardHtml()
            for (const event of events) assert.ok(html.includes(event.model))
            assert.ok(html.includes("All time"))
            assert.ok(html.includes("1,031.64") || html.includes("1031.64"))
          }
        )
        await clearEvents()
        for (const [name, extra, explanation] of [
          ["mixed currencies", { currency: "EUR" }, "non-USD usage"],
          [
            "unknown costs",
            { cost_status: "unknown", cost: 0 },
            "no known cost",
          ],
        ]) {
          await check(
            `Next withholds misleading totals for ${name}`,
            async () => {
              const id = require("node:crypto").randomUUID()
              fixtureEventIds.push(id)
              assert.equal(
                (await admin.from("usage_events").insert(makeEvent(id, extra)))
                  .error,
                null
              )
              const html = await dashboardHtml()
              assert.ok(html.includes("Cost reporting unavailable"))
              assert.ok(html.includes(explanation))
              assert.ok(!html.includes("Spend this month"))
            }
          )
          await clearEvents()
        }
      }
      await client.auth.signOut()
    }
    if (fail) {
      for (const term of [
        "Module not found",
        "Cannot find module",
        "Error",
        "cookies",
        "headers",
        "fetch failed",
      ])
        if (diagnostics.includes(term))
          console.log("Server diagnostic category: " + term)
    }
  } finally {
    if (server && server.exitCode === null) {
      const stopped = new Promise((r) => server.once("exit", r))
      server.kill("SIGTERM")
      await stopped
    }
    // Remove only fixture IDs created by this run, never reset the database.
    for (let start = 0; start < fixtureEventIds.length; start += 100) {
      assert.equal(
        (
          await admin
            .from("usage_events")
            .delete()
            .in("id", fixtureEventIds.slice(start, start + 100))
        ).error,
        null
      )
    }
    for (const id of users) {
      assert.equal(
        (await admin.from("workspace_members").delete().eq("user_id", id))
          .error,
        null
      )
      assert.equal((await admin.auth.admin.deleteUser(id)).error, null)
    }
    fs.rmSync(dir, { recursive: true, force: true })
    console.log("Temporary app and user fixtures removed")
  }
  process.exitCode = fail ? 1 : 0
})().catch(() => {
  console.log("FAIL setup or cleanup; sensitive details suppressed")
  process.exitCode = 1
})
