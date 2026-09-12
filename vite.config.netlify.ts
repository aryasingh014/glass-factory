import { defineConfig } from "vite";
import path from "node:path";

// Netlify serverless function build configuration
// Bundles the Express server + serverless-http adapter into a single ESM file
// that Netlify Functions can execute without path alias or TypeScript issues.
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "netlify/functions/api.ts"),
      name: "api",
      fileName: "api",
      formats: ["es"],
    },
    outDir: "netlify/functions-dist",
    target: "node18",
    ssr: true,
    rollupOptions: {
      external: [
        // Node.js built-ins
        "fs",
        "path",
        "url",
        "http",
        "https",
        "os",
        "crypto",
        "stream",
        "util",
        "events",
        "buffer",
        "querystring",
        "child_process",
        "net",
        "tls",
        "zlib",
        "node:fs",
        "node:path",
        "node:url",
        "node:http",
        "node:https",
        "node:os",
        "node:crypto",
        "node:stream",
        "node:util",
        "node:events",
        "node:buffer",
        "node:querystring",
        "node:child_process",
        "node:net",
        "node:tls",
        "node:zlib",
      ],
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
