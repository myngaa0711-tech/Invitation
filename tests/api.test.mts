import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { app } from "../server/src/app.ts";
import { apiGet, apiPost, ApiError } from "../client/src/lib/api.ts";

test("API routes and input errors do not require a database", async (t) => {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(() => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));

  await t.test("health and invitation configuration", async () => {
    assert.equal((await (await fetch(base + "/api/health")).json()).ok, true);
    const config = await (await fetch(base + "/api/config")).json();
    assert.equal(typeof config.question, "string");
    assert.equal("adminKey" in config, false);
  });
  await t.test("dashboard data rejects missing and incorrect admin keys", async () => {
    for (const route of ["responses", "visits", "stats"]) {
      for (const headers of [{}, { "x-admin-key": "invalid-test-key" }]) {
        assert.equal((await fetch(`${base}/api/${route}`, { headers })).status, 401);
      }
    }
  });
  await t.test("invalid answers, malformed JSON, oversized bodies, and unknown routes", async () => {
    for (const [body, expected] of [[JSON.stringify({ answer: "maybe" }), 400], ["{broken", 400], [JSON.stringify({ message: "a".repeat(17000) }), 413]] as const) {
      const response = await fetch(base + "/api/response", { method: "POST", headers: { "content-type": "application/json" }, body });
      assert.equal(response.status, expected);
      assert.equal(typeof (await response.json()).error, "string");
    }
    const response = await fetch(base + "/api/missing");
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type")!, /application\/json/);
  });
});

test("frontend API reports missing backend and preserves authorization errors", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("<html>SPA fallback</html>", { headers: { "content-type": "text/html" } });
  await assert.rejects(apiGet("/config"), (err) => err instanceof ApiError && err.status === 502);
  await assert.rejects(apiPost("/response", {}), (err) => err instanceof ApiError && err.status === 502);
  globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });
  await assert.rejects(apiGet("/stats", { admin: true }), (err) => err instanceof ApiError && err.status === 401);
  globalThis.fetch = async () => Response.json({ ok: true });
  assert.deepEqual(await apiGet("/health"), { ok: true });
});
