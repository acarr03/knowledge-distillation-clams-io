# Shadow capture — backend handoff

This is the **one production change** for Phase 2 shadow testing. It is additive,
fire-and-forget, and wrapped in `try/catch` — Claude's request/response path is
byte-for-byte unchanged, and if capture fails (or the distillation DB is
unreachable) the user sees nothing.

The change lives in the **backend repo** (`clams-io-app`), which is separate from
the `@acarr03/distillation` pipeline repo. The pipeline side (schema, the
`captureShadowAsync` function, dashboard, offline runner) is already implemented
and exported; this doc is the copy-paste for the backend.

## Prerequisites

1. **Run the migration once** against Railway (and local dev) Postgres:

   ```bash
   psql "$DISTILLATION_DATABASE_URL" -f sql/004-shadow-captures.sql
   ```

   (`sql/004-shadow-captures.sql` lives in the pipeline repo. Like the existing
   migrations it is applied out-of-band — `.npmignore` keeps `sql/` out of the
   npm/git package.)

2. **Publish a new version, then bump it in the backend.** This pipeline ships as the
   published package **`@acarr03/distillation`** on GitHub Packages — no longer a
   `github:#sha` git dependency. After adding `src/shadow.js`:

   ```bash
   npm version patch    # bump version
   # then publish: cut a GitHub Release, or Actions -> "Publish @acarr03/distillation" -> Run workflow
   ```

   Then in the backend's `package.json` bump the range (if you crossed a boundary) and
   `npm install` so `captureShadowAsync` / `extractClaudeText` are available:

   ```json
   "@acarr03/distillation": "^0.1.0"
   ```

   Confirm with:

   ```bash
   node -e "console.log(Object.keys(require('@acarr03/distillation')))"
   # → should include captureShadowAsync, extractClaudeText, anthropicToOllamaMessages
   ```

   (The backend pulls the private package via a `GITHUB_TOKEN` with `read:packages`,
   already configured on Railway and in CI. Two `.npmrc` copies route the `@acarr03`
   scope to GitHub Packages — `clams-io-app/.npmrc` for CI and `clams-io-app/backend/.npmrc`
   for Railway.)

## The code change

File: `clams-io-app/backend/src/services/materialAgent/nodes/basicResponse.js`

Add the import near the top (alongside the existing `@acarr03/distillation` /
`logInteractionAsync` import if present):

```js
const { captureShadowAsync, extractClaudeText } = require('@acarr03/distillation');
```

Immediately **after** the primary generation call
`this.anthropic.messages.create(firstCallOptions)` (~line 1475), where both
`firstCallOptions` and `response` are in scope, add:

```js
// Shadow capture — fire-and-forget, never awaited, swallows its own errors.
// Captures the exact request Claude received + the response for offline replay
// against the local model. Does NOT alter the response returned to the user.
try {
  captureShadowAsync({
    node: 'basicResponse',
    model: firstCallOptions.model,
    system: firstCallOptions.system ?? null,
    messages: firstCallOptions.messages,
    tools: firstCallOptions.tools ?? null,
    thinkingEnabled: !!firstCallOptions.thinking,
    claudeResponse: extractClaudeText(response),
    stopReason: response.stop_reason ?? null,
    tokensIn: response.usage?.input_tokens ?? null,
    tokensOut: response.usage?.output_tokens ?? null,
    latencyMs: null, // optional: pass a measured duration if you time the call
    conversationId: state.sessionId ?? null,
    orgId: state.orgId ?? null,
    orgName: state.orgName ?? null,
    userId: state.userId ?? null,
    userEmail: state.userEmail ?? null,
  });
} catch (_) {
  // captureShadowAsync never throws, but keep the guard belt-and-suspenders.
}
```

Notes:

- **Do not `await`** the call and **do not** assign it into the response path.
  It must not add latency or change control flow.
- `firstCallOptions` is the object already passed to `messages.create()` — it *is*
  the "documents + plan + tools" we want to capture verbatim. Pass its fields
  straight through; `captureShadowAsync` serializes `messages`/`tools` to JSONB.
- Adjust the `state.*` field names to match the actual node state (the plan
  identified `sessionId`, `orgId`, `orgName`, `userId`, `userEmail`). Capture at
  the **node** (not a shared client wrapper) because the agent is a singleton
  reused across concurrent requests, and `state` is the per-request context.
- If you want real Claude latency, wrap the `messages.create` call with a
  `performance.now()` start/end and pass the delta as `latencyMs`.

## Scope of v1

- Captures the **primary generation call only**. The post-tool "second call" and
  the `extendedThinking` node are a documented fast-follow (add the same
  `captureShadowAsync({...})` block at those call sites with a distinct `node`
  value, e.g. `'basicResponse.second'` / `'extendedThinking'`).
- Replay drops tool definitions and `tool_use` / `tool_result` blocks (text
  only). Tool-call fidelity in replay is a fast-follow.

## Verifying end-to-end

1. Deploy the backend with the change. Send one real chat in the live app.
2. Confirm a new `shadow_captures` row appears with `request_messages`,
   `request_tools`, and `claude_response` populated, and correct
   `conversation_id` / `org_id` / `user_email`.
3. In the dashboard **Shadow** view, open the capture → **Run local model** →
   the local answer streams in beside Claude's; the row gains `local_response`
   and `status='replayed'`.
4. Batch alternative: `node evaluation/shadow-runner.js` replays any `captured`
   rows.
5. Confirm live chat latency/behavior is unchanged and no error surfaces even if
   the distillation DB is unreachable.
