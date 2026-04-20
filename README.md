# gbp-edge-research-blog

Claude Agent SDK service that, for each active GBP Edge client:

1. Loads the row from the Notion **Clients** DB (only `Status = actif`).
2. Does Reddit ICP research — 2–3 French search queries derived from the client's `{niche, city}` — and picks the highest-potential topic.
3. Logs the pick to the Notion **Reddit Research** DB.
4. Clones the client's repo, studies an existing blog post, writes a new French 1500+ word SEO blog post (no images), updates `sitemap.xml` + the blog listing, and pushes.
5. Requests Google Search Console indexation for the new URL.

At the end (always) it sends a single Telegram summary covering every client.

Same stack as [`jobs-research-agent`](../jobs-research-agent):
`@anthropic-ai/claude-agent-sdk` + `tsx` + Node 22 on Fly.io.

## Setup

```bash
cp .env.example .env
# fill in:
#   ANTHROPIC_API_KEY
#   NOTION_API_KEY, NOTION_CLIENTS_DB_ID, NOTION_RESEARCH_DB_ID
#   GITHUB_TOKEN (PAT with repo scope on every active client's repo)
#   GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN
#   TELEGRAM_BOT_API_KEY, TELEGRAM_CHAT_ID

npm install

# Sanity-check Notion schema
npm run probe:notion

# One-time: generate the GSC OAuth refresh token
npm run gsc:token

# Full local run
npm start
```

## Notion schemas

**Clients DB** — only rows with `Status = actif` are processed. Columns the agent looks for (case-insensitive, bilingual):

| Concept | Accepted property names |
|---|---|
| Name | Name, Nom, Business, Business Name, Client, Client Name (or any title column) |
| City | City, Ville, Location, Localisation |
| Niche | Niche, Industry, Industrie, Secteur, Activité, Type d'activité, Category, Catégorie |
| ICP | ICP, Ideal Customer, Client Idéal, Audience |
| Site URL | Site URL, Site, Website, URL |
| Repo URL | GitHub Repo URL, GitHub Repo, Repo URL, Repository, Repo |
| Status | Status, Statut, State, État (value must contain "actif" or "active") |

**Reddit Research DB** — must exist before the first run. Required properties:

- `Client` (title)
- `Date` (date)
- `Keyword` (rich_text)
- `Reddit Post Title` (rich_text)
- `Reddit URL` (url)
- `Suggested Blog Topic` (rich_text)
- `Score` (number)

## Deployment (Fly.io)

```bash
fly launch --no-deploy
fly secrets set \
  ANTHROPIC_API_KEY=... \
  NOTION_API_KEY=... NOTION_CLIENTS_DB_ID=... NOTION_RESEARCH_DB_ID=... \
  GITHUB_TOKEN=... \
  GSC_CLIENT_ID=... GSC_CLIENT_SECRET=... GSC_REFRESH_TOKEN=... \
  TELEGRAM_BOT_API_KEY=... TELEGRAM_CHAT_ID=...
fly deploy
```

Schedule it as a recurring one-shot via `fly machine run --schedule ...` or an
external cron that calls `fly machine run`.

## Architecture notes

- Mixes custom MCP tools (Notion, Reddit, GSC, Telegram) with the agent SDK's built-in `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep` tools — the agent uses `Bash` for git and `Read/Write/Edit` to match each client's blog template exactly.
- `permissionMode: "bypassPermissions"` is on; the container runs as a non-root user (`agent`).
- Git auth uses a single `GITHUB_TOKEN` embedded in HTTPS clone URLs (`https://x-access-token:$TOKEN@github.com/...`) — one PAT that can push to every active client repo.
- GSC indexation is best-effort. The Google account owning `GSC_REFRESH_TOKEN` must be verified as an owner on each client's Search Console property; when it isn't, the agent records `gsc: error` in the Telegram report and the blog still ships.
- `maxTurns: 400` because each client takes 30–60 tool calls (Reddit + reads + writes + git).
