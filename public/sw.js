/* Complete, content-verified packs; scoped to this application, never sibling sites. */
const PREFIX = "nordic-road-ready:" + new URL(self.registration.scope).pathname + ":";
const META = PREFIX + "metadata";
const marker = new URL("__offline_active__", self.registration.scope).href;
const packMarker = new URL("__offline_manifest__", self.registration.scope).href;
const appUrl = path => new URL(path, self.registration.scope).href;
let downloading = false;
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
async function active() {
    const response = await (await caches.open(META)).match(marker);
    return response ? response.json() : null;
}
async function digest(buffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function valid(response, entry) {
    if (!response?.ok)
        return false;
    const bytes = await response.clone().arrayBuffer();
    return bytes.byteLength === entry.bytes && await digest(bytes) === entry.sha256;
}
function validateManifest(m) {
    if (!m || !/^[a-f0-9]{16}$/.test(m.version) || !Array.isArray(m.entries) || !m.entries.length || m.totalBytes > 100 * 1024 * 1024)
        throw Error("离线清单无效或超过 100 MiB 上限");
    const seen = new Set();
    for (const e of m.entries) {
        const u = new URL(e.path, self.registration.scope);
        if (u.origin !== self.location.origin || !u.href.startsWith(self.registration.scope) || e.path.includes("..") || seen.has(u.href) || !Number.isInteger(e.bytes) || e.bytes < 0 || !/^[a-f0-9]{64}$/.test(e.sha256))
            throw Error("离线路径或校验值无效");
        seen.add(u.href);
    }
    if (m.entries.reduce((s, e) => s + e.bytes, 0) !== m.totalBytes || !m.entries.some(e => e.path === "./") || !m.entries.some(e => e.path.endsWith(".js")) || !m.entries.some(e => e.path.endsWith(".css")))
        throw Error("离线启动依赖不完整");
}
async function download(send) {
    if (downloading)
        throw Error("已有离线下载正在进行");
    downloading = true;
    try {
        const response = await fetch(appUrl("offline-manifest.json"), { cache: "no-store" });
        if (!response.ok)
            throw Error("无法取得版本清单");
        const m = await response.json();
        validateManifest(m);
        const old = await active();
        const name = PREFIX + "pack:" + m.version;
        // Retain active and previous; discard only this app's obsolete incomplete candidates.
        for (const key of await caches.keys())
            if (key.startsWith(PREFIX + "pack:") && ![name, old?.name, old?.previous].includes(key))
                await caches.delete(key);
        const cache = await caches.open(name);
        let completed = 0;
        let cursor = 0;
        async function worker() {
            while (cursor < m.entries.length) {
                const e = m.entries[cursor++], url = appUrl(e.path);
                let r = await cache.match(url);
                if (!await valid(r, e)) {
                    // Reuse unchanged files from the last complete pack, but verify their bytes too.
                    r = old?.name ? await (await caches.open(old.name)).match(url) : undefined;
                    if (!await valid(r, e)) {
                        r = await fetch(url, { cache: "no-store" });
                        if (!await valid(r, e))
                            throw Error("文件校验失败：" + e.path);
                    }
                    await cache.put(url, r);
                }
                completed++;
                send({ progress: completed, total: m.entries.length, bytes: m.totalBytes });
            }
        }
        const workers = await Promise.allSettled(Array.from({ length: 4 }, worker));
        const failure = workers.find(x => x.status === "rejected");
        if (failure)
            throw failure.reason;
        const at = new Date().toISOString();
        await cache.put(packMarker, new Response(JSON.stringify(m)));
        const info = { name, previous: old?.name !== name ? old?.name : old?.previous, version: m.version, at, totalBytes: m.totalBytes };
        await (await caches.open(META)).put(marker, new Response(JSON.stringify(info)));
        for (const key of await caches.keys())
            if (key.startsWith(PREFIX + "pack:") && ![name, info.previous].includes(key))
                await caches.delete(key);
        return { ...info, ready: true, files: m.entries.length };
    }
    finally {
        downloading = false;
    }
}
async function verify(send) {
    const info = await active();
    if (!info)
        return { ready: false, reason: "尚未下载完整离线包" };
    const cache = await caches.open(info.name);
    const r = await cache.match(packMarker);
    if (!r)
        return { ready: false, reason: "缓存已被浏览器清除，请重新下载" };
    const m = await r.json();
    validateManifest(m);
    let count = 0;
    for (const e of m.entries) {
        if (!await valid(await cache.match(appUrl(e.path)), e))
            return { ...info, ready: false, reason: "缓存不完整：" + e.path };
        count++;
        if (count % 15 === 0)
            send({ progress: count, total: m.entries.length });
    }
    return { ...info, ready: true, files: count };
}
self.addEventListener("message", event => {
    const port = event.ports[0];
    if (!port)
        return;
    const send = message => port.postMessage(message);
    event.waitUntil((async () => {
        try {
            const result = event.data?.type === "DOWNLOAD" ? await download(send) : await verify(send);
            send({ done: true, result });
        }
        catch (e) {
            send({ done: true, error: e.message || "离线操作失败" });
        }
    })());
});
self.addEventListener("fetch", event => {
    const req = event.request, u = new URL(req.url);
    if (req.method !== "GET" || u.origin !== self.location.origin || !u.href.startsWith(self.registration.scope) || u.pathname.endsWith("/sw.js") || u.pathname.endsWith("/offline-manifest.json"))
        return;
    event.respondWith((async () => {
        const info = await active();
        if (info) {
            const cache = await caches.open(info.name);
            const key = req.mode === "navigate" ? appUrl("./") : req.url;
            const saved = await cache.match(key);
            if (saved)
                return saved;
        }
        return fetch(req);
    })());
});
