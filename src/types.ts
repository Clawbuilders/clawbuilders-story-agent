export interface Env {
  AI: Ai;
  STORY_STATE: KVNamespace;

  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GITHUB_TOKEN: string;

  THREADS_ACCESS_TOKEN?: string;
  THREADS_USER_ID?: string;

  PREVIEW_TOKEN: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  files: string[];
}
