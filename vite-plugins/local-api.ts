import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv, type Plugin } from "vite";

/**
 * Dev only: serve the Vercel functions in api/*.ts from the Vite dev server, so
 * `npm run dev` can exercise /api/chat etc. without `vercel dev`. Server-side env
 * (OPENAI_API_KEY, CHAT_LLM_BASE_URL, LAW_OC, ...) is read from .env / .env.local.
 * Implements the small part of VercelRequest/VercelResponse the handlers use.
 */
export function localApi(): Plugin {
  return {
    name: "index-local-api",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      // All keys, including VITE_FIREBASE_PROJECT_ID (token verification falls back to it).
      for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
        if (!match) return next();
        let mod: { default?: (req: unknown, res: unknown) => unknown };
        try {
          mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
        } catch {
          return next();
        }
        if (typeof mod.default !== "function") return next();

        const chunks: Buffer[] = [];
        try {
          for await (const chunk of req) chunks.push(chunk as Buffer);
        } catch {
          return; // the browser cancelled mid-request; nothing to answer, and it must not kill the dev server
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: unknown = raw;
        if ((req.headers["content-type"] ?? "").includes("application/json") && raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
        }
        const vreq = Object.assign(req, { body, query: Object.fromEntries(url.searchParams) });
        const vres = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return vres;
          },
          json(data: unknown) {
            if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify(data));
            return vres;
          },
          send(data: unknown) {
            res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
            return vres;
          },
        });
        try {
          await mod.default(vreq, vres);
        } catch (error) {
          server.config.logger.error(`[local-api] /api/${match[1]}: ${error instanceof Error ? error.stack : String(error)}`);
          if (!res.headersSent) vres.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
