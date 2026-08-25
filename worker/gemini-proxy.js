/* ============================================================
   PAFTA STUDIO — Gemini Ara Sunucusu (Cloudflare Worker)
   ------------------------------------------------------------
   API anahtarını siteden ve depodan tamamen çıkarır.

   KURULUM: Bu dosyanın TAMAMINI Cloudflare worker editörüne
   yapıştırın, aşağıdaki GEMINI_API_KEY satırındaki tırnakların
   arasına anahtarınızı yazın → Deploy.
   (Settings → Variables and Secrets'ta GEMINI_API_KEY tanımlıysa
   satırı boş bırakabilirsiniz; Secret öncelikli değil — kod
   içindeki boşsa Secret kullanılır.)
   ============================================================ */

// Anahtar: tırnakların arasına yapıştırın (örn. "AIza...").
// Boş bırakılırsa Cloudflare Secret'taki GEMINI_API_KEY kullanılır.
const GEMINI_API_KEY = "";

const ALLOWED_ORIGINS = [
  "https://agcastudio.github.io",
  "http://localhost:8123", // yerel geliştirme
];

// Yalnızca Gemini model adlarına izin verilir (görsel üretimi + tespit).
// Google model adlarını zamanla emekliye ayırdığı için sabit liste yerine
// desen kullanılır; site, güncel tespit modelini kendisi deneyerek bulur.
const ALLOWED_MODEL_RE = /^gemini-[a-z0-9.-]+$/i;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const originAllowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originAllowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const err = (status, message) =>
      new Response(JSON.stringify({ error: { code: status, message } }), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return err(405, "Yalnızca POST istekleri kabul edilir.");
    if (!originAllowed) return err(403, "Bu kaynaktan (origin) erişime izin verilmiyor.");

    const key = GEMINI_API_KEY || (env && env.GEMINI_API_KEY) || "";
    if (!key) return err(500, "API anahtarı tanımlı değil — worker kodundaki GEMINI_API_KEY satırına anahtarınızı yazın.");

    // Model, adresin son parçasından okunur: /gemini-3-pro-image-preview
    const model = decodeURIComponent(
      new URL(request.url).pathname.split("/").filter(Boolean).pop() || ""
    );
    if (!ALLOWED_MODEL_RE.test(model)) {
      return err(400, "İzin verilmeyen model: " + model);
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: request.body,
      }
    );

    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
