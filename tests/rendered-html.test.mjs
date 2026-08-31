import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the HeatAhead v2.3 customer workflow", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>HeatAhead — Data Center Weather Intelligence<\/title>/i);
  assert.match(html, /Proactive thermal decision support/);
  assert.match(html, /Facility name/);
  assert.match(html, /Core square width/);
  assert.match(html, /Paste coordinate pair/);
  assert.match(html, /ESIF-equivalent load state · 45–105%/);
  assert.match(html, /Exact load state/);
  assert.match(html, /Best-supported choices/);
  assert.match(html, /Observed · 171 h/);
  assert.match(html, /HeatAhead Exposure/);
  assert.match(html, /Weather-driven cooling increment/);
  assert.match(html, /Facility analysis history/);
  assert.match(html, /What every input changes/);
  assert.match(html, /retained for up to 90 days/);
  assert.match(html, /corrected center tile/);
  assert.match(html, /Enter a valid U\.S\. location/);
  assert.match(html, /ESIF internal model/);
  assert.match(html, /Frontier operational check/);
  assert.match(html, /Seven U.S. target sites/);
  assert.match(html, /Thermal events compress the operator/);
  assert.match(html, /Responsible framing/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("does not expose the server-side FortyGuard credential", async () => {
  const response = await render();
  const html = await response.text();

  assert.doesNotMatch(html, /FORTYGUARD_API_KEY/);
  assert.doesNotMatch(html, /api-key["']?\s*[:=]\s*["'][a-f0-9]{24,}/i);
});
