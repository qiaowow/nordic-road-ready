import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(new URL(pathname, "https://nordic-road-ready.test"), {
      headers: { accept: "text/html", host: "nordic-road-ready.test", "x-forwarded-proto": "https" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Chinese Nordic road-learning product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html[^>]+lang="zh-CN"/i);
  assert.match(html, /北境自驾课/);
  assert.match(html, /本次行程优先课/);
  assert.match(html, /2026/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("emits app-specific social and PWA metadata", async () => {
  const html = await (await render()).text();
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /https:\/\/nordic-road-ready\.test\/og\.png/);
  assert.match(html, /summary_large_image/);
  await Promise.all([
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/icon-192.png", import.meta.url)),
    access(new URL("../public/icon-512.png", import.meta.url)),
    access(new URL("../public/sw.js", import.meta.url)),
  ]);
});

test("keeps the offline implementation and starter cleanup explicit", async () => {
  const [serviceWorker, packageJson, layout] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(serviceWorker, /CACHE_VERSION/);
  assert.match(serviceWorker, /caches\.match/);
  assert.match(layout, /PwaBootstrap/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
