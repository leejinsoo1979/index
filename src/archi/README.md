# ARCHI Agent Studio (ported)

The Agent Studio at `/agent-studio` is a port of
[leejinsoo1979/inshow_agent](https://github.com/leejinsoo1979/inshow_agent)
(Next.js + Prisma/Postgres) onto this app's Vite + Firebase + Vercel stack.
The original code is kept as close to verbatim as possible. The pieces that
needed a server are replaced at the seams below instead of rewriting the app.

| Original | Here |
|---|---|
| `packages/*` | `packages/*` (same code; imported as `@archi/<name>` via Vite/TS aliases) |
| `apps/web/app/studio/**/page.tsx` | `web/pages/Studio*.tsx`, mounted by `StudioApp.tsx` |
| `apps/web/components`, `lib` | `web/components`, `web/lib` |
| `app/api/**/route.ts` (Next route handlers) | Same files under `web/app/api`. They run **in the browser**: `web/lib/client/router.ts` matches `/api/...` URLs and calls the handler with a standard `Request`. The UI's `apiFetch` goes through it. |
| Prisma Client + Postgres | `db/client.ts`: a Prisma-compatible client (the subset the services use) over in-memory tables generated from `db/schema.prisma`. Data is persisted per user to Firestore `archiStudio/{uid}/{Model}/{id}`, or to localStorage without Firebase. |
| Local `.storage` directory | Firebase Storage `archi-studio/{uid}/...` (`web/lib/storage.ts`) |
| Auth.js / dev-login cookie | The signed-in index (Firebase) user, mapped to a studio `User` with the original `devLogin` (`web/lib/auth.ts`) |
| Server-side LLM/image calls with keys encrypted in the DB | `api/archi-llm.ts` (Vercel function). It encrypts keys (`ARCHI_KEY_SECRET`) and runs the original provider adapters server-side. The browser only stores ciphertext (`web/lib/proxy-providers.ts`). |
| `next/*` | Small shims in `shims/` |

## Operating notes

- **Rules:** deploy `firestore.rules` and `storage.rules` (they include the
  `archiStudio` / `archi-studio` paths): `firebase deploy --only firestore:rules,storage`.
- **AI:** with no key registered in Studio settings, the agent uses the server's
  `OPENAI_API_KEY` (`ARCHI_OPENAI_MODEL`, default `gpt-5.4-mini`). If the function
  can't be reached (e.g. plain `vite` dev without `vercel dev`), it falls back to the
  original's mock provider.
- **Schema changes:** edit `db/schema.prisma`, then run `npm run archi:schema`.
- **Not ported:** the desktop *companion* worker, which needs a server the device can
  poll, and LLM OAuth sign-in, which needs a server callback. Web/law search is the
  original's mock search provider, as in the original.
