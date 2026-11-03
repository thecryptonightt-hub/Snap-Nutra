// Snap Finance live Fed odds — no key, no payment.
// Server-side only, so Kalshi/Polymarket CORS and bot checks do not
// block the browser. The Snap Finance app calls this on Refresh.
// Both venues are returned SEPARATELY, never blended silently:
// Kalshi prices are last traded dollars, Polymarket prices are the
// Yes outcome price. If one venue fails, the other still returns and
// the failure is named in `errors` — no odds are invented.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const KALSHI_MAP = { "Cut >25bps": "cut50plus", "Cut 25bps": "cut25", "Fed maintains rate": "hold", "Hike 25bps": "hike25", "Hike >25bps": "hike50plus" };
  const PM_MAP = { "50+ bps decrease": "cut50plus", "25 bps decrease": "cut25", "No change": "hold", "25 bps increase": "hike25", "50+ bps increase": "hike50plus" };
  const MEETINGS = [
    { meeting: "Dec 8-9, 2026", kalshiEvent: "KXFEDDECISION-26DEC", pmSlug: "fed-decision-in-december-20260729232808632" },
    { meeting: "Jan 26-27, 2027", kalshiEvent: "KXFEDDECISION-27JAN", pmSlug: "fed-decision-in-january-20260729233815502" },
    { meeting: "Mar 16-17, 2027", kalshiEvent: "KXFEDDECISION-27MAR", pmSlug: "fed-decision-in-march-2027" },
  ];
  const errors = [];
  async function kalshi(eventTicker) {
    try {
      const r = await fetch("https://api.elections.kalshi.com/trade-api/v2/events/" + encodeURIComponent(eventTicker), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const out = {};
      for (const m of (j.markets || [])) {
        const key = KALSHI_MAP[m.no_sub_title];
        if (key && m.last_price_dollars !== undefined) out[key] = Math.round(parseFloat(m.last_price_dollars) * 1000) / 10;
      }
      return Object.keys(out).length ? out : null;
    } catch (e) { errors.push("Kalshi " + eventTicker + ": " + String(e.message || e)); return null; }
  }
  async function polymarket(slug) {
    try {
      const r = await fetch("https://gamma-api.polymarket.com/events?slug=" + encodeURIComponent(slug), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const ev = Array.isArray(j) ? j[0] : null;
      if (!ev) return null;
      const out = {};
      for (const m of (ev.markets || [])) {
        const key = PM_MAP[m.groupItemTitle];
        if (!key) continue;
        let prices = [];
        try { prices = JSON.parse(m.outcomePrices || "[]"); } catch {}
        if (prices.length) out[key] = Math.round(parseFloat(prices[0]) * 1000) / 10;
      }
      return Object.keys(out).length ? out : null;
    } catch (e) { errors.push("Polymarket " + slug + ": " + String(e.message || e)); return null; }
  }
  function combined(k, p) {
    if (!k && !p) return null;
    const keys = ["cut50plus", "cut25", "hold", "hike25", "hike50plus"];
    const out = {};
    for (const key of keys) {
      const vals = [];
      if (k && typeof k[key] === "number") vals.push(k[key]);
      if (p && typeof p[key] === "number") vals.push(p[key]);
      if (vals.length) out[key] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }
    if (out.hike25 !== undefined || out.hike50plus !== undefined) out.hike = Math.round(((out.hike25 || 0) + (out.hike50plus || 0)) * 10) / 10;
    if (out.cut25 !== undefined || out.cut50plus !== undefined) out.cut = Math.round(((out.cut25 || 0) + (out.cut50plus || 0)) * 10) / 10;
    return out;
  }
  const meetings = [];
  for (const mtg of MEETINGS) {
    const [k, p] = await Promise.all([kalshi(mtg.kalshiEvent), polymarket(mtg.pmSlug)]);
    meetings.push({ meeting: mtg.meeting, kalshi: k, polymarket: p, combined: combined(k, p) });
  }
  return res.status(200).json({ asOf: new Date().toISOString(), source: "Kalshi + Polymarket, live", meetings, errors });
}
