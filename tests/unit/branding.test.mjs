import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../..", import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), "utf8")
}

test("user-facing branding uses TokenLens and the approved messaging", async () => {
  const files = await Promise.all([
    source("app/layout.tsx"),
    source("components/landing/header.tsx"),
    source("components/landing/hero.tsx"),
    source("components/landing/footer.tsx"),
    source("components/auth/auth-form.tsx"),
    source("app/dashboard/page.tsx"),
    source("README.md"),
  ])
  const combined = files.join("\n")

  assert.match(combined, /TokenLens/)
  assert.match(combined, /See your AI usage\. Understand your spend\./)
  assert.match(
    combined,
    /Track AI usage, monitor costs, and understand spending across your connected providers\./
  )
  assert.doesNotMatch(combined, /Clarity AI/)
})

test("credential configuration identifiers remain compatible", async () => {
  const [crypto, docs] = await Promise.all([
    source("lib/providers/crypto.ts"),
    source("README.md"),
  ])
  const combined = `${crypto}\n${docs}`
  assert.match(combined, /CLARITY_CREDENTIAL_MASTER_KEY/)
  assert.match(combined, /CLARITY_CREDENTIAL_KEY_VERSION/)
})
