export const config = { runtime: 'edge' };

const BASE = 1500, K = 32;
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
  
  return data.map((d, i) => {
    if (d.error) throw new Error(`Command rejected by Redis: ${d.error}`);
    return d.result;
  });
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'Content-Type': 'application/json', ...CORS }
});

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { winnerId, loserId } = await req.json();
    if (!winnerId || !loserId || winnerId === loserId) return json({ error: 'Invalid IDs' }, 400);

    // 1 Command: Get both JSON strings
    const reads = await redis([['MGET', 'fac:' + winnerId, 'fac:' + loserId]]);
    
    const facArray = reads[0] || [null, null];

    let wData = { s: BASE, w: 0, l: 0 };
    let lData = { s: BASE, w: 0, l: 0 };
    
    if (facArray[0]) try { wData = JSON.parse(facArray[0]); } catch(e){}
    if (facArray[1]) try { lData = JSON.parse(facArray[1]); } catch(e){}

    const ea = 1 / (1 + Math.pow(10, (lData.s - wData.s) / 400));
    wData.s = Math.round(wData.s + K * (1 - ea));
    lData.s = Math.round(lData.s + K * (0 - (1 - ea)));
    wData.w += 1;
    lData.l += 1;

    await redis([[
      'MSET', 
      'fac:' + winnerId, JSON.stringify(wData), 
      'fac:' + loserId,  JSON.stringify(lData)
    ]]);

    return json({ ok: true, newA: wData.s, newB: lData.s });
  } catch (error) {
    console.error("Vote API Error:", error);
    return json({ error: error.message }, 500);
  }
}
