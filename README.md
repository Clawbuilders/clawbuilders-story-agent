# clawbuilders-story-agent

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/clawbuilders-story-agent)

A tiny Cloudflare Worker that looks at what merged into our ClawBuilders app
each day, turns it into a short, friendly "build log" story with an LLM —
no code, no secrets, no config values, just what got built — and posts it
to [Threads](https://www.threads.net/). Built as a companion bonus track to
[`cloudflare-code-reviewer`](https://github.com/Clawbuilders/cloudflare-code-reviewer)
for ClawBuilders Episode 5.

The target repo isn't hardcoded — it's configured via `GITHUB_OWNER` /
`GITHUB_REPO` secrets (see setup step 3), so this deploys against whatever
repo you point it at.

## How it works

```
Cron Trigger (daily)
  → GitHub REST API: list commits merged to main since last run
    (commit message + author + changed file paths only — never the diff/patch body)
  → redact() strips anything secret-shaped (API keys, tokens, private key blocks, ...)
  → Workers AI (@cf/meta/llama-3.3-70b-instruct-fp8-fast) writes a 2-4 sentence recap
  → Threads Graph API: create a text container, then publish it
```

Two defenses against leaking anything sensitive, on purpose:

1. **We never fetch diff/patch content from GitHub** — only commit messages,
   author names, and file paths. A secret that never entered the Worker
   can't leak from it.
2. **A regex secret-scan (`src/redact.ts`)** redacts anything shaped like an
   API key, token, or private key block from commit messages/file paths
   *before* they reach the LLM, and again on the LLM's own output before it
   posts anything.

A commit message containing `[skip-story]` is excluded entirely.

### Why Threads instead of X?

X's API has no free tier as of 2026 (pay-per-use, ~$0.015+ per post), and
browser/cookie-based workarounds violate X's Terms of Service and risk
account bans. Threads' API is free with no per-post cost, at the cost of a
one-time verification step before it can post to a real account (see below).

## Repo layout

- `src/index.ts` — Worker entrypoint: `scheduled()` (the daily cron job) and
  `fetch()` (the `/preview` route below)
- `src/github.ts` — fetches commits + changed file lists from GitHub
- `src/redact.ts` — the secret-scrubbing pass
- `src/story.ts` — the LLM prompt + Workers AI call
- `src/threads.ts` — the two-step Threads publish call
- `wrangler.json` — Worker config (AI + KV bindings, cron schedule)

## Setup

### 1. Deploy

Click the **Deploy to Cloudflare Workers** button above — it forks this repo
into your GitHub account and deploys it to your own Cloudflare account. (You
can also clone it and run `wrangler deploy` yourself; see "Local development"
below.)

### 2. KV namespace

The Worker stores "last run" state (so it doesn't re-summarize the same
commits, or double-post) in a KV namespace. `wrangler.json`'s
`kv_namespaces[0]` deliberately omits an `id` — modern Wrangler
auto-provisions the namespace on first deploy (the Deploy button does this
too). If your Wrangler version doesn't support that, create it manually and
add the printed `id` to `wrangler.json` yourself:

```bash
npx wrangler kv namespace create STORY_STATE
```

### 3. Create a GitHub token, and point the Worker at your repo

Create a **fine-grained personal access token** scoped to only the single
repo you want this to track, with:

- Repository permissions → **Contents: Read-only**
- Repository permissions → **Metadata: Read-only**

Nothing else. Then set it, along with which repo/owner/branch to watch, as
secrets (kept out of the committed config on purpose, so this template
doesn't hardcode anyone's repo name):

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_OWNER   # e.g. your GitHub org or username
npx wrangler secret put GITHUB_REPO    # the repo name, without the owner
```

`GITHUB_BRANCH` defaults to `main` via `wrangler.json`'s `vars` (branch names
aren't sensitive, so it stays a plain, editable var) — change that value
directly in `wrangler.json` if you track a different branch.

### 4. Threads API setup

This is the part with a real lead time — start it as early as possible.

1. Create or sign in to a **Meta Developer account** at
   [developers.facebook.com](https://developers.facebook.com/).
2. **Create a new Meta App** (type "Other" or "Business" works), then add the
   **Threads API** product to it from the App Dashboard.
3. Under **App Settings → Basic**, complete **Tech Provider Verification**
   (Meta's business verification flow). **This typically takes about a
   week** — until it clears, the Worker will happily keep running in
   preview-only mode (see the `/preview` route below), which is exactly what
   the live demo at the event uses.
4. In the Threads API product's use-case setup, add yourself as a tester (or,
   once verification clears, configure it for the real posting account), and
   generate a **Threads User Access Token** via the Graph API Explorer or an
   OAuth flow, requesting the `threads_basic` and `threads_content_publish`
   scopes.
5. **Exchange it for a long-lived token** (valid 60 days):
   ```
   GET https://graph.threads.net/access_token
     ?grant_type=th_exchange_token
     &client_secret=<your app secret>
     &access_token=<short-lived token from step 4>
   ```
6. **Get your Threads user ID:**
   ```
   GET https://graph.threads.net/v1.0/me?fields=id&access_token=<long-lived token>
   ```
7. Set both as secrets:
   ```bash
   npx wrangler secret put THREADS_ACCESS_TOKEN
   npx wrangler secret put THREADS_USER_ID
   ```
8. **Note the 60-day expiry.** There's no automated refresh in v1 — repeat
   step 5 (using the current long-lived token as the input) before it
   expires, and re-run `wrangler secret put THREADS_ACCESS_TOKEN`. Put a
   reminder on your calendar; if this becomes annoying, automating it with a
   second, infrequent Cron Trigger calling Threads' refresh endpoint is a
   natural follow-up.

### 5. Preview secret

The `/preview` route lets you see (and demo) a generated story without
posting it publicly — useful both before Threads verification clears and
afterward as a manual "what would today's story look like" check.

```bash
npx wrangler secret put PREVIEW_TOKEN   # any random string
```

### 6. Deploy

```bash
npm install
npm run deploy
```

### 7. Verify

```bash
curl "https://clawbuilders-story-agent.<your-subdomain>.workers.dev/preview?token=<PREVIEW_TOKEN>"
```

Read the output and confirm nothing secret-shaped leaked through before
trusting it. Once Threads is configured, trigger the cron manually from the
Cloudflare dashboard (**Workers & Pages → your Worker → Triggers → Cron
Triggers → Trigger**) to do one real end-to-end post and check it renders
correctly.

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in real values, never commit this file
npm install
npm run dev
```

`npm run typecheck` runs `tsc --noEmit`. There's no test suite yet — the
`/preview` route doubles as the manual verification tool.

## Schedule

The cron in `wrangler.json` (`0 22 * * *`, UTC) runs once daily. Adjust it to
whatever time makes sense for when the community is most active.
