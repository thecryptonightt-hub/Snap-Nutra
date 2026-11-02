// Snap Finance live refresh — no key, no payment.
// Server-side only, so Yahoo/CoinGecko CORS and bot checks do not block
// the browser. The Snap Finance app calls this on Refresh.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const symbols = String(req.query.symbols || "AIB,LLY,TER,VRT,GOOGL,VLO,MPC,GANX,GRAL,PSX,FN,LRCX,AMZN,NVDA,MSFT,OPEN,KTOS,FORM,OUST,CRWV")
    .split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  async function yahoo(sym) {
    try {
      const r = await fetch("https://query2.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?range=5d&interval=1d",
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return { symbol: sym, error: "unavailable" };
      const j = await r.json();
      const meta = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      if (!meta || typeof meta.regularMarketPrice !== "number") return { symbol: sym, error: "unavailable" };
      const prev = meta.chartPreviousClose;
      const price = meta.regularMarketPrice;
      const chg = prev ? ((price - prev) / prev) * 100 : null;
      return { symbol: sym, price: Math.round(price * 100) / 100, changePercent: chg === null ? null : Math.round(chg * 100) / 100, currency: meta.currency || "USD", marketTime: meta.regularMarketTime || null };
    } catch { return { symbol: sym, error: "unavailable" }; }
  }
  let crypto = [];
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true", { signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const j = await r.json();
      crypto = Object.keys(j).map(k => ({ id: k, usd: j[k].usd, change24h: j[k].usd_24h_change === undefined ? null : Math.round(j[k].usd_24h_change * 100) / 100 }));
    }
  } catch {}
  const results = await Promise.all(symbols.map(yahoo));
  return res.status(200).json({ asOf: new Date().toISOString(), quotes: results, crypto });
}
