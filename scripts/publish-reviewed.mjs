// Publishes only reviewed working-tree text changes, preserving remote history.
// Usage: node scripts/publish-reviewed.mjs <expected remote master SHA> [--publish]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repo = "qiaowow/nordic-road-ready";
const expected = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(expected || "")) throw new Error("Expected remote master SHA is required");
const run = (bin, args, input) => execFileSync(bin, args, { encoding: "utf8", input, maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
const api = (path, data, method = "POST") => JSON.parse(run("gh", ["api", `repos/${repo}/${path}`, ...(data ? ["--method", method, "--input", "-"] : [])], data ? JSON.stringify(data) : undefined));
const names = [...new Set((run("git", ["diff", "--name-only", "HEAD"]) + run("git", ["ls-files", "--others", "--exclude-standard"])).split(/\r?\n/).filter(Boolean))];
const allowed = /^(?:app\/|data\/|github-pages\/|src\/|scripts\/|tests\/|public\/sw\.js$|\.github\/workflows\/deploy-pages\.yml$|README\.md$|package(?:-lock)?\.json$|vite\.pages\.config\.ts$)/;
if (!names.length || names.some(p => !allowed.test(p))) throw new Error("Unexpected publish scope: " + names.filter(p => !allowed.test(p)).join(", "));
const files = names.map(path => {
  const content = readFileSync(path, "utf8");
  if (content.includes("\0")) throw new Error("Binary file requires explicit handling: " + path);
  return { path, mode: "100644", type: "blob", content };
});
const head = api("git/ref/heads/master").object.sha;
if (head !== expected) throw new Error(`Remote moved to ${head}; review before publishing`);
console.log(JSON.stringify({ repo, parent: head, files: names }, null, 2));
if (!process.argv.includes("--publish")) process.exit(0);
const base = api(`git/commits/${head}`);
const tree = api("git/trees", { base_tree: base.tree.sha, tree: files });
const commit = api("git/commits", { message: "Improve trustworthy learning, curriculum, review and verified offline readiness", tree: tree.sha, parents: [head] });
if (api("git/ref/heads/master").object.sha !== head) throw new Error("Remote moved during upload; no ref was changed");
api("git/refs/heads/master", { sha: commit.sha, force: false }, "PATCH");
console.log(`PUBLISHED_COMMIT=${commit.sha}`);
