export const config = { runtime: 'edge' };

const BASE = 1500;

const URL_  = process.env.storage_KV_REST_API_URL   || process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.storage_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  return (await r.json()).map(d => d.result);
}

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 's-maxage=3, stale-while-revalidate=5'
  }
});

export default async function handler(req) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const n   = parseInt(url.searchParams.get('n') || '0', 10);
  if (!n || n < 1 || n > 5000) return json({ error: 'Missing or invalid ?n= parameter' }, 400);

  const ids = Array.from({ length: n }, (_, i) => 'f' + (i + 1));

  const commands = [];
  ids.forEach(id => {
    commands.push(['GET', 'score:'  + id]);
    commands.push(['GET', 'wins:'   + id]);
    commands.push(['GET', 'losses:' + id]);
  });
  commands.push(['GET', 'total_votes']);

  const results    = await redis(commands);
  const totalVotes = Number(results[results.length - 1] || 0);

  const scores = {};
  ids.forEach((id, i) => {
    const b = i * 3;
    scores[id] = {
      score:  results[b]   != null ? Number(results[b])   : BASE,
      wins:   results[b+1] != null ? Number(results[b+1]) : 0,
      losses: results[b+2] != null ? Number(results[b+2]) : 0
    };
  });

  return json({ scores, totalVotes });
}
