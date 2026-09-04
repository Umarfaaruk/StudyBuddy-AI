import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

/**
 * Env vars the browser bundle cannot function without. They are inlined at
 * build time, so a build that runs without them produces a permanently broken
 * artifact — redeploying is the only fix. Failing the build here turns a silent
 * white-screen deploy into a loud, obvious CI error.
 */
const REQUIRED_CLIENT_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

export default defineConfig(({ command, mode }) => {
  // Prefix "" so Vercel's injected process.env vars are picked up too, not just
  // the local .env files.
  const env = loadEnv(mode, process.cwd(), "");

  if (command === "build" && mode === "production") {
    const problems: string[] = [];

    for (const key of REQUIRED_CLIENT_ENV) {
      if (!env[key]?.trim()) problems.push(`${key} is not set`);
    }

    // Catch a key copied while the dashboard still had it masked. The mask is
    // made of real bullet characters, so the value looks present but cannot be
    // encoded into an HTTP header — every auth call then fails at fetch() with
    // "non ISO-8859-1 code point", which surfaces to users as a network error.
    // Far better to refuse the build than to ship that.
    const anon = env.VITE_SUPABASE_ANON_KEY?.trim();
    if (anon) {
      const nonAscii = [...anon].filter((c) => c.codePointAt(0)! > 127);
      if (nonAscii.length > 0) {
        const codes = [...new Set(nonAscii.map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`))];
        problems.push(
          `VITE_SUPABASE_ANON_KEY contains ${nonAscii.length} non-ASCII character(s) [${codes.join(", ")}].\n` +
            `      This is what you get by copying the key while it is still hidden.\n` +
            `      Reveal it in Supabase → Settings → API first, then copy.`
        );
      } else if (
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(anon) &&
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(anon)
      ) {
        problems.push(
          `VITE_SUPABASE_ANON_KEY is malformed — expected a JWT (three dot-separated\n` +
            `      segments) or an sb_publishable_… key.`
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `\n\n  Build aborted — environment problems:\n` +
          problems.map((p) => `    • ${p}`).join("\n") +
          `\n\n  Set them in Vercel → Project → Settings → Environment Variables\n` +
          `  (tick Production, Preview and Development), then redeploy.\n` +
          `  Locally, fix them in .env.local — see README.md.\n`
      );
    }
  }

  return {
  root: path.resolve(__dirname),
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true as const,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    {
      name: "vercel-api-middleware",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/")) {
            // Expose .env / .env.local to serverless-style API handlers in dev
            for (const [key, value] of Object.entries(env)) {
              if (value && !process.env[key]) {
                process.env[key] = value;
              }
            }

            try {
              const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const apiName = urlObj.pathname.slice(5); // Remove "/api/"

              if (!apiName) {
                next();
                return;
              }

              // Resolve to .ts or .js file in ./api/ directory
              let apiPath = path.resolve(__dirname, `./api/${apiName}.ts`);
              let exists = true;
              // Route params captured from [bracket] segments, merged into
              // req.query below so handlers read them exactly as they do on
              // Vercel.
              const routeParams: Record<string, string> = {};

              try {
                await fs.promises.access(apiPath);
              } catch {
                try {
                  apiPath = path.resolve(__dirname, `./api/${apiName}.js`);
                  await fs.promises.access(apiPath);
                } catch {
                  exists = false;
                }
              }

              // Vercel resolves ./api/foo/[type].ts for /api/foo/NEET, but this
              // middleware only ever tried the literal path — so a dynamic
              // route worked in production and 404'd locally. Fall back to a
              // bracket match so dev and prod agree.
              if (!exists) {
                const segments = apiName.split("/");
                const dir = path.resolve(__dirname, "./api", ...segments.slice(0, -1));
                const leaf = segments[segments.length - 1];
                try {
                  const candidates = await fs.promises.readdir(dir);
                  const dynamic = candidates.find((f) => /^\[[^\]]+\]\.(ts|js)$/.test(f));
                  if (dynamic) {
                    routeParams[dynamic.replace(/^\[|\]\.(ts|js)$/g, "")] = decodeURIComponent(leaf);
                    apiPath = path.resolve(dir, dynamic);
                    exists = true;
                  }
                } catch {
                  // Directory does not exist — fall through to next().
                }
              }

              if (!exists) {
                next();
                return;
              }

              // Import API handler dynamically (file:// URL required on Windows ESM, use query parameter to bypass ESM cache)
              const { default: handler } = await import(`${pathToFileURL(apiPath).href}?t=${Date.now()}`);

              // Parse search query params. Route params from [bracket]
              // segments are merged in first, matching Vercel, where both
              // arrive together on req.query.
              const query: Record<string, string> = { ...routeParams };
              urlObj.searchParams.forEach((val, key) => {
                query[key] = val;
              });

              // Read request body for POST/PUT requests
              let body: any = "";
              if (req.method === "POST" || req.method === "PUT") {
                body = await new Promise((resolve) => {
                  let data = "";
                  req.on("data", (chunk) => { data += chunk; });
                  req.on("end", () => { resolve(data); });
                });
              }

              const mockReq = {
                method: req.method,
                query,
                body,
                headers: req.headers,
              };

              const mockRes = {
                statusCode: 200,
                headers: {} as Record<string, string>,
                status(code: number) {
                  this.statusCode = code;
                  return this;
                },
                setHeader(name: string, val: string) {
                  this.headers[name] = val;
                  return this;
                },
                write(chunk: any) {
                  res.write(chunk);
                  return this;
                },
                end(data?: any) {
                  res.statusCode = this.statusCode;
                  for (const [k, v] of Object.entries(this.headers)) {
                    res.setHeader(k, v as string);
                  }
                  res.end(data);
                  return this;
                },
                json(data: unknown) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  for (const [k, v] of Object.entries(this.headers)) {
                    res.setHeader(k, v as string);
                  }
                  res.end(JSON.stringify(data));
                  return this;
                },
              };

              await handler(mockReq, mockRes);
            } catch (err) {
              console.error("Vercel API Middleware error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Internal Server Error" }));
            }
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: path.resolve(__dirname),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Supabase SDK
          "vendor-supabase": ["@supabase/supabase-js"],
          // Charting library (large)
          "vendor-recharts": ["recharts"],
          // Radix UI primitives
          "vendor-radix": [
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          // Animation libraries
          "vendor-animation": ["framer-motion", "gsap", "@gsap/react"],
          // Markdown renderer
          "vendor-markdown": ["react-markdown"],
          // PDF renderer (heavy, only used on materials page)
          "vendor-pdf": ["pdfjs-dist"],
        },
      },
    },
    // Warn at 600 KB since we have intentional chunking
    chunkSizeWarningLimit: 600,
  },
};
});
