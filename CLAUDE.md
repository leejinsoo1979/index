# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

INDEX — 한국실내건축가협회(KIAA) interior-construction info service. Vite + React 19 SPA (react-router v6) deployed on Vercel, with Firebase (Auth, Firestore, Storage) as the backend and a few Vercel serverless functions in `api/`. UI copy is Korean.

## Commands

- `npm run dev` — Vite dev server on :5173. Only the SPA runs; `api/*` functions are **not** served (use `vercel dev` to exercise them). Firebase web config comes from `.env.development`.
- `npm run build` — `tsc -b && vite build`. This is the only type check; there is no lint script and no test suite. Note `tsconfig.json` includes only `src` and `vite.config.ts`, so `api/*.ts` is not type-checked by this.
- `npm run archi:schema` — regenerate `src/archi/db/schema.generated.ts` after editing `src/archi/db/schema.prisma`.
- `firebase deploy --only firestore:rules,storage` — deploy `firestore.rules` / `storage.rules` (needed whenever new Firestore/Storage paths are used).

Env vars are listed in `.env.example` (`VITE_FIREBASE_*` for the client; `OPENAI_API_KEY`, `MEM0_API_KEY`, `ARCHI_KEY_SECRET`, `ADMIN_EMAILS`, provider keys for the functions).

## Architecture

### Two apps in one bundle

1. **The INDEX site** (`src/pages`, `src/components`, `src/data`, `src/lib`). `src/App.tsx` defines routes. Any path that appears in `src/data/navigation.ts` (primary nav, footer, legal links) but is not in the `implemented` set in `App.tsx` automatically renders `Placeholder` — when adding a real page for such a path, add it to `implemented` too. `src/components/Layout.tsx` decides which routes render "bare" (no Header/Footer): `/mypage`, `/signup`, `/ai`, `/admin/*`, `/agent-studio/*`.
2. **ARCHI Agent Studio** (`src/archi`, mounted at `/agent-studio/*`, lazy-loaded via `StudioApp.tsx`). A near-verbatim port of a Next.js + Prisma app. Read `src/archi/README.md` before touching it. Key seams:
   - `@archi/<pkg>` and `@archi-web` aliases (in both `vite.config.ts` and `tsconfig.json`) point at `src/archi/packages/*` and `src/archi/web`. `next/*` imports resolve to shims in `src/archi/shims/`. Original `/studio` paths are remapped to `/agent-studio` by `shims/studio-paths.ts`.
   - Next.js route handlers under `src/archi/web/app/api/**/route.ts` run **in the browser**: `web/lib/client/router.ts` globs them and dispatches `/api/...` requests from `apiFetch`. They are not Vercel functions.
   - `@archi/db` is an in-memory Prisma-compatible client (`db/client.ts`) generated from `schema.prisma`, persisted to Firestore `archiStudio/{uid}/{Model}/{id}` (records stored as JSON strings) or to localStorage when Firebase isn't configured.
   - Only secrets live server-side: `api/archi-llm.ts` encrypts workspace API keys with `ARCHI_KEY_SECRET` and runs the original provider adapters (it imports directly from `src/archi/packages`). Without the function (plain `vite`), the studio falls back to a mock provider.

Prefer keeping ported ARCHI code close to the original and adapting at these seams rather than rewriting it.

### Data and auth

- `src/lib/firebase.ts` initializes Firebase only when the `VITE_FIREBASE_*` vars are present and exports `isFirebaseConfigured`. Features are written to work both ways: with Firebase, data is in Firestore/Storage; without it, a localStorage fallback is used (see `src/lib/seminars.ts`, `StudioApp.tsx`). Preserve this dual path when adding data features.
- `src/auth/AuthContext.tsx` wraps Firebase Auth (Google + email/password); `useAuth()` exposes `user`, `loading`, `configured`.
- Admin access: client-side via `ADMIN_EMAILS` in `src/lib/adminStore.ts` (gates `/admin` and `/agent-studio`; when Firebase is unconfigured everyone is allowed for local demo). Server-side via `api/_firebaseAdmin.ts` `requireAgentAdmin`, which verifies the Firebase ID token with `jose` against `ADMIN_EMAILS` env. Firestore/Storage rules enforce access independently — update `firestore.rules`/`storage.rules` alongside any new collection or path.
- Seminars (`src/lib/seminars.ts`): Firestore `seminars/{id}` with realtime listeners; applications at `seminarApplications/{seminarId}__{uid}`, with the seat counter updated in the same transaction (the rules require that pairing). Payments are not wired yet (`paymentStatus: "UNPAID"`).
- `src/lib/adminStore.ts` holds other admin data (posts, members) in localStorage, seeded from `src/data`.

### Serverless functions (`api/`)

Vercel Node functions (`@vercel/node` handler signature). Files prefixed `_` are shared modules, not endpoints. Relative imports use `.js` extensions. `api/chat.ts` streams OpenAI responses via AI SDK with Mem0 memory (`api/_mem0.ts`, `api/memories.ts`).

Regulation lookups: `api/_regulations.ts` holds clients for 법제처 법령/해석례 (law.go.kr DRF), 건축물대장·건축인허가·토지이용규제 (data.go.kr), 도로명주소 (juso), and KDS/KCS (kcsc.re.kr), each enabled by its env key (`LAW_OC`, `DATA_GO_KR_SERVICE_KEY`, `JUSO_API_KEY`, `KCSC_API_KEY`). `api/_regulationTools.ts` wraps them as AI SDK tools used by `api/chat.ts`, and as a one-shot source search behind the `regulation-search` action of `api/archi-llm.ts`, which the Agent Studio's `getSearchProvider()` (`src/archi/web/lib/regulation-search.ts`) uses instead of the mock search when the server reports `regulationSearch`. Several of these APIs answer only in XML with undocumented field names, so responses go through the generic reader in `api/_xml.ts` (`records`, `pick`) rather than fixed paths.

Also exposed as tools: 국세청 사업자등록 상태조회/진위확인 (`api.odcloud.kr`, same `DATA_GO_KR_SERVICE_KEY`) and 건설업 등록(면허) search. The KISCON API (`ConAdminInfoSvc1`: `GongsiReg`/`GongsiAdmi`/`GongsiCess`) has no lookup by name or 사업자번호, only 공시 by date window, so `api/_kiscon.ts` replays notices in date order into Firestore `kisconContractors/{사업자번호}` via the Admin SDK (`api/_firebaseServer.ts`, `FIREBASE_SERVICE_ACCOUNT`). The cursor is `kisconSync/state.syncedThrough`; `api/kiscon-sync.ts` advances it daily (Vercel Cron, `CRON_SECRET`) and `npm run kiscon:backfill` runs the initial 2003→today backfill locally (reads `.env.local`). `vercel.json` rewrites every non-`api/`, non-asset path to `index.html` for SPA routing.

### Styling

- Mixed system: plain per-component CSS files next to each page/component (`Foo.tsx` + `Foo.css`) using the CSS variables in `src/styles/global.css` (`--bg-*`, `--ink*`, `--accent*`, `--font`, etc.), plus Tailwind v4, shadcn (`components.json`, components in `src/components/ui`), and the Astryx design system (`<Theme>` in `main.tsx`).
- `--accent` is the site's blue brand color; the shadcn "accent" token is renamed `--ui-accent` to avoid the clash.
- Dark mode uses a `.dark` class (`@custom-variant dark`), toggled by `ThemeToggle` and persisted in localStorage.
- **Never use a native `<select>`.** Use `CustomSelect` from `src/components/ui/custom-select.tsx` (Radix-based; pass `name` to participate in `FormData`). Convert native selects when touching a screen that still has one.

### Build gotcha

`@astryxdesign/core` ships code compiled with the dev JSX transform, which breaks production builds. `vite.config.ts` aliases `react/jsx-dev-runtime` to `src/shims/jsx-dev-runtime.ts` for `build` only. React is also `dedupe`d to avoid duplicate instances. Keep both when editing the Vite config.
