import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
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
          if (req.url?.startsWith("/api/youtube-transcript")) {
            try {
              const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const videoId = urlObj.searchParams.get("v");

              if (!videoId) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Valid video ID required (param: v)" }));
                return;
              }

              const apiPath = path.resolve(__dirname, "./api/youtube-transcript.js");
              const { default: handler } = await import(apiPath);

              const mockReq = {
                method: req.method,
                query: { v: videoId },
              };

              const mockRes = {
                statusCode: 200,
                headers: {},
                status(code) {
                  this.statusCode = code;
                  return this;
                },
                setHeader(name, val) {
                  this.headers[name] = val;
                  return this;
                },
                json(data) {
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
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Firebase SDK (large)
          "vendor-firebase": [
            "firebase/app",
            "firebase/auth",
            "firebase/firestore",
            "firebase/storage",
            "firebase/analytics",
          ],
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
          // Flow diagram library
          "vendor-flow": ["@xyflow/react"],
          // Markdown renderer
          "vendor-markdown": ["react-markdown"],
        },
      },
    },
    // Warn at 600 KB since we have intentional chunking
    chunkSizeWarningLimit: 600,
  },
}));
