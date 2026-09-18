import type { CommitSummary, Env } from "./types";
import { redact } from "./redact";

const GITHUB_API = "https://api.github.com";

// Hard cap so a very busy day can't blow up the request budget or the
// eventual LLM prompt size.
const MAX_COMMITS = 30;

function githubHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "clawbuilders-story-agent",
  };
}

interface RawCommitListEntry {
  sha: string;
  commit: { message: string; author: { name: string } | null };
}

interface RawCommitDetail {
  files?: { filename: string }[];
}

/**
 * Lists commits on GITHUB_BRANCH between since/until, then fetches each
 * commit's changed-file list. Deliberately never requests the diff/patch
 * body — only filenames — so there is no diff content in memory for a
 * secret to hide inside.
 */
export async function fetchRecentCommits(
  env: Env,
  sinceIso: string,
  untilIso: string,
): Promise<CommitSummary[]> {
  const listUrl = new URL(`${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/commits`);
  listUrl.searchParams.set("sha", env.GITHUB_BRANCH);
  listUrl.searchParams.set("since", sinceIso);
  listUrl.searchParams.set("until", untilIso);
  listUrl.searchParams.set("per_page", String(MAX_COMMITS));

  const listResp = await fetch(listUrl, { headers: githubHeaders(env) });
  if (!listResp.ok) {
    throw new Error(`GitHub commit list failed: ${listResp.status} ${await listResp.text()}`);
  }
  const rawCommits = (await listResp.json()) as RawCommitListEntry[];

  const commits: CommitSummary[] = [];
  for (const entry of rawCommits.slice(0, MAX_COMMITS)) {
    const message = entry.commit.message.split("\n")[0] ?? "";
    if (/\[skip-story\]/i.test(message)) continue;

    const detailUrl = `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/commits/${entry.sha}`;
    const detailResp = await fetch(detailUrl, { headers: githubHeaders(env) });
    if (!detailResp.ok) {
      // Skip a single bad commit rather than failing the whole day's story.
      continue;
    }
    const detail = (await detailResp.json()) as RawCommitDetail;
    const files = (detail.files ?? []).map((f) => f.filename);

    commits.push({
      sha: entry.sha.slice(0, 7),
      message: redact(message),
      author: redact(entry.commit.author?.name ?? "someone"),
      files: files.map((f) => redact(f)),
    });
  }

  return commits;
}
