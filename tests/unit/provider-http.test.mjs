import assert from "node:assert/strict"
import test from "node:test"
import {
  createJsonFetcher,
  ProviderTransportError,
} from "../../lib/providers/http.ts"

test("constructs an authenticated same-origin JSON request", async () => {
  let request
  const fetcher = createJsonFetcher(
    "https://api.example.test/v1/",
    "secret-key",
    async (input, init) => {
      request = { input: String(input), init }
      return new Response('{"ok":true}', { status: 200 })
    }
  )
  assert.deepEqual(
    await fetcher("usage", { start_time: 10, cursor: undefined }),
    { ok: true }
  )
  assert.equal(request.input, "https://api.example.test/v1/usage?start_time=10")
  assert.equal(request.init.headers.Authorization, "Bearer secret-key")
  assert.equal(request.init.headers.Accept, "application/json")
})

test("rejects insecure production endpoints and missing credentials", () => {
  assert.throws(() => createJsonFetcher("http://api.example.test", "key"), {
    message: "Provider base URL must use HTTPS",
  })
  assert.throws(() => createJsonFetcher("https://api.example.test", ""), {
    message: "Provider API key is required",
  })
})

test("prevents cross-origin paths", async () => {
  const fetcher = createJsonFetcher("https://api.example.test/v1", "key")
  await assert.rejects(fetcher("https://evil.example.test/steal"), {
    message: "Provider request escaped the configured origin",
  })
})

test("preserves a base path when the URL omits a trailing slash", async () => {
  let requested
  const fetcher = createJsonFetcher(
    "https://api.example.test/v1",
    "key",
    async (input) => {
      requested = String(input)
      return new Response("{}", { status: 200 })
    }
  )
  await fetcher("usage")
  assert.equal(requested, "https://api.example.test/v1/usage")
})

test("normalizes network, HTTP, and JSON failures without exposing secrets", async () => {
  const network = createJsonFetcher(
    "https://api.example.test",
    "secret",
    async () => {
      throw new Error("secret")
    }
  )
  await assert.rejects(network("usage"), (error) => {
    assert.ok(error instanceof ProviderTransportError)
    assert.equal(error.status, 0)
    assert.doesNotMatch(error.message, /secret/)
    return true
  })

  const http = createJsonFetcher(
    "https://api.example.test",
    "secret",
    async () => new Response("{}", { status: 429 })
  )
  await assert.rejects(http("usage"), {
    message: "Provider request returned HTTP 429",
  })

  const invalid = createJsonFetcher(
    "https://api.example.test",
    "secret",
    async () => new Response("not-json", { status: 200 })
  )
  await assert.rejects(invalid("usage"), {
    message: "Provider returned invalid JSON",
  })
})

test("converts a stalled provider request into a timeout", async () => {
  const fetcher = createJsonFetcher(
    "https://api.example.test",
    "secret",
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          {
            once: true,
          }
        )
      }),
    5
  )
  await assert.rejects(fetcher("usage"), {
    message: "Provider request timed out",
  })
})
