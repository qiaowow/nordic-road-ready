import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
function harness() {
    const scope = "https://example.test/nordic-road-ready/", handlers = {}, stores = new Map(), network = new Map();
    const url = x => new URL(x, scope).href;
    const caches = { async keys() { return [...stores.keys()]; }, async delete(k) { return stores.delete(k); }, async open(k) { if (!stores.has(k))
            stores.set(k, new Map()); const map = stores.get(k); return { async match(key) { return map.get(typeof key === "string" ? key : key.url)?.clone(); }, async put(key, r) { map.set(typeof key === "string" ? key : key.url, r.clone()); } }; } };
    vm.runInNewContext(source, { self: { registration: { scope }, location: { origin: "https://example.test" }, clients: { claim: async () => { } }, skipWaiting: async () => { }, addEventListener: (n, fn) => handlers[n] = fn }, caches, crypto: webcrypto, URL, Response, Uint8Array, fetch: async (u) => { const r = network.get(String(u)); if (!r)
            throw Error("offline"); return r.clone(); }, console });
    function pack(version, suffix = "") { const entries = [["./", "home" + suffix], ["assets/app.js", "js" + suffix], ["assets/app.css", "css" + suffix]].map(([path, body]) => { network.set(url(path), new Response(body)); return { path, bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") }; }); network.set(url("offline-manifest.json"), new Response(JSON.stringify({ version, totalBytes: entries.reduce((n, e) => n + e.bytes, 0), entries }))); return entries; }
    async function call(type) { let out; await new Promise(resolve => handlers.message({ data: { type }, ports: [{ postMessage: x => { if (x.done)
                    out = x; } }], waitUntil: p => p.then(resolve) })); return out; }
    async function fetchPage(path = "./") { let promise; handlers.fetch({ request: { method: "GET", url: url(path), mode: path === "./" ? "navigate" : "cors" }, respondWith: p => promise = p }); return promise; }
    return { caches, network, pack, call, fetchPage, stores, url };
}
test("complete pack cold-starts HTML, JS and CSS with network unavailable; sibling caches survive", async () => {
    const h = harness();
    await (await h.caches.open("toeic-study-v5")).put("https://example.test/toeic/", new Response("keep"));
    h.pack("1111111111111111");
    assert.equal((await h.call("DOWNLOAD")).result.ready, true);
    h.network.clear();
    assert.equal(await (await h.fetchPage()).text(), "home");
    assert.equal(await (await h.fetchPage("assets/app.js")).text(), "js");
    assert.equal((await h.call("VERIFY")).result.ready, true);
    assert.ok(h.stores.has("toeic-study-v5"));
});
test("corrupt update does not replace previous complete pack; retry can recover", async () => {
    const h = harness();
    h.pack("1111111111111111");
    await h.call("DOWNLOAD");
    h.pack("2222222222222222", "new");
    h.network.set(h.url("assets/app.js"), new Response("corrupt"));
    assert.match((await h.call("DOWNLOAD")).error, /校验失败/);
    assert.equal(await (await h.fetchPage()).text(), "home");
    h.pack("2222222222222222", "new");
    assert.equal((await h.call("DOWNLOAD")).result.ready, true);
    h.network.clear();
    assert.equal(await (await h.fetchPage("assets/app.js")).text(), "jsnew");
});
test("evicted resources revoke ready status; HTTP errors cannot poison cached navigation", async () => {
    const h = harness();
    h.pack("1111111111111111");
    await h.call("DOWNLOAD");
    h.network.set(h.url("./"), new Response("error", { status: 500 }));
    assert.equal(await (await h.fetchPage()).text(), "home");
    for (const [k, m] of h.stores)
        if (k.includes("pack:"))
            m.delete(h.url("assets/app.js"));
    assert.equal((await h.call("VERIFY")).result.ready, false);
});
test("manifest cannot point to a sibling app or omit startup scripts", async () => {
    const h = harness();
    h.pack("1111111111111111");
    const m = await h.network.get(h.url("offline-manifest.json")).json();
    m.entries[0].path = "../toeic/";
    h.network.set(h.url("offline-manifest.json"), new Response(JSON.stringify(m)));
    assert.match((await h.call("DOWNLOAD")).error, /路径/);
});
