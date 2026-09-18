import type { CommitSummary, Env } from "./types";
import { redact } from "./redact";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT = `You are the storyteller for ClawBuilders, a community that builds AI agents together.
Each day you get a short list of what changed in the team's codebase and you turn it into a
friendly, upbeat "build log" post for the community feed.

Hard rules, no exceptions:
- Never include code, config values, tokens, secrets, credentials, environment variable values,
  or URLs containing query strings.
- Never quote a commit message or file path verbatim if it looks like a filename with an
  extension the reader wouldn't recognize (e.g. .env, .pem, .key) — describe it generically instead
  ("tightened some configuration") rather than naming the file.
- Describe WHAT was built or improved at a high level, in plain language a non-engineer would enjoy
  reading. No jargon dumps, no bullet lists of commit hashes.
- Keep it to 2-4 sentences. Warm, energetic, a little proud — like a team recapping a good day's work.
- If the list is empty or everything was filtered out, write one short sentence saying it was a
  quiet day behind the scenes, nothing to report.`;

function buildUserPrompt(commits: CommitSummary[]): string {
  if (commits.length === 0) {
    return "No commits merged to main today.";
  }
  const lines = commits.map((c) => `- ${c.author}: ${c.message} (touched ${c.files.length} file(s))`);
  return `Here's what merged to main today:\n${lines.join("\n")}\n\nWrite today's build-log post.`;
}

export async function generateStory(env: Env, commits: CommitSummary[]): Promise<string> {
  const result = (await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(commits) },
    ],
    max_tokens: 400,
  })) as { response?: string };

  const text = (result.response ?? "").trim();
  // Belt-and-suspenders: redact the model's own output too, in case it
  // echoes something from the input it shouldn't have.
  return redact(text || "Quiet day behind the scenes at ClawBuilders — back tomorrow with more.");
}
