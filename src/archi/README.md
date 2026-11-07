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
  poll, and LLM OAuth sign-in, which needs a server callback. Web search is still the
  original's mock. Law/KDS/building search uses the public APIs in `api/_regulations.ts`
  when their keys and `OPENAI_API_KEY` are set (`web/lib/regulation-search.ts`); otherwise the mock.

## INDEX Wiki library

The library at `/agent-studio/wiki` provides Markdown reading/editing, full-text
search, `[[title|label]]` links, backlinks, a document graph, source import, revision
preview/restore, archive, generated covers, and Markdown/JSON export. It is linked
from the Studio navigation and the AI tools catalog.

`wiki/repository.ts` now connects the library to the shared knowledge server at
`/api/wiki/`. Start it with `npm run wiki:server` (Node 24) alongside Vite on 5180.
The server keeps original files, SQLite transactions/revisions, an activity journal,
durable compilation jobs and Markdown exports in `.index-knowledge/`. Existing
INDEX AI settings are reused for two-stage analysis/generation and grounded Q&A.
Generated pages require review; human edits and approvals are never silently replaced.
The old per-user Firebase/browser repository remains available as
`createLegacyWikiRepository`; existing sources can be selected in the import dialog.
Connection errors do not silently change storage. Historical data is not automatically
bulk-migrated. Firebase remains the authentication provider. Supabase is not used by
this file-based server deployment.

`npm run wiki:mercury` starts the separately pinned Mercury runtime with three
restricted INDEX MCP tools. The deterministic worker continues without a browser.
See `deploy/knowledge/README.md` for Docker deployment, backup and operational limits.

Run `npm run test:wiki` and `npm run test:knowledge` for persistence, revisions,
conflicts, job recovery, actual PDF extraction, provenance, Q&A and HTTP auth.
Representative generated cover
assets and prompt metadata live in `public/images/wiki`.

### Encyclopedia

`/agent-studio/wiki?view=encyclopedia` (also the default wiki home) presents
residential interior knowledge as a subject encyclopedia. Entries are distinct
from source summaries and operational notes through the persisted `entryType`
field (`article`, `source`, `note`). Legacy `source-*` pages remain source
summaries without rewriting their original revisions. The term index defaults
to published entries; editors can explicitly include unreviewed drafts.

The portal includes Korean initial-letter/Latin/numeric indexes, subject filters,
full-text and previous-title search, recent changes, and wanted entries derived
from unresolved wiki links. New entries use a definition/practice/related
entries/references template. Reading shows an inline table of contents, original
sources, review state and a link to immutable revision history. The existing
library and graph remain available in the same workspace. There is no anonymous
editing or public access change; existing authentication still applies.

### Knowledge graph engine

`GraphView` uses Sigma.js 4, React Sigma 6 and Graphology ForceAtlas2. Rendering,
picking, camera interaction and native node dragging belong to Sigma; initial
placement and background layout belong to Graphology. The previous custom SVG
renderer and hand-written force simulation have been removed. Reciprocal wiki
links are displayed as one undirected relationship; no sample notes are added.

The default display uses small screen-sized nodes, thin links and native Sigma
text labels. `itemSizesReference: 'screen'` is explicit to keep layout coordinates
from inflating node radii. Label font family and label pixel size are specified
separately. ForceAtlas2 runs in its library worker and is stopped after settling;
the worker and WebGL resources are destroyed when leaving the view. Tests cover
real ForceAtlas2 layouts, orphan filters, duplicate/reverse/missing links and
search/neighbor focus. Website authentication is unchanged.
