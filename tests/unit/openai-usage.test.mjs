import assert from "node:assert/strict"
import test from "node:test"
import {
  createOpenAIAdapter,
  OpenAIUsageParseError,
  parseOpenAICompletionsPage,
} from "../../lib/providers/openai-usage.ts"

const window = {
  start: "2026-09-17T00:00:00Z",
  end: "2026-09-18T00:00:00Z",
}

const payload = {
  object: "page",
  data: [
    {
      object: "bucket",
      start_time: 1_758_096_000,
      end_time: 1_758_182_400,
      results: [
        {
          object: "organization.usage.completions.result",
          input_tokens: 1000,
          output_tokens: 500,
          input_cached_tokens: 800,
          num_model_requests: 5,
          project_id: "proj_test",
          user_id: null,
          api_key_id: "key_test",
          model: "gpt-4o-mini",
          batch: false,
          service_tier: "default",
        },
      ],
    },
  ],
  has_more: true,
  next_page: "page-next",
}

test("parses documented bucketed completions usage", () => {
  const page = parseOpenAICompletionsPage(payload, window)
  assert.equal(page.nextCursor, "page-next")
  assert.equal(page.records.length, 1)
  assert.deepEqual(page.records[0], {
    model: "gpt-4o-mini",
    occurredAt: "2025-09-17T08:00:00.000Z",
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 800,
    metadata: {
      projectId: "proj_test",
      userId: null,
      apiKeyId: "key_test",
      batch: false,
      serviceTier: "default",
      requestCount: 5,
      cachedInputReported: true,
    },
  })
})

test("fails closed for missing usage fields and ungrouped models", () => {
  assert.throws(
    () =>
      parseOpenAICompletionsPage(
        {
          ...payload,
          data: [{ ...payload.data[0], results: [{ model: null }] }],
        },
        window
      ),
    OpenAIUsageParseError
  )
  assert.throws(
    () =>
      parseOpenAICompletionsPage(
        {
          ...payload,
          data: [
            {
              ...payload.data[0],
              results: [
                { ...payload.data[0].results[0], input_tokens: undefined },
              ],
            },
          ],
        },
        window
      ),
    /input_tokens/
  )
})

test("does not silently discard unsupported non-zero token dimensions", () => {
  assert.throws(
    () =>
      parseOpenAICompletionsPage(
        {
          ...payload,
          data: [
            {
              ...payload.data[0],
              results: [
                { ...payload.data[0].results[0], input_cache_write_tokens: 4 },
              ],
            },
          ],
        },
        window
      ),
    /Unsupported non-zero usage field: input_cache_write_tokens/
  )
})

test("wires the documented endpoint and query through the secure transport", async () => {
  let request
  const adapter = createOpenAIAdapter({
    apiKey: "mock-key",
    validateCredential: async () => undefined,
    baseUrl: "https://api.openai.test/v1/",
    fetchImpl: async (input, init) => {
      request = { input: String(input), init }
      return new Response(JSON.stringify(payload), { status: 200 })
    },
  })
  await adapter.validateCredential()
  await adapter.fetchUsage({ ...window, cursor: "cursor-test" })
  assert.match(request.input, /\/v1\/organization\/usage\/completions\?/)
  assert.match(request.input, /group_by=model/)
  assert.match(request.input, /page=cursor-test/)
  assert.equal(request.init.headers.Authorization, "Bearer mock-key")
})

test("propagates API and credential failures without exposing secrets", async () => {
  const apiFailure = createOpenAIAdapter({
    apiKey: "mock-key",
    validateCredential: async () => undefined,
    baseUrl: "https://api.openai.test/v1/",
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  })
  await assert.rejects(apiFailure.fetchUsage(window), /HTTP 401/)

  const credentialFailure = createOpenAIAdapter({
    apiKey: "mock-key",
    validateCredential: async () => {
      throw new Error("credential unavailable")
    },
    baseUrl: "https://api.openai.test/v1/",
    fetchImpl: async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
  })
  await assert.rejects(credentialFailure.validateCredential(), {
    message: "credential unavailable",
  })
})
