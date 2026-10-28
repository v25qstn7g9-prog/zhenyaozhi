// 針藥誌 — food estimate API (Vercel serverless function).
// POST {image: "data:image/jpeg;base64,..."} or {text: "一碗滷肉飯、一顆滷蛋"}
// → {ok:true, items:[{name, portion, kcal, protein, carbs, fat, fiber}], note}
// The page is static; this is the only server code. It needs GEMINI_API_KEY on the Vercel project.
"use strict";

const DEFAULT_MODEL = "gemini-3.6-flash";
const MAX_IMAGE_CHARS = 3_000_000;   // base64 text; Vercel's request limit is 4.5 MB
const MAX_TEXT = 600;
const HOURLY_LIMIT = 30;             // per IP, per server instance
const TIMEOUT_MS = 40_000;

const hits = new Map(); // ip -> [timestamps]

function envValue(names) {
  for (const [k, v] of Object.entries(process.env)) {
    if (v && v.trim() && names.includes(k.toLowerCase())) return v.trim();
  }
  return "";
}
const apiKey = () => envValue(["gemini_api_key", "google_api_key"]);
const modelName = () => envValue(["gemini_model"]) || DEFAULT_MODEL;

function sameOrigin(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin") return false;
  const origin = req.headers.origin, host = req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function rateLimited(req) {
  const ip = String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length === 0) hits.delete(ip); else hits.set(ip, list);
  if (list.length >= HOURLY_LIMIT) return true;
  list.push(now); hits.set(ip, list);
  return false;
}

const PROMPT = `你是營養師助理。請辨識使用者這一餐吃了哪些食物，估計份量與營養，台灣常見食物請用台灣的份量習慣（例如一個便當、一碗白飯約 200 公克）。
只回覆 JSON，格式：
{"items":[{"name":"食物名稱（繁體中文）","portion":"份量描述，例如 1 碗約 200g","kcal":數字,"protein":克,"carbs":克,"fat":克,"fiber":克}],"note":"一句話說明估計的不確定處，繁體中文"}
規則：
- 每一種看得出來的食物各一項，最多 12 項。看不出份量時用一般一人份估計。
- 數字都是整數或一位小數，不要範圍。
- 不是食物或看不清楚時，回 {"items":[],"note":"原因"}。
- 不要編造照片裡沒有的食物。`;

const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, max) : 0;
};
const str = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

function parseResult(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let raw;
  try { raw = JSON.parse(m[0]); } catch { return null; }
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 12).map((it) => ({
    name: str(it && it.name, 40),
    portion: str(it && it.portion, 40),
    kcal: num(it && it.kcal, 5000),
    protein: num(it && it.protein, 500),
    carbs: num(it && it.carbs, 1000),
    fat: num(it && it.fat, 500),
    fiber: num(it && it.fiber, 200),
  })).filter((it) => it.name);
  return { items, note: str(raw.note, 120) };
}

async function askGemini(key, model, parts, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2000,
          responseMimeType: "application/json",
          ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.json().then((b) => (b && b.error && b.error.message) || "", () => "");
      throw new Error(`gemini_${res.status}${detail ? ": " + String(detail).slice(0, 160) : ""}`);
    }
    const body = await res.json();
    const text = ((body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) || [])
      .map((p) => p.text || "").join("");
    return parseResult(text);
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res, fetchImpl = fetch) {
  const send = (status, obj) => { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(403, { ok: false, error: "forbidden" });
  const key = apiKey();
  if (!key) return send(503, { ok: false, error: "not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  body = body || {};
  const parts = [{ text: PROMPT }];
  if (typeof body.image === "string" && body.image) {
    const m = body.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m || m[2].length > MAX_IMAGE_CHARS) return send(400, { ok: false, error: "invalid_image" });
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    if (typeof body.text === "string" && body.text.trim()) parts.push({ text: "補充說明：" + body.text.trim().slice(0, MAX_TEXT) });
  } else if (typeof body.text === "string" && body.text.trim()) {
    parts.push({ text: "這一餐的描述：" + body.text.trim().slice(0, MAX_TEXT) });
  } else {
    return send(400, { ok: false, error: "empty" });
  }
  if (rateLimited(req)) return send(429, { ok: false, error: "rate_limited" });

  try {
    const result = await askGemini(key, modelName(), parts, fetchImpl);
    if (!result) return send(502, { ok: false, error: "read_failed", reason: "unreadable_reply" });
    return send(200, { ok: true, items: result.items, note: result.note });
  } catch (e) {
    const reason = e && e.name === "AbortError" ? "timeout" : String((e && e.message) || "unknown").slice(0, 200);
    console.error("food estimate failed:", reason);
    return send(502, { ok: false, error: "read_failed", reason });
  }
}

module.exports = handler;
module.exports.handler = handler;
module.exports.parseResult = parseResult;
module.exports._hits = hits;
