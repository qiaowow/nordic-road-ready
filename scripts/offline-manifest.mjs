import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export async function makeOfflineManifest(root) {
    const entries = [];
    async function visit(dir) {
        for (const e of await readdir(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory())
                await visit(p);
            else {
                const name = path.relative(root, p).replaceAll("\\", "/");
                if (["sw.js", "offline-manifest.json"].includes(name) || name.endsWith(".map"))
                    continue;
                const bytes = await readFile(p);
                entries.push({ path: name === "index.html" ? "./" : name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
            }
        }
    }
    await visit(root);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    const totalBytes = entries.reduce((n, x) => n + x.bytes, 0);
    if (totalBytes > 100 * 1024 * 1024)
        throw new Error("Offline pack exceeds 100 MiB");
    const manifest = { version: createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 16), builtAt: new Date().toISOString(), totalBytes, entries };
    await writeFile(path.join(root, "offline-manifest.json"), JSON.stringify(manifest));
    return manifest;
}
