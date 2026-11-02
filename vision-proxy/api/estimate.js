// Snap Nutra vision proxy — runs on Vercel, free tier.
// The Gemini API key lives ONLY as a Vercel environment variable
// (GEMINI_API_KEY). It is never in this repo, never in app.html,
// and never returned to the browser. The app sends a photo, this
// function asks Gemini what drink/container/fill it is, and returns
// only the JSON estimate back to the app.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "vision not configured" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const image = body && body.image; // data URL or base64, JPEG
  if (!image || typeof image !== "string") return res.status(400).json({ error: "no image" });
  const b64 = image.replace(/^data:image\/\w+;base64,/, "");
  const prompt = `Look at this photo of a drink. Return ONLY JSON, no other text:
{"drink":"tea|coffee|water|juice|soda|milk|soup|other",
 "container":"glass|cup / mug|bowl|tall can / bottle|other",
 "fill":0.5,
 "capacity_ml":350,
 "ml":175}
Rules: fill is the fraction of the container that is full (0.25, 0.5, 0.75, 1.0, or a close fraction). capacity_ml is the container's full capacity in mL, estimated from its type and size in the photo. ml = round(capacity_ml * fill). Do not guess a brand unless it is clearly visible. If you cannot see a drink, return {"error":"no drink visible"}.`;
  // Try 2.5-flash first, fall back to older flash models if a model is
  // not available on this free key. Return the upstream error text
  // (no key is ever in it) so a failure can actually be diagnosed.
  let j = null, lastStatus = 0, lastDetail = "";
  for (const model of ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]) {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key),
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: b64 } }] }], generationConfig: { temperature: 0 } }) }
    );
    lastStatus = r.status;
    const txt = await r.text();
    if (r.ok) { try { j = JSON.parse(txt); } catch { j = null; } break; }
    lastDetail = txt.slice(0, 300);
  }
  if (!j) return res.status(502).json({ error: "vision service failed", status: lastStatus, detail: lastDetail });
  const text = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map(p => p.text || "").join("");
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (parsed.error) return res.status(200).json(parsed);
    return res.status(200).json({ drink: parsed.drink || "Drink", container: parsed.container || "glass", fill: parsed.fill, capacity_ml: parsed.capacity_ml, ml: Math.round(parsed.ml || 0) });
  } catch { return res.status(502).json({ error: "could not parse vision result" }); }
}
