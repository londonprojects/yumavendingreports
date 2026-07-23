// Server-side proxies for production:
//  - /haha-test/* and /haha-prod/* → HAHA OpenAPI (mirrors vite.config.js dev proxy)
//  - /api/insights → Kimi (Moonshot AI) chat completions
//
// The browser only ever sees this Worker's own origin — API keys live in
// Wrangler secrets and never reach client-side JS. Only the paths listed in
// wrangler.jsonc's assets.run_worker_first reach this script; everything else
// is served as a static asset.

const HAHA_UPSTREAM = {
  '/haha-test': 'https://thor-openapi-test.hahavending.com',
  '/haha-prod': 'https://thor-openapi.hahavending.com',
};

const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions';
const DEFAULT_MODEL = 'kimi-k2.6';
const MAX_TASK_LENGTH = 600;
const MAX_SUMMARY_LENGTH = 20000; // characters, as serialized JSON

// Fixed preamble — never replaced by the client, only extended by `task`. Keeps
// this public, unauthenticated endpoint scoped to "narrate our own numbers",
// not usable as a general-purpose Kimi proxy.
const BASE_PROMPT = `You are a vending machine merchandising and operations analyst.
You are given JSON with numbers already computed deterministically by the app
(sales velocity, profit margin, current vs. recommended slot counts, restock
priority, profit-at-risk, etc). Do not recompute or contradict these numbers —
synthesize them into a concise, actionable report for an operations manager. Reply
in plain text (no markdown symbols like # or **), using line breaks and "-" for
bullet points, with clear section labels. Cite the actual product/machine names and
numbers from the JSON. Keep the whole reply under 350 words.`;

const DEFAULT_TASK = `Cover, in this order: (1) which products should move from 1
slot to 2 slots and why, (2) which should move from 2 slots down to 1, (3) the
highest and lowest profit-margin items and what that implies, (4) 3-5 prioritized
actions for reorganizing the machines.`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });

const proxyHaha = (request, prefix, upstreamBase) => {
  const url = new URL(request.url);
  const upstreamPath = url.pathname.slice(prefix.length) || '/';
  const upstreamUrl = `${upstreamBase}${upstreamPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');

  const init = {method: request.method, headers};
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  return fetch(upstreamUrl, init);
};

const handleInsights = async (request, env) => {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, 405);
  }
  if (!env.KIMI_API_KEY) {
    return json({error: 'KIMI_API_KEY is not configured on this Worker.'}, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({error: 'Invalid JSON body.'}, 400);
  }

  const summary = body?.summary;
  if (!summary) {
    return json({error: 'Missing "summary" in request body.'}, 400);
  }
  const summaryText = JSON.stringify(summary);
  if (summaryText.length > MAX_SUMMARY_LENGTH) {
    return json({error: 'Summary payload is too large.'}, 400);
  }

  const task =
    typeof body.task === 'string' && body.task.trim()
      ? body.task.trim().slice(0, MAX_TASK_LENGTH)
      : DEFAULT_TASK;

  let upstream;
  try {
    upstream = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.KIMI_MODEL || DEFAULT_MODEL,
        // This model rejects any value but 1 (the API's own default appears
        // to be something else, since omitting the field still errored) —
        // set explicitly rather than relying on a default.
        temperature: 1,
        messages: [
          {role: 'system', content: `${BASE_PROMPT}\n\n${task}`},
          {role: 'user', content: summaryText},
        ],
      }),
    });
  } catch (err) {
    return json({error: `Could not reach Kimi: ${err.message}`}, 502);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return json({error: `Kimi API error (${upstream.status}): ${text.slice(0, 500)}`}, 502);
  }

  const data = await upstream.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    return json({error: 'Kimi returned no content.'}, 502);
  }

  return json({text});
};

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    for (const [prefix, upstreamBase] of Object.entries(HAHA_UPSTREAM)) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return proxyHaha(request, prefix, upstreamBase);
      }
    }

    if (pathname === '/api/insights') {
      return handleInsights(request, env);
    }

    return json({error: 'Not found'}, 404);
  },
};
