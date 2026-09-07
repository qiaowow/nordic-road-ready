import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { makeOfflineManifest } from "./scripts/offline-manifest.mjs";
export default defineConfig({
    root: "github-pages", base: "/nordic-road-ready/", publicDir: "../public",
    plugins: [react(), { name: "complete-offline-pack", closeBundle: async () => { await makeOfflineManifest("pages-dist"); } }],
    build: { outDir: "../pages-dist", emptyOutDir: true }
});
