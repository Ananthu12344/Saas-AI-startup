import assert from "node:assert/strict"
import test from "node:test"
import {
  AnthropicUsageParseError,
  createAnthropicAdapter,
  parseAnthropicMessagesPage,
} from "../../lib/providers/anthropic-usage.ts"

const window = {
  start: "2026-09-17T00:00:00Z",
  end: "2026-09-18T00:00:00Z",
}

const payload = {
  data: [
    {
      starting_at: "2026-09-17T00:00:00Z",
      ending_at: "2026-09-18T00:00:00Z",
      results: [
        {
          uncached_input_tokens: 1500,
          cache_creation: { ephemeral_1h_input_tokens: 1000 },
          cache_read_input_tokens: 200,
          output_tokens: 500,
          api_key_id: "apikey_test",
          workspace_id: "wrkspc_test",
          model: "claude-sonnet-4-20250514",
          service_tier: "standard",
          context_window: "0-200k",
        },
      ],
    },
  ],
  has_more: true,
  next_page: "page-next",
}

test("parses Anthropic messages usage and preserves cache metadata", () => {
  const page = parseAnthropicMessagesPage(payload, window)
  assert.equal(page.nextCursor, "page-next")
  assert.deepEqual(page.records[0], {
    model: "claude-sonnet-4-20250514",
    occurredAt: "2026-09-17T00:00:00.000Z",
    inputTokens: 1500,
    outputTokens: 500,
    cachedInputTokens: 200,
    metadata: {
      apiKeyId: "apikey_test",
      workspaceId: "wrkspc_test",
      serviceTier: "standard",
      contextWindow: "0-200k",
      cacheCreation: { ephemeral_1h_input_tokens: 1000 },
      serverToolUse: null,
    },
  })
})

test("fails closed for missing usage and model fields", () => {
  const empty = parseAnthropicMessagesPage({ ...payload, data: [] }, window)
  assert.equal(empty.records.length, 0)
  assert.throws(
    () =>
      parseAnthropicMessagesPage(
        {
          ...payload,
          data: [{ ...payload.data[0], results: [{ ...payload.data[0].results[0], model: null }] }],
        },
        window
      ),
    /missing model/
  )
  assert.throws(
    () =>
      parseAnthropicMessagesPage(
        {
          ...payload,
          data: [{ ...payload.data[0], results: [{ ...payload.data[0].results[0], output_tokens: undefined }] }],
        },
        window
      ),
    /output_tokens/
  )
})

test("wires Anthropic endpoint, headers, repeated group_by, and API failures", async () => {
  let request
  const adapter = createAnthropicAdapter({
    apiKey: "mock-key",
    validateCredential: async () => undefined,
    baseUrl: "https://api.anthropic.test/v1/",
    fetchImpl: async (input, init) => {
      request = { input: String(input), init }
      return new Response(JSON.stringify(payload), { status: 200 })
    },
  })
  await adapter.fetchUsage({ ...window, cursor: "cursor-test" })
  assert.match(request.input, /\/v1\/organizations\/usage_report\/messages\?/) 
  assert.match(request.input, /group_by%5B%5D=model/)
  assert.match(request.input, /page=cursor-test/)
  assert.equal(request.init.headers["x-api-key"], "mock-key")
  assert.equal(request.init.headers["anthropic-version"], "2023-06-01")

  const failure = createAnthropicAdapter({
    apiKey: "mock-key",
    validateCredential: async () => undefined,
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  })
  await assert.rejects(failure.fetchUsage(window), /HTTP 401/)
})
