import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
test("GitHub Pages build contains every manifest dependency with exact bytes", async () => {
    const root = new URL("../pages-dist/", import.meta.url);
    const m = JSON.parse(await readFile(new URL("offline-manifest.json", root), "utf8"));
    assert.ok(m.totalBytes < 100 * 1048576);
    assert.ok(m.entries.some(e => e.path.endsWith(".js")));
    assert.ok(m.entries.some(e => e.path.endsWith(".css")));
    for (const e of m.entries) {
        const data = await readFile(new URL(e.path === "./" ? "index.html" : e.path, root));
        assert.equal(data.length, e.bytes, e.path);
        assert.equal(createHash("sha256").update(data).digest("hex"), e.sha256, e.path);
    }
    const html = await readFile(new URL("index.html", root), "utf8");
    assert.match(html, /lang="zh-CN"/);
    assert.match(html, /\/nordic-road-ready\/assets\/index-/);
    await stat(new URL("sw.js", root));
});
