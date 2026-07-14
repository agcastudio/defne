/* ============================================================
   PAFTA STUDIO — Gemini Ara Sunucusu (Cloudflare Worker)
   ------------------------------------------------------------
   API anahtarını siteden ve depodan tamamen çıkarır: anahtar
   yalnızca Cloudflare'de "Secret" olarak durur, tarayıcıya inmez.

   KURULUM (5 dakika, ücretsiz):
   1. https://dash.cloudflare.com → hesap açın/girin.
   2. Workers & Pages → Create → Worker → isim verin (örn. pafta-gemini)
      → Deploy.
   3. "Edit code" deyip bu dosyanın TAMAMINI yapıştırın → Deploy.
   4. Worker sayfasında Settings → Variables and Secrets →
      "Add" → Type: Secret → Name: GEMINI_API_KEY →
      Value: yeni Gemini anahtarınız → Save.
   5. Worker adresini (https://pafta-gemini.XXXX.workers.dev)
      sitedeki js/config.js dosyasının proxyUrl alanına yazın.
   ============================================================ */

const ALLOWED_ORIGINS = [
  "https://agcastudio.github.io",
  "http://localhost:8123", // yerel geliştirme
];

const ALLOWED_MODELS = [
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
];

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
    if (!env.GEMINI_API_KEY) return err(500, "Worker'da GEMINI_API_KEY tanımlı değil (Settings → Variables and Secrets).");

    // Model, adresin son parçasından okunur: /gemini-3-pro-image-preview
    const model = decodeURIComponent(
      new URL(request.url).pathname.split("/").filter(Boolean).pop() || ""
    );
    if (!ALLOWED_MODELS.includes(model)) {
      return err(400, "İzin verilmeyen model: " + model);
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: request.body,
      }
    );

    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
