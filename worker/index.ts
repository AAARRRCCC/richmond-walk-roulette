import { handleApiRequest, type ProxyEnv } from "../server/proxy";

type Env = ProxyEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Optional binding from `[[unsafe.bindings]] type = "ratelimit"` in wrangler.toml. */
  API_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (env.API_RATE_LIMIT) {
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const { success } = await env.API_RATE_LIMIT.limit({ key: ip });
        if (!success) {
          // Must match `period` in wrangler.toml. A shorter hint makes the
          // client retry inside the same window, burn its attempts and fail.
          return new Response(JSON.stringify({ error: "rate-limited" }), {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "60" },
          });
        }
      }
      const response = await handleApiRequest(request, env);
      if (response) return response;
    }

    return env.ASSETS.fetch(request);
  },
};
