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
  if (!image || typeof image !== "string") return res.status(400).json({ error: "no image", version: "e2ddec4-v3" });
  const b64 = image.replace(/^data:image\/\w+;base64,/, "");
  const prompt = `Look at this photo of a drink. Return ONLY JSON, no other text:
{"drink":"tea|coffee|water|juice|soda|milk|soup|other",
 "container":"glass|cup / mug|bowl|tall can / bottle|other",
 "fill":0.5,
 "capacity_ml":350,
 "ml":175}
Rules: fill is the fraction of the container that is full (0.25, 0.5, 0.75, 1.0, or a close fraction). capacity_ml is the container's full capacity in mL, estimated from its type and size in the photo. ml = round(capacity_ml * fill). Do not guess a brand unless it is clearly visible. If you cannot see a drink, return {"error":"no drink visible"}.`;
  // Hugging Face free vision, if configured: HF shows its token in full
  // on the creation page, so the browser can read it and type it into
  // Vercel. Free tier, no card.
  const hfKey = process.env.HF_API_KEY;
  if (hfKey) {
    for (const hfModel of ["Qwen/Qwen2.5-VL-72B-Instruct", "Qwen/Qwen2.5-VL-7B-Instruct"]) {
      try {
        const hr = await fetch("https://router.huggingface.co/v1/chat/completions", { method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + hfKey },
          body: JSON.stringify({ model: hfModel, temperature: 0, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.startsWith("data:") ? image : "data:image/jpeg;base64," + image } }] }] }) });
        const htxt = await hr.text();
        if (hr.ok) {
          const hj = JSON.parse(htxt);
          const htext = (hj.choices && hj.choices[0] && hj.choices[0].message && hj.choices[0].message.content) || "";
          const parsed = JSON.parse(String(htext).replace(/```json|```/g, "").trim());
          if (!parsed.error) return res.status(200).json({ drink: parsed.drink || "Drink", container: parsed.container || "glass", fill: parsed.fill, capacity_ml: parsed.capacity_ml, ml: Math.round(parsed.ml || 0) });
        }
      } catch {}
    }
  }
  // Groq free vision first, if configured: Groq shows its key in full
  // on the creation page (unlike OpenRouter's masked key), so the
  // browser can read it and type it into Vercel. Free tier, no card.
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    for (const groqModel of ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.2-11b-vision-instruct"]) {
      try {
        const gr = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + groqKey },
          body: JSON.stringify({ model: groqModel, temperature: 0, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.startsWith("data:") ? image : "data:image/jpeg;base64," + image } }] }] }) });
        const gtxt = await gr.text();
        if (gr.ok) {
          const gj = JSON.parse(gtxt);
          const gtext = (gj.choices && gj.choices[0] && gj.choices[0].message && gj.choices[0].message.content) || "";
          const parsed = JSON.parse(String(gtext).replace(/```json|```/g, "").trim());
          if (!parsed.error) return res.status(200).json({ drink: parsed.drink || "Drink", container: parsed.container || "glass", fill: parsed.fill, capacity_ml: parsed.capacity_ml, ml: Math.round(parsed.ml || 0) });
        }
      } catch {}
    }
  }
  // OpenRouter free vision next, if configured: Gemini's current model
  // returns 402 prepayment credits depleted on the free AI Studio key,
  // so Gemini is not actually free for new users here.
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    for (const orModel of ["google/gemma-3-27b-it:free", "meta-llama/llama-3.2-11b-vision-instruct:free", "qwen/qwen2.5-vl-72b-instruct:free"]) {
      try {
        const or = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + orKey, "HTTP-Referer": "https://thecryptonightt-hub.github.io/Snap-Nutra/", "X-Title": "Snap Nutra" },
          body: JSON.stringify({ model: orModel, temperature: 0, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.startsWith("data:") ? image : "data:image/jpeg;base64," + image } }] }] }) });
        const otxt = await or.text();
        if (or.ok) {
          const oj = JSON.parse(otxt);
          const otext = (oj.choices && oj.choices[0] && oj.choices[0].message && oj.choices[0].message.content) || "";
          const parsed = JSON.parse(String(otext).replace(/```json|```/g, "").trim());
          if (!parsed.error) return res.status(200).json({ drink: parsed.drink || "Drink", container: parsed.container || "glass", fill: parsed.fill, capacity_ml: parsed.capacity_ml, ml: Math.round(parsed.ml || 0) });
        }
      } catch {}
    }
  }
  // Try 2.5-flash first, fall back to older flash models if a model is
  // not available on this free key. Return the upstream error text
  // (no key is ever in it) so a failure can actually be diagnosed.
  let j = null, lastStatus = 0, lastDetail = "", modelErrors = {};
  for (const model of ["gemini-3.8-flash", "gemini-3-flash", "gemini-2.5-flash"]) {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key),
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: b64 } }] }], generationConfig: { temperature: 0 } }) }
    );
    lastStatus = r.status;
    const txt = await r.text();
    if (r.ok) { try { j = JSON.parse(txt); } catch { j = null; } break; }
    lastDetail = txt.slice(0, 300); modelErrors[model] = lastStatus + " " + txt.slice(0, 200);
  }
  if (!j) return res.status(502).json({ error: "vision service failed", status: lastStatus, detail: lastDetail, modelErrors });
  const text = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map(p => p.text || "").join("");
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (parsed.error) return res.status(200).json(parsed);
    return res.status(200).json({ drink: parsed.drink || "Drink", container: parsed.container || "glass", fill: parsed.fill, capacity_ml: parsed.capacity_ml, ml: Math.round(parsed.ml || 0) });
  } catch { return res.status(502).json({ error: "could not parse vision result" }); }
}
