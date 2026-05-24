export const config = { runtime: 'edge' };

const BASE = 1500;
const URL_  = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(commands) {
  if (!URL_ || !TOKEN) throw new Error("Missing Redis environment variables.");
  
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json();
  if (data.error) throw new Error(`Redis Error: ${data.error}`);
  
  return data.map(d => d.error ? null : d.result);
}

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Surrogate-Control': 'no-store'
  }
});

export default async function handler(req) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = new URL(req.url);
    const n   = parseInt(url.searchParams.get('n') || '0', 10);
    if (!n || n < 1 || n > 5000) return json({ error: 'Invalid n' }, 400);

    const ids  = Array.from({ length: n }, (_, i) => 'f' + (i + 1));
    const keys = ids.map(id => 'fac:' + id);

    const results = await redis([['MGET', ...keys]]);
    const facArr  = results[0] || [];

    const scores = {};
    let totalVotes = 0;

    ids.forEach((id, i) => {
      let data = { s: BASE, w: 0, l: 0 };
      
      if (facArr[i]) {
        try { data = JSON.parse(facArr[i]); } catch(e) {}
      }
      
      scores[id] = {
        score:  data.s,
        wins:   data.w,
        losses: data.l
      };
      
      totalVotes += data.w; 
    });

    return json({ scores, totalVotes });
  } catch (error) {
    console.error("Rankings API Error:", error);
    return json({ error: error.message }, 500);
  }
}
