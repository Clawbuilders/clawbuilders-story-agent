import type { Env } from "./types";

const THREADS_API = "https://graph.threads.net/v1.0";

interface CreationResponse {
  id?: string;
  error?: { message: string };
}

/**
 * Two-step Threads publish: create a text media container, then publish it.
 * https://developers.facebook.com/docs/threads/posts
 */
export async function publishToThreads(env: Env, text: string): Promise<void> {
  if (!env.THREADS_ACCESS_TOKEN || !env.THREADS_USER_ID) {
    throw new Error(
      "THREADS_ACCESS_TOKEN / THREADS_USER_ID are not configured yet — see README's Threads API setup section.",
    );
  }

  const createUrl = new URL(`${THREADS_API}/${env.THREADS_USER_ID}/threads`);
  createUrl.searchParams.set("media_type", "TEXT");
  createUrl.searchParams.set("text", text);
  createUrl.searchParams.set("access_token", env.THREADS_ACCESS_TOKEN);

  const createResp = await fetch(createUrl, { method: "POST" });
  const createBody = (await createResp.json()) as CreationResponse;
  if (!createResp.ok || !createBody.id) {
    throw new Error(
      `Threads container creation failed: ${createResp.status} ${JSON.stringify(createBody)}`,
    );
  }

  const publishUrl = new URL(`${THREADS_API}/${env.THREADS_USER_ID}/threads_publish`);
  publishUrl.searchParams.set("creation_id", createBody.id);
  publishUrl.searchParams.set("access_token", env.THREADS_ACCESS_TOKEN);

  const publishResp = await fetch(publishUrl, { method: "POST" });
  if (!publishResp.ok) {
    throw new Error(`Threads publish failed: ${publishResp.status} ${await publishResp.text()}`);
  }
}
