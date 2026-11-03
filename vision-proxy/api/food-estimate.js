// Nutrafood food-photo proxy — same free Cloudflare Workers AI vision as
// Snap Nutra, different prompt. Runs on Vercel, free tier.
// Keys live ONLY as Vercel environment variables, never in any repo, app,
// chat, or report. The app sends a meal photo, this function asks the
// vision model what foods are on the plate and roughly how much of each,
// and returns only that JSON. The app matches each item to its own
// renal food database where it can, and the user fixes anything wrong
// before saving — nothing is ever added silently.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  // Kept for the same reason as estimate.js: the handler's Cloudflare
  // branch runs only after this gate, so a present (unused) key is required.
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "vision not configured" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const image = body && body.image;
  if (!image || typeof image !== "string") return res.status(400).json({ error: "no image" });
  const prompt = `Look at this photo of a meal or plate of food. Return ONLY JSON, no other text:
{"items":[{"name":"plain food name, e.g. grilled chicken breast",
 "portion":"short portion description, e.g. about 1 cup or about 6 oz",
 "grams":"number, estimated weight in grams",
 "k_mg":"number, estimated potassium in mg",
 "p_mg":"number, estimated phosphorus in mg",
 "na_mg":"number, estimated sodium in mg",
 "protein_g":"number, estimated protein in grams",
 "kcal":"number, estimated calories"}]}
Rules: list every distinct food you can actually see on the plate, one item per food, not per bite. Include cooking method in the name when visible (grilled, fried, steamed, baked). Estimate portion size from the plate and nearby objects for scale; do not invent a food that is not visible. Use typical nutrition values for that food and portion — these are estimates, not lab measurements. If no food is visible, return {"error":"no food visible"}. Do not put concrete example numbers in the schema above into your answer; estimate from this photo only.`;
  const cfToken = process.env.CF_API_TOKEN;
  const cfAccount = process.env.CF_ACCOUNT_ID;
  if (!cfToken || !cfAccount) return res.status(500).json({ error: "vision not configured" });
  const cfUrl = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfAccount) + "/ai/run/@cf/meta/llama-3.2-11b-vision-instruct";
  const cfBody = JSON.stringify({ messages: [{ role: "system", content: "You are a helpful assistant. Answer with JSON only." }, { role: "user", content: prompt }], image: image.startsWith("data:") ? image : "data:image/jpeg;base64," + image, max_tokens: 500 });
  try {
    let cr = await fetch(cfUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfToken }, body: cfBody });
    let ctext0 = await cr.text();
    if (!ctext0 || /licen/i.test(ctext0)) {
      try {
        await fetch(cfUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfToken }, body: JSON.stringify({ prompt: "agree" }) });
        cr = await fetch(cfUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfToken }, body: cfBody });
        ctext0 = await cr.text();
      } catch {}
    }
    if (!cr.ok) return res.status(502).json({ error: "vision service failed", status: cr.status, detail: ctext0.slice(0, 200) });
    const cj = JSON.parse(ctext0);
    const ctext = (cj.choices && cj.choices[0] && cj.choices[0].message && cj.choices[0].message.content) || (cj.result && cj.result.response) || (typeof cj.result === "string" ? cj.result : "") || "";
    const raw = (ctext && typeof ctext === "object") ? JSON.stringify(ctext) : String(ctext);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const parsed = JSON.parse(cleaned.slice(start));
    if (parsed.error) return res.status(200).json(parsed);
    const items = (parsed.items || []).filter(function (it) { return it && it.name && Number(it.grams) > 0; }).map(function (it) {
      return { name: String(it.name), portion: String(it.portion || ""), grams: Math.round(Number(it.grams)), k_mg: Math.round(Number(it.k_mg) || 0), p_mg: Math.round(Number(it.p_mg) || 0), na_mg: Math.round(Number(it.na_mg) || 0), protein_g: Math.round(Number(it.protein_g) * 10) / 10, kcal: Math.round(Number(it.kcal) || 0) };
    });
    return res.status(200).json({ items: items });
  } catch (e) {
    return res.status(502).json({ error: "could not parse vision result", detail: String(e).slice(0, 200) });
  }
}
