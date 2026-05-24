export const config = { runtime: 'edge' };

const BASE = 1500, K = 32;

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

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { winnerId, loserId } = await req.json();
  if (!winnerId || !loserId || winnerId === loserId) return json({ error: 'Invalid IDs' }, 400);

  const [ra, rb] = await redis([['GET', 'score:' + winnerId], ['GET', 'score:' + loserId]]);
  const rA = ra != null ? Number(ra) : BASE;
  const rB = rb != null ? Number(rb) : BASE;
  const ea  = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const newA = Math.round(rA + K * (1 - ea));
  const newB = Math.round(rB + K * (0 - (1 - ea)));

  await redis([
    ['SET',  'score:'  + winnerId, newA],
    ['SET',  'score:'  + loserId,  newB],
    ['INCR', 'wins:'   + winnerId],
    ['INCR', 'losses:' + loserId],
    ['INCR', 'total_votes']
  ]);

  return json({ ok: true, newA, newB });
}
