import type { Env } from "./types";
import { fetchRecentCommits } from "./github";
import { generateStory } from "./story";
import { publishToThreads } from "./threads";

const LAST_RUN_KEY = "last_story_run";
const LAST_PREVIEW_KEY = "last_preview_story";
const FALLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

async function collectAndGenerate(env: Env): Promise<{ since: string; until: string; story: string }> {
  const until = new Date();
  const lastRun = await env.STORY_STATE.get(LAST_RUN_KEY);
  const since = lastRun ?? new Date(until.getTime() - FALLBACK_WINDOW_MS).toISOString();

  const commits = await fetchRecentCommits(env, since, until.toISOString());
  const story = await generateStory(env, commits);

  return { since, until: until.toISOString(), story };
}

async function runDailyStory(env: Env): Promise<void> {
  const { until, story } = await collectAndGenerate(env);

  if (env.THREADS_ACCESS_TOKEN && env.THREADS_USER_ID) {
    // Real publish path. Only advance the watermark on success, so a
    // transient failure gets retried (with a wider window) tomorrow
    // instead of silently losing a day.
    await publishToThreads(env, story);
    await env.STORY_STATE.put(LAST_RUN_KEY, until);
  } else {
    // Threads not configured yet (e.g. verification still pending) — stash
    // the story for the /preview route and still advance the watermark so
    // the same commits aren't re-summarized every day while we wait.
    await env.STORY_STATE.put(LAST_PREVIEW_KEY, story);
    await env.STORY_STATE.put(LAST_RUN_KEY, until);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyStory(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/preview") {
      const token = url.searchParams.get("token");
      if (!token || token !== env.PREVIEW_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }

      try {
        const { since, until, story } = await collectAndGenerate(env);
        return new Response(
          `Preview (not posted) — window ${since} to ${until}\n\n${story}\n`,
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        );
      } catch (err) {
        return new Response(`Preview failed: ${(err as Error).message}`, { status: 500 });
      }
    }

    return new Response("Not found. Try /preview?token=<PREVIEW_TOKEN>", { status: 404 });
  },
};
