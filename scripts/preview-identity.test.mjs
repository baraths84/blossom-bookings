import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

test("the live preview identifies only its canonical checkout and rejects writes", async (t) => {
  const server = await createServer({
    server: { strictPort: false, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    logLevel: "error",
  });
  t.after(() => server.close());
  await server.listen();
  const url = new URL(".well-known/blossom-workspace.json", server.resolvedUrls.local[0]);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const checkout = await realpath(".");
  assert.deepEqual(await response.json(), { checkoutId: createHash("sha256").update(checkout).digest("hex") });
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  assert.equal(await (await fetch(url, { method: "HEAD" })).text(), "");
});
