# INDEX knowledge server

This is a server implementation with immutable original files, a SQLite WAL database,
activity capture, durable jobs, two-stage LLM wiki generation, source-linked review
drafts, versioned edits, evidence-based Q&A, Markdown exports, and a Mercury MCP adapter.
It is not a copy of nashsu/llm_wiki's GPL code. That application informed the architecture;
the server implementation here is new. Mercury 1.5.1 is installed separately with its MIT license.

## Local operation

Use Node 24. The approved existing `CHAT_LLM_BASE_URL`, `CHAT_LLM_MODEL` and optional
`CHAT_LLM_API_KEY` are reused. `WIKI_LLM_*` can override them without changing the data store.

```sh
npm ci
npm ci --prefix services/mercury --ignore-scripts
npm run wiki:server
# In another terminal:
npm run wiki:mercury
# The existing INDEX development server remains on 5180:
npm run dev
```

Open http://localhost:5180/agent-studio/wiki with an INDEX administrator account.
The 5318 API verifies the same Firebase ID token as INDEX. It does not accept a
browser-supplied user ID. The private runtime token is generated in the data directory
for server-to-server/MCP calls and never sent to browser code.

Data lives in `.index-knowledge/` (or `INDEX_KNOWLEDGE_DIR`):

```text
knowledge.sqlite     pages, immutable revisions, events, original metadata, jobs
raw/                 content-addressed originals (no overwrite/delete API)
wiki/                derived Markdown exports
revisions/           immutable Markdown revision exports
runtime.token        private internal credential (0600)
mercury/             isolated Mercury configuration and runtime state
```

New wiki files and imports become review drafts. Only `published` pages answer questions
by default; administrators can explicitly include unreviewed pages. Source IDs and
versions in citations are supplied by the server, not invented by the model.

Studio document/block/source/knowledge/ontology/message/task changes, board saves and
seminar saves feed an IndexedDB delivery outbox; successful server acknowledgement
removes the local delivery entry. The server deduplicates event IDs and hashes original
content. Failed delivery remains visible in the Wiki processing panel. Provider settings,
credentials and member profiles are excluded from capture. This does not retroactively
import all historical Firebase data. Existing items can be selected in the import dialog.
The previous personal/browser repository is retained in `createLegacyWikiRepository`.

The deterministic worker runs without a browser or Mercury UI. Mercury connects to
`wiki_status`, `wiki_search`, `wiki_process_pending` through stdio MCP; its local
conversation memory is disabled as an authoritative knowledge store. A periodic heartbeat
checks actual state. No external messaging channel or autonomous sub-agent is configured.

## Cloud VM

No cloud VM has been purchased or deployed by these scripts. On a prepared Ubuntu VM
with Docker Compose and a domain:

1. Copy `environment.example` to repository-root `.env.knowledge.local` and configure
   the existing Firebase web/server settings and an AI endpoint reachable from the VM.
   A `localhost` Qwen endpoint on your personal PC will not be reachable from the VM;
   use an existing accessible inference server or a separately authorized API provider.
2. Build and start:

```sh
docker compose --env-file .env.knowledge.local -f deploy/knowledge/compose.yaml up -d --build
```

3. Put Caddy in front of `127.0.0.1:5318` using the provided Caddyfile and your domain.
   The public server must use HTTPS. Keep Mercury's administrative dashboard private.
4. The `knowledge` named volume persists across container restarts and rebuilds. Do not
   use `docker compose down -v`, which destroys that volume.
5. Restore and verify an independent off-server backup before relying on this as the
   only copy of INDEX knowledge. High availability is not provided by a single VM.

The image includes the INDEX web build and existing `api/*.ts` server functions. Existing
chat and other APIs retain their original authentication/quota/provider configuration.

## Backup and verification

```sh
npm run test:knowledge
npm run test:wiki
npm run wiki:build
npm run wiki:backup -- /absolute/path/to/new-backup-directory
```

The backup command takes a consistent SQLite snapshot with the SQLite backup API,
copies original files and exports, and verifies database integrity and source presence.
It does not include secrets or Mercury credentials. Copy completed backups to separate
storage; a backup directory on the same VM alone is not off-server protection.

Lease-based retry is at-least-once. Stable source IDs, checkpoints, and per-source summary
IDs prevent replay from duplicating completed wiki generation. Events and completed jobs
remain in the database. PDF text extraction is implemented; scans without extractable text
remain preserved with a visible failure requiring OCR. No scan is silently reported as ingested.

## Private Markdown archive

The separate private repository `leejinsoo1979/index-wiki` is reserved for wiki
Markdown and revision Markdown only. `npm run wiki:backup:github -- --plan` reads
a consistent database snapshot and writes the local file/hash review list to
`.index-knowledge/github-backup-review.json`. It never copies the SQLite file,
raw PDFs, activity records, actors, original-file metadata or credentials.

Review the actual content of all new/changed current and historical documents
for personal information, including names and addresses that pattern matching
cannot reliably identify. After review and authorization to upload, run:

```sh
npm run wiki:backup:github -- --approve-reviewed <reviewDigest>
```

The command checks the repository is private, blocks common personal-information
and credential patterns, uploads only the reviewed digest, and verifies the
remote commit and file inventory. Changes require a new review; identical
content can be checked again with `npm run wiki:backup:github`. GitHub CLI must
be authenticated as an account with push access. No credentials are put in the
repository URL or files. The mirror is isolated in `.index-knowledge/github-markdown/`.

This is a manual Markdown archive, not the operational database, full-server
backup, automated cloud deployment, or off-server backup of original PDFs.
