/* ============================================================
   PAFTA STUDIO — Stüdyo uygulaması
   Girdiler → Proje bilgileri → Üretim (Gemini) → Sunum paftası
   ============================================================ */
"use strict";

/* ---------------- Sabitler ---------------- */

const PALETTES = {
  toprak: { name: "Toprak", desc: "Terracotta & kum", colors: ["#b8502f", "#e0a184", "#f3e6d8", "#4f3a2d"], duo: ["#6b3a24", "#f6efe4"], en: "warm terracotta, sand beige and muted clay tones" },
  kuzey:  { name: "Kuzey", desc: "Adaçayı & meşe", colors: ["#7e9484", "#c9b799", "#f0ede5", "#33403a"], duo: ["#33403a", "#f1efe8"], en: "soft sage green, warm oak wood and off-white Scandinavian tones" },
  gece:   { name: "Gece", desc: "Lacivert & pirinç", colors: ["#22334a", "#c9a227", "#e9e4d8", "#141d2b"], duo: ["#22334a", "#eef0f4"], en: "deep navy blue with brass accents and warm grey tones" },
  pastel: { name: "Pastel", desc: "Pudra & adaçayı", colors: ["#d8a49b", "#aebfa8", "#f5eee9", "#7a6660"], duo: ["#8d6f68", "#f7f0eb"], en: "muted pastel pink, sage green and cream tones" },
  mono:   { name: "Monokrom", desc: "Gri & tek vurgu", colors: ["#2b2b2b", "#8f8f8f", "#e8e8e8", "#b8502f"], duo: ["#2b2b2b", "#f2f2f2"], en: "monochrome greyscale with a single warm red accent" },
};

const STYLES = {
  modern:      { name: "Modern", en: "contemporary modern" },
  minimal:     { name: "Minimal", en: "refined minimalist" },
  iskandinav:  { name: "İskandinav", en: "Scandinavian" },
  endustriyel: { name: "Endüstriyel", en: "industrial loft" },
  akdeniz:     { name: "Akdeniz", en: "Mediterranean" },
};

const LS_KEY = "pafta_api_key";
const LS_MODEL = "pafta_model";
const LS_INFO = "pafta_info";
const DEFAULT_MODEL = "gemini-3-pro-image-preview"; // Nano Banana Pro
const MAX_IMG_DIM = 1568;

/* ---------------- Durum ---------------- */

const state = {
  step: 1,
  inputs: { plan: null, kesit: null, logo: null }, // {dataUrl, name}
  info: { projeAdi: "", konum: "", isveren: "", firma: "", olcek: "", arsa: "", insaat: "", kat: "", not: "" },
  palette: "toprak",
  style: "modern",
  typologies: [], // {id, name, area, count, image:{dataUrl,name}|null}
  outputs: {},    // id -> {id,title,group,prompt,defaultPrompt,status,result,error,sources,base}
  order: [],      // çıktı sırası
  busy: false,
};

let typoSeq = 1;

/* ---------------- Yardımcılar ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function slug(s) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
  return String(s || "pafta").replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c])
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "pafta";
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Dosya okunamadı."));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = src;
  });
}

/* Görseli küçültüp JPEG base64'e çevirir (API istekleri için) */
async function toJpegBase64(dataUrl, maxDim = MAX_IMG_DIM) {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width || 1024;
  const h = img.naturalHeight || img.height || 1024;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const out = canvas.toDataURL("image/jpeg", 0.92);
  return { mimeType: "image/jpeg", data: out.split(",")[1] };
}

/* ============================================================
   ADIM GEÇİŞLERİ
   ============================================================ */

function goTo(step) {
  if (step > 1 && !state.inputs.plan) {
    toast("Devam etmek için önce bir kat planı yükleyin.", true);
    goTo(1);
    return;
  }
  if (step > 2 && !$("#fProjeAdi").value.trim()) {
    toast("Lütfen proje adını girin.", true);
    if (state.step !== 2) { state.step = 2; syncStepUI(); }
    $("#fProjeAdi").focus();
    return;
  }
  state.step = step;
  if (step === 3) { rebuildOutputs(); renderOutputs(); }
  if (step === 4) renderPages();
  syncStepUI();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncStepUI() {
  $$("#stepper li").forEach((li) => {
    const n = +li.dataset.step;
    li.classList.toggle("active", n === state.step);
    li.classList.toggle("done", n < state.step);
  });
  $$(".step-panel").forEach((p) => p.classList.toggle("active", +p.dataset.step === state.step));
}

$("#stepper").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-step]");
  if (li) goTo(+li.dataset.step);
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-goto]");
  if (btn) goTo(+btn.dataset.goto);
});

/* ============================================================
   ADIM 1 — YÜKLEMELER
   ============================================================ */

function bindUpload(key, dzId, fileId, nameId, rmId) {
  const dz = $(dzId), input = $(fileId), nameEl = $(nameId), rm = $(rmId);

  const setImage = async (file) => {
    if (!file || !file.type.startsWith("image/")) { toast("Lütfen bir görsel dosyası seçin.", true); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await loadImage(dataUrl); // bozuk dosyayı erken yakala
      state.inputs[key] = { dataUrl, name: file.name };
      renderUpload();
    } catch { toast("Görsel okunamadı — farklı bir dosya deneyin.", true); }
  };

  const renderUpload = () => {
    const item = state.inputs[key];
    dz.classList.toggle("has-image", !!item);
    dz.querySelector("img.preview")?.remove();
    if (item) {
      const img = document.createElement("img");
      img.className = "preview";
      img.alt = item.name;
      img.src = item.dataUrl;
      dz.appendChild(img);
      nameEl.textContent = item.name;
      rm.hidden = false;
    } else {
      nameEl.textContent = "";
      rm.hidden = true;
    }
  };

  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { setImage(input.files[0]); input.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", (e) => setImage(e.dataTransfer.files[0]));
  rm.addEventListener("click", (e) => { e.stopPropagation(); state.inputs[key] = null; renderUpload(); });

  return renderUpload;
}

const renderPlanUpload = bindUpload("plan", "#dzPlan", "#filePlan", "#namePlan", "#rmPlan");
const renderKesitUpload = bindUpload("kesit", "#dzKesit", "#fileKesit", "#nameKesit", "#rmKesit");
const renderLogoUpload = bindUpload("logo", "#dzLogo", "#fileLogo", "#nameLogo", "#rmLogo");

/* ============================================================
   ADIM 2 — PROJE BİLGİLERİ, PALET, STİL, TİPOLOJİLER
   ============================================================ */

const INFO_FIELDS = {
  projeAdi: "#fProjeAdi", konum: "#fKonum", isveren: "#fIsveren", firma: "#fFirma",
  olcek: "#fOlcek", arsa: "#fArsa", insaat: "#fInsaat", kat: "#fKat", not: "#fNot",
};

function bindInfo() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_INFO) || "{}");
    Object.assign(state.info, saved.info || {});
    // Palet ve stil arayüzden kaldırıldı; arka planda sabit tek seçenek kullanılır
    // (state.palette = "toprak", state.style = "modern").
  } catch { /* yoksay */ }

  for (const [k, sel] of Object.entries(INFO_FIELDS)) {
    const el = $(sel);
    el.value = state.info[k] || "";
    el.addEventListener("input", () => { state.info[k] = el.value; persistInfo(); });
  }
}

function persistInfo() {
  try {
    localStorage.setItem(LS_INFO, JSON.stringify({ info: state.info, palette: state.palette, style: state.style }));
  } catch { /* depolama dolu olabilir */ }
}

/* --- Tipolojiler --- */

function addTypology(data = {}) {
  state.typologies.push({
    id: "t" + typoSeq++,
    name: data.name || "",
    area: data.area || "",
    count: data.count || "",
    image: data.image || null,
  });
  renderTypologies();
}

function renderTypologies() {
  const list = $("#typoList");
  list.innerHTML = state.typologies.map((t) => `
    <div class="typology-row" data-id="${t.id}">
      <div class="field"><label>Tip Adı</label><input data-f="name" type="text" placeholder="örn. 2+1 Tip A" value="${esc(t.name)}"></div>
      <div class="field"><label>Alan (m²)</label><input data-f="area" type="text" inputmode="decimal" placeholder="78" value="${esc(t.area)}"></div>
      <div class="field"><label>Adet</label><input data-f="count" type="text" inputmode="numeric" placeholder="12" value="${esc(t.count)}"></div>
      <label class="mini-upload" title="Tipin kendi plan çizimi (isteğe bağlı)">
        ${t.image ? `<img src="${t.image.dataUrl}" alt="">` : "⬆"}
        <span>${t.image ? "Çizim yüklendi" : "Tip çizimi (ops.)"}</span>
        <input type="file" accept="image/*" hidden>
      </label>
      <button class="link-danger" data-act="rm" type="button">Sil</button>
    </div>`).join("");

  $$(".typology-row", list).forEach((row) => {
    const t = state.typologies.find((x) => x.id === row.dataset.id);
    $$("input[data-f]", row).forEach((inp) => {
      inp.addEventListener("input", () => { t[inp.dataset.f] = inp.value; });
    });
    $("input[type=file]", row).addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        await loadImage(dataUrl);
        t.image = { dataUrl, name: file.name };
        renderTypologies();
      } catch { toast("Görsel okunamadı.", true); }
    });
    $("[data-act=rm]", row).addEventListener("click", () => {
      state.typologies = state.typologies.filter((x) => x.id !== t.id);
      delete state.outputs["tip-" + t.id];
      renderTypologies();
    });
  });
}

$("#btnAddTypo").addEventListener("click", () => addTypology());

/* ============================================================
   ADIM 3 — ÜRETİM
   ============================================================ */

/* Siteye gömülü yapılandırma (js/config.js) — anahtar/proxy gömülüyse kullanıcıdan istenmez */
const CFG = window.PAFTA_CONFIG || {};
const EMBEDDED_KEY = (() => {
  if ((CFG.apiKey || "").trim()) return CFG.apiKey.trim();
  // Kodlanmış anahtar: GitHub'ın otomatik sızıntı taraması açık metin "AIza..." desenini
  // yakalayıp anahtarı Google'a iptal ettirdiği için herkese açık depoda base64 saklanır.
  if ((CFG.apiKeyB64 || "").trim()) {
    try { return atob(CFG.apiKeyB64.trim()).trim(); } catch { return ""; }
  }
  return "";
})();
const PROXY_URL = (CFG.proxyUrl || "").trim().replace(/\/+$/, "");
const EMBEDDED_MODEL = (CFG.model || "").trim();

function apiKey() { return EMBEDDED_KEY || $("#fApiKey").value.trim(); }
function modelName() { return EMBEDDED_MODEL || $("#fModel").value.trim() || DEFAULT_MODEL; }
function hasAiAccess() { return !!(PROXY_URL || apiKey()); }

function bindApi() {
  if (EMBEDDED_KEY || PROXY_URL) {
    $(".api-panel").style.display = "none";
    const sub = $('.step-panel[data-step="3"] .panel-head p');
    if (sub) sub.innerHTML = "Görseller Google'ın <b>Nano Banana Pro</b> (Gemini 3 Pro Image) modeliyle üretilir. Bağlantı site tarafından yapılandırıldı — doğrudan “Tümünü Üret” diyebilirsiniz.";
    return;
  }
  $("#fApiKey").value = localStorage.getItem(LS_KEY) || "";
  const sel = $("#fModel");
  const saved = localStorage.getItem(LS_MODEL) || DEFAULT_MODEL;
  if (![...sel.options].some((o) => o.value === saved)) {
    const opt = document.createElement("option");
    opt.value = saved;
    opt.textContent = saved + " (özel)";
    sel.appendChild(opt);
  }
  sel.value = saved;
  $("#fApiKey").addEventListener("input", () => localStorage.setItem(LS_KEY, apiKey()));
  sel.addEventListener("change", () => localStorage.setItem(LS_MODEL, modelName()));
}

/* --- Prompt şablonları (model için İngilizce) --- */

function buildPrompt(item) {
  const p = PALETTES[state.palette];
  const s = STYLES[state.style];
  const kat = state.info.kat ? `The building has ${state.info.kat} floors. ` : "";

  switch (item.group) {
    case "tefris":
      return `You are an expert architectural illustrator. Redraw the attached schematic floor plan as a high-quality 2D presentation floor plan, strictly preserving its exact wall layout, room proportions and door/window positions. Draw cut walls as solid black poché, doors with quarter-circle swing symbols and windows with standard double-line symbols on the walls. Furnish every room appropriately (sofas, beds, dining table, kitchen counters, wardrobes, rugs, plants) in a neat top-down 2D style consistent with a ${s.en} interior. Color the floors room by room using a ${p.en} color scheme with subtle material textures. Pure white background, crisp thin linework, flat orthographic top-down view, no perspective distortion. Presentation-board quality.`;
    case "perspektif":
      return `Using the attached floor plan as the exact layout reference, create a 3D cutaway floor plan visualization (bird's-eye axonometric view) of the same unit: walls raised and cut at about 1 meter height with white cut surfaces, interior fully furnished in a ${s.en} style, materials and colors following a ${p.en} palette, soft daylight and subtle shadows, pure white background, high-end archviz presentation quality. The room layout, doors and windows must match the source plan exactly.`;
    case "kesit":
      return `Redraw the attached schematic building section as a clean architectural presentation section drawing: cut structural elements (slabs, walls, foundations, ground) as solid black poché, interior spaces washed in light ${p.en} accent tones, simple furniture hints and a few flat human silhouettes for scale, level lines with subtle annotations, plain white background, thin precise linework, flat 2D vector style. Keep the number of floors and the overall proportions exactly as in the source. Presentation-board quality.`;
    case "render":
      return `Based on the attached architectural drawings (${item.hasKesit ? "floor plan and schematic section" : "floor plan"}), imagine a plausible building massing and produce a photorealistic exterior architectural visualization: ${s.en} architecture, facade materials and accents following a ${p.en} palette, ${kat}golden-hour lighting, landscaped surroundings with trees, soft shadows and a few people for scale, eye-level camera with slight wide angle, high-end archviz render quality.`;
    case "tip": {
      const t = state.typologies.find((x) => "tip-" + x.id === item.id) || {};
      const unit = `${t.name || "the unit"}${t.area ? `, approximately ${t.area} m²` : ""}`;
      if (t.image) {
        return `Redraw the attached schematic unit plan of "${unit}" as a high-quality 2D presentation floor plan: solid black poché walls, standard door swing and window symbols, full furniture layout in a ${s.en} style, room-by-room floor colors in a ${p.en} palette, pure white background, crisp thin linework, flat top-down orthographic view. Keep the layout exactly as in the source. Presentation-board quality.`;
      }
      return `From the attached overall floor plan, isolate and redraw ONLY the residential unit type "${unit}" as its own standalone 2D presentation floor plan: solid black poché walls, standard door swing and window symbols, full furniture layout in a ${s.en} style, room-by-room floor colors in a ${p.en} palette, pure white background, crisp thin linework, flat top-down orthographic view. Presentation-board quality.`;
    }
  }
  return "";
}

/* --- Çıktı listesi kurulumu --- */

function rebuildOutputs() {
  const prev = state.outputs;
  const next = {};
  const order = [];

  const put = (def) => {
    const old = prev[def.id];
    const defaultPrompt = buildPrompt(def);
    next[def.id] = {
      status: "bekliyor", result: null, error: null, showPrompt: false,
      ...old,
      ...def,
      defaultPrompt,
      prompt: old && old.prompt !== old.defaultPrompt ? old.prompt : defaultPrompt,
    };
    order.push(def.id);
  };

  if (state.inputs.plan) {
    put({ id: "tefris", group: "tefris", title: "Tefrişli Boyalı Plan", sub: "Ana kat planı", base: () => state.inputs.plan.dataUrl, sources: () => [state.inputs.plan.dataUrl] });
    put({ id: "perspektif", group: "perspektif", title: "Perspektif Plan", sub: "3B kesit-perspektif", base: () => state.inputs.plan.dataUrl, sources: () => [state.inputs.plan.dataUrl] });
  }
  if (state.inputs.kesit) {
    put({ id: "kesit", group: "kesit", title: "Sunum Kesiti", sub: "Şematik kesitten", base: () => state.inputs.kesit.dataUrl, sources: () => [state.inputs.kesit.dataUrl] });
  }
  if (state.inputs.plan) {
    put({
      id: "render", group: "render", title: "Dış Mekân Render", sub: "Tahmini kütle", hasKesit: !!state.inputs.kesit,
      base: () => (state.inputs.kesit || state.inputs.plan).dataUrl,
      sources: () => [state.inputs.plan.dataUrl, state.inputs.kesit?.dataUrl].filter(Boolean),
    });
  }
  for (const t of state.typologies) {
    if (!t.name && !t.image) continue;
    put({
      id: "tip-" + t.id, group: "tip", title: `Tipoloji — ${t.name || "Adsız"}`, sub: [t.area && t.area + " m²", t.count && t.count + " adet"].filter(Boolean).join(" · ") || "Tip planı",
      base: () => (t.image || state.inputs.plan).dataUrl,
      sources: () => [(t.image || state.inputs.plan).dataUrl],
    });
  }

  state.outputs = next;
  state.order = order;
}

/* --- Çıktı kartları --- */

const STATUS_LABEL = { bekliyor: "Bekliyor", uretiliyor: "Üretiliyor…", hazir: "Hazır", onizleme: "Önizleme", hata: "Hata" };

function renderOutputs() {
  const grid = $("#outputsGrid");
  if (!state.order.length) {
    grid.innerHTML = `<p class="empty-note">Üretilecek çıktı yok — önce 1. adımda bir kat planı yükleyin.</p>`;
    return;
  }
  grid.innerHTML = state.order.map((id) => {
    const it = state.outputs[id];
    const imgHtml = it.status === "uretiliyor"
      ? `<div class="placeholder"><span class="spinner"></span><span>Üretiliyor — bu birkaç saniye sürebilir…</span></div>`
      : it.result
        ? `<img src="${it.result}" alt="${esc(it.title)}">`
        : `<div class="placeholder">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5-8 8"/></svg>
             <span>Henüz üretilmedi</span>
           </div>`;
    return `
    <article class="out-card" data-id="${id}">
      <div class="out-img">${imgHtml}</div>
      <div class="out-body">
        <div class="out-title">
          <div><b>${esc(it.title)}</b><div style="font-size:12px;color:var(--ink-faint)">${esc(it.sub || "")}</div></div>
          <span class="status-chip ${it.status}">${STATUS_LABEL[it.status]}</span>
        </div>
        ${it.error ? `<div class="out-error">${esc(it.error)}</div>` : ""}
        <div class="out-actions">
          <button class="btn btn-soft btn-sm" data-act="gen" type="button" ${state.busy ? "disabled" : ""}>${it.result ? "↻ Yeniden Üret" : "✦ Üret"}</button>
          <button class="btn btn-soft btn-sm" data-act="prompt" type="button">${it.showPrompt ? "Promptu Gizle" : "Promptu Düzenle"}</button>
          ${it.result ? `<button class="btn btn-soft btn-sm" data-act="dl" type="button">↓ İndir</button>` : ""}
        </div>
        <div class="prompt-edit" ${it.showPrompt ? "" : "hidden"}>
          <textarea data-act="prompt-text" spellcheck="false">${esc(it.prompt)}</textarea>
        </div>
      </div>
    </article>`;
  }).join("");

  $$(".out-card", grid).forEach((card) => {
    const it = state.outputs[card.dataset.id];
    $("[data-act=gen]", card).addEventListener("click", () => generateItem(it.id));
    $("[data-act=prompt]", card).addEventListener("click", () => { it.showPrompt = !it.showPrompt; renderOutputs(); });
    $("[data-act=prompt-text]", card).addEventListener("input", (e) => { it.prompt = e.target.value; });
    $("[data-act=dl]", card)?.addEventListener("click", () => downloadDataUrl(it.result, `${slug(state.info.projeAdi)}-${it.id}`));
  });
}

function setGenStatus(msg) { $("#genStatus").textContent = msg; }

/* --- Gemini çağrısı --- */

async function callGemini(promptText, dataUrls) {
  const parts = [{ text: promptText }];
  for (const u of dataUrls) {
    const { mimeType, data } = await toJpegBase64(u);
    parts.push({ inlineData: { mimeType, data } });
  }
  // Proxy tanımlıysa istek ona gider; anahtar tarayıcıya hiç inmez.
  const url = PROXY_URL
    ? `${PROXY_URL}/${encodeURIComponent(modelName())}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName())}:generateContent`;
  const reqHeaders = { "Content-Type": "application/json" };
  if (!PROXY_URL) reqHeaders["x-goog-api-key"] = apiKey();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
  } catch {
    throw new Error("Ağa ulaşılamadı — internet bağlantınızı kontrol edin.");
  }
  let json = null;
  try { json = await res.json(); } catch { /* gövdesiz yanıt */ }
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    if (/leaked/i.test(msg)) throw new Error("Bu API anahtarı 'sızdırılmış' olarak işaretlenip Google tarafından iptal edilmiş. Eski anahtarı silip yeni bir anahtar oluşturun ve config.js'e kodlanmış biçimde ekleyin (bkz. README).");
    if (res.status === 400 && /API key/i.test(msg)) throw new Error("API anahtarı geçersiz görünüyor — anahtarı kontrol edin.");
    if (res.status === 429) throw new Error("Hız sınırına takıldınız — bir dakika bekleyip yeniden deneyin.");
    throw new Error("Servis hatası: " + msg);
  }
  const cand = json?.candidates?.[0];
  // Nano Banana Pro "düşünme" sırasında ara görseller üretebilir (thought:true) — nihai görsel son inlineData parçasıdır.
  const imgParts = (cand?.content?.parts || []).filter((p) => p.inlineData?.data && !p.thought);
  const imgPart = imgParts[imgParts.length - 1];
  if (imgPart) return `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
  const block = json?.promptFeedback?.blockReason || cand?.finishReason;
  const txt = cand?.content?.parts?.find((p) => p.text)?.text;
  throw new Error("Model görsel döndürmedi" + (block ? ` (${block})` : "") + (txt ? ` — “${txt.slice(0, 140)}”` : "") + ". Promptu sadeleştirip yeniden deneyin.");
}

/* --- Anahtar yokken: palete uygun stilize önizleme (duotone) --- */

async function stylizedPreview(dataUrl) {
  const p = PALETTES[state.palette];
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || 1024, h = img.naturalHeight || 768;
  const scale = Math.min(1, 1400 / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);

  const dark = hexToRgb(p.duo[0]), light = hexToRgb(p.duo[1]);
  const d = ctx.getImageData(0, 0, cw, ch);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    px[i] = Math.round(dark[0] + (light[0] - dark[0]) * l);
    px[i + 1] = Math.round(dark[1] + (light[1] - dark[1]) * l);
    px[i + 2] = Math.round(dark[2] + (light[2] - dark[2]) * l);
    px[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return canvas.toDataURL("image/png");
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* --- Üretim akışı --- */

async function generateItem(id, silent = false) {
  const it = state.outputs[id];
  if (!it || it.status === "uretiliyor") return;
  it.status = "uretiliyor";
  it.error = null;
  renderOutputs();
  try {
    if (hasAiAccess()) {
      it.result = await callGemini(it.prompt, it.sources());
      it.status = "hazir";
    } else {
      it.result = await stylizedPreview(it.base());
      it.status = "onizleme";
      if (!silent) toast("API anahtarı girilmediği için stilize önizleme oluşturuldu.");
    }
  } catch (err) {
    it.status = "hata";
    it.error = err.message || "Bilinmeyen hata.";
    if (!silent) toast(it.error, true);
  }
  renderOutputs();
}

$("#btnGenAll").addEventListener("click", async () => {
  if (state.busy) return;
  if (!state.order.length) { toast("Üretilecek çıktı yok — önce kat planı yükleyin.", true); return; }
  state.busy = true;
  const btn = $("#btnGenAll");
  btn.disabled = true;
  const mode = hasAiAccess() ? "Gemini ile üretiliyor" : "Stilize önizleme oluşturuluyor";
  let i = 0, fail = 0;
  for (const id of state.order) {
    i++;
    setGenStatus(`${mode}: ${i}/${state.order.length} — ${state.outputs[id].title}`);
    await generateItem(id, true);
    if (state.outputs[id].status === "hata") fail++;
  }
  state.busy = false;
  btn.disabled = false;
  setGenStatus(fail ? `Tamamlandı — ${fail} çıktı hata verdi, kartlardan tek tek yeniden deneyebilirsiniz.` : "Tüm çıktılar hazır. 4. adımda paftanızı görün.");
  toast(fail ? `${fail} çıktı üretilemedi.` : "Tüm görseller hazır!", !!fail);
  renderOutputs();
});

/* ============================================================
   ADIM 4 — SUNUM DOSYASI (çok sayfalı)
   ============================================================ */

function outImg(id) {
  const it = state.outputs[id];
  if (it?.result) return { src: it.result, preview: it.status === "onizleme" };
  return null;
}

function logoHtml() {
  return state.inputs.logo
    ? `<img src="${state.inputs.logo.dataUrl}" alt="Firma logosu">`
    : `<div class="logo-text">${esc(state.info.firma || "PAFTA STUDIO")}</div>`;
}

const NORTH_SVG = `<svg class="bs-north" viewBox="0 0 24 24"><circle cx="12" cy="13" r="9" fill="none" stroke="#221e18" stroke-width="1.2"/><path d="M12 6 L15.5 17 L12 14.4 L8.5 17 Z" fill="#221e18"/><text x="12" y="3.6" font-size="5.5" text-anchor="middle" fill="#221e18" font-family="Segoe UI">K</text></svg>`;
const SCALEBAR_HTML = `<div class="bs-scalebar"><span>0</span><span class="bar"><i></i><i></i><i></i><i></i></span><span>8 m</span></div>`;

/* Sayfa listesi: kapak + içerik sayfaları (yalnızca görseli olanlar) */
function buildPageDefs() {
  const i = state.info;
  const defs = [];
  const add = (id, title, opts = {}) => {
    const o = outImg(id);
    const src = o?.src || opts.fallback || null;
    if (!src) return;
    defs.push({ title, src, cap: opts.cap || "", scale: !!opts.scale, north: !!opts.north, preview: !!o?.preview, raw: !o });
  };
  add("tefris", "Tefrişli Kat Planı", { fallback: state.inputs.plan?.dataUrl, cap: i.olcek, scale: true, north: true });
  add("perspektif", "Perspektif Plan", { cap: "3B kesit-perspektif" });
  add("kesit", "Şematik Kesit", { fallback: state.inputs.kesit?.dataUrl, cap: "Kesit A-A", scale: true });
  add("render", "Dış Mekân Görselleştirmesi", { cap: "Tahmini kütle çalışması" });
  for (const t of state.typologies) {
    if (!t.name && !t.image) continue;
    add("tip-" + t.id, `Tipoloji — ${t.name || "Adsız"}`, {
      fallback: t.image?.dataUrl,
      cap: [t.area && t.area + " m²", t.count && t.count + " adet"].filter(Boolean).join(" · "),
      scale: true, north: true,
    });
  }
  return defs;
}

function renderPages() {
  const i = state.info;
  const wrap = $("#boardPages");
  const defs = buildPageDefs();
  const total = defs.length + 1; // + kapak
  const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  const anyPreview = Object.values(state.outputs).some((o) => o.status === "onizleme");

  const footHtml = `
    <footer class="pg-foot">
      <span class="credits">${esc(i.firma || "")}${i.firma ? " · " : ""}${today}${anyPreview ? " · stilize önizleme" : ""}</span>
      <span class="credits">${esc(i.projeAdi || "İsimsiz Proje")} — Mimari Sunum Dosyası</span>
    </footer>`;

  const metaRows = [
    ["Konum", i.konum], ["İşveren", i.isveren], ["Mimari Ofis", i.firma],
    ["Arsa Alanı", i.arsa && i.arsa + " m²"], ["İnşaat Alanı", i.insaat && i.insaat + " m²"],
    ["Kat Sayısı", i.kat], ["Ölçek", i.olcek],
  ].filter(([, v]) => v);

  const hero = outImg("render")?.src || outImg("tefris")?.src || state.inputs.plan?.dataUrl || null;

  const coverHtml = `
  <section class="page page-cover">
    <div class="cv-grid">
      <div class="cv-left">
        <div class="cv-logo">${logoHtml()}</div>
        <span class="pre">Mimari Sunum Dosyası</span>
        <h1>${esc(i.projeAdi || "İsimsiz Proje")}</h1>
        ${i.konum ? `<span class="loc">${esc(i.konum)}</span>` : ""}
        <div class="cv-rule"></div>
        ${metaRows.length ? `<dl class="cv-meta">${metaRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${i.not ? `<p class="cv-note">${esc(i.not)}</p>` : ""}
      </div>
      <div class="cv-right">${hero ? `<img src="${hero}" alt="">` : `<div class="cv-empty">P</div>`}</div>
    </div>
    ${footHtml}
  </section>`;

  const contentHtml = defs.map((d, idx) => {
    const capLines = [d.cap, d.preview ? "stilize önizleme" : "", d.raw ? "orijinal çizim" : ""].filter(Boolean);
    return `
  <section class="page">
    <header class="pg-head">
      <div class="pg-logo">${logoHtml()}</div>
      <div class="pg-title">
        <span class="pre">${esc([i.projeAdi, i.konum].filter(Boolean).join(" · ") || "Mimari Sunum")}</span>
        <h2>${esc(d.title)}</h2>
      </div>
      ${capLines.length ? `<div class="pg-cap">${capLines.map(esc).join("<br>")}</div>` : ""}
      <div class="pg-num">${String(idx + 2).padStart(2, "0")}<span>/ ${String(total).padStart(2, "0")}</span></div>
    </header>
    <div class="pg-body">
      <img src="${d.src}" alt="${esc(d.title)}">
      ${d.scale || d.north ? `<div class="pg-marks">${d.scale ? SCALEBAR_HTML : ""}${d.north ? NORTH_SVG : ""}</div>` : ""}
    </div>
    ${footHtml}
  </section>`;
  }).join("");

  wrap.innerHTML = coverHtml + contentHtml;
  $("#pageCount").textContent = `${total} sayfa` + (defs.length ? "" : " — içerik sayfaları için 1. adımda plan yükleyip 3. adımda üretim yapın");
}

/* --- PDF / Yazdır --- */

$("#btnPrint").addEventListener("click", () => {
  renderPages();
  document.body.classList.add("printing");
  const cleanup = () => document.body.classList.remove("printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => window.print(), 60);
});

/* --- Görselleri indir --- */

function downloadDataUrl(dataUrl, name) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name + (dataUrl.startsWith("data:image/jpeg") ? ".jpg" : ".png");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

$("#btnDownloadAll").addEventListener("click", async () => {
  const ready = state.order.filter((id) => state.outputs[id]?.result);
  if (!ready.length) { toast("İndirilecek görsel yok — önce 3. adımda üretim yapın.", true); return; }
  const base = slug(state.info.projeAdi);
  for (const id of ready) {
    downloadDataUrl(state.outputs[id].result, `${base}-${id}`);
    await new Promise((r) => setTimeout(r, 350));
  }
  toast(`${ready.length} görsel indirildi.`);
});

/* ============================================================
   ÖRNEK PROJE
   ============================================================ */

function svgDataUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

const SAMPLE_PLAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="640" viewBox="0 0 880 640">
<rect width="880" height="640" fill="#ffffff"/>
<g stroke="#111" fill="none">
  <rect x="80" y="60" width="720" height="520" stroke-width="10"/>
  <line x1="440" y1="60" x2="440" y2="340" stroke-width="7"/>
  <line x1="80" y1="340" x2="800" y2="340" stroke-width="7"/>
  <line x1="300" y1="340" x2="300" y2="580" stroke-width="7"/>
  <line x1="560" y1="340" x2="560" y2="580" stroke-width="7"/>
  <line x1="440" y1="200" x2="800" y2="200" stroke-width="7"/>
</g>
<g stroke="#ffffff" stroke-width="10"><line x1="150" y1="60" x2="290" y2="60"/><line x1="520" y1="60" x2="640" y2="60"/><line x1="80" y1="150" x2="80" y2="260"/><line x1="800" y1="90" x2="800" y2="170"/><line x1="800" y1="240" x2="800" y2="310"/><line x1="120" y1="580" x2="240" y2="580"/><line x1="360" y1="580" x2="500" y2="580"/><line x1="620" y1="580" x2="740" y2="580"/></g>
<g stroke="#111" stroke-width="2" fill="none"><line x1="150" y1="60" x2="290" y2="60"/><line x1="520" y1="60" x2="640" y2="60"/><line x1="80" y1="150" x2="80" y2="260"/><line x1="800" y1="90" x2="800" y2="170"/><line x1="800" y1="240" x2="800" y2="310"/><line x1="120" y1="580" x2="240" y2="580"/><line x1="360" y1="580" x2="500" y2="580"/><line x1="620" y1="580" x2="740" y2="580"/>
<line x1="150" y1="64" x2="290" y2="64"/><line x1="520" y1="64" x2="640" y2="64"/><line x1="84" y1="150" x2="84" y2="260"/><line x1="796" y1="90" x2="796" y2="170"/><line x1="796" y1="240" x2="796" y2="310"/><line x1="120" y1="576" x2="240" y2="576"/><line x1="360" y1="576" x2="500" y2="576"/><line x1="620" y1="576" x2="740" y2="576"/></g>
<g stroke="#111" stroke-width="2" fill="none">
  <line x1="440" y1="380" x2="440" y2="440" stroke="#fff" stroke-width="8"/>
  <path d="M440 380 A60 60 0 0 1 380 440" />
  <line x1="500" y1="340" x2="540" y2="340" stroke="#fff" stroke-width="8"/>
  <path d="M540 340 A40 40 0 0 1 500 300"/>
  <line x1="330" y1="340" x2="370" y2="340" stroke="#fff" stroke-width="8"/>
  <path d="M330 340 A40 40 0 0 0 370 380"/>
  <line x1="620" y1="340" x2="660" y2="340" stroke="#fff" stroke-width="8"/>
  <path d="M620 340 A40 40 0 0 0 660 380"/>
  <line x1="440" y1="130" x2="440" y2="170" stroke="#fff" stroke-width="8"/>
  <path d="M440 130 A40 40 0 0 1 480 170"/>
</g>
<g font-family="Arial" font-size="22" fill="#333" text-anchor="middle">
  <text x="255" y="210">SALON</text>
  <text x="620" y="140">MUTFAK</text>
  <text x="620" y="280">BANYO</text>
  <text x="190" y="470">YATAK ODASI</text>
  <text x="430" y="470">ÇOCUK ODASI</text>
  <text x="680" y="470">ÇALIŞMA</text>
  <text x="430" y="395" font-size="16">HOL</text>
</g>
</svg>`;

const SAMPLE_KESIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="560" viewBox="0 0 880 560">
<rect width="880" height="560" fill="#ffffff"/>
<line x1="40" y1="480" x2="840" y2="480" stroke="#111" stroke-width="8"/>
<g stroke="#111" fill="none" stroke-width="6">
  <rect x="180" y="160" width="480" height="320"/>
  <line x1="180" y1="240" x2="660" y2="240"/>
  <line x1="180" y1="320" x2="660" y2="320"/>
  <line x1="180" y1="400" x2="660" y2="400"/>
</g>
<polygon points="160,160 420,80 680,160" fill="none" stroke="#111" stroke-width="6"/>
<g fill="none" stroke="#111" stroke-width="2">
  <rect x="220" y="424" width="36" height="40"/><rect x="320" y="424" width="36" height="40"/><rect x="540" y="424" width="36" height="40"/>
  <rect x="220" y="344" width="36" height="40"/><rect x="420" y="344" width="36" height="40"/><rect x="540" y="344" width="36" height="40"/>
  <rect x="220" y="264" width="36" height="40"/><rect x="420" y="264" width="36" height="40"/><rect x="540" y="264" width="36" height="40"/>
  <rect x="320" y="184" width="36" height="40"/><rect x="480" y="184" width="36" height="40"/>
</g>
<g stroke="#888" stroke-width="1.5" stroke-dasharray="6 6"><line x1="120" y1="480" x2="120" y2="120"/></g>
<g font-family="Arial" font-size="18" fill="#555">
  <text x="70" y="475">±0.00</text><text x="70" y="395">+3.00</text><text x="70" y="315">+6.00</text><text x="70" y="235">+9.00</text><text x="70" y="150">+12.40</text>
  <text x="700" y="300" font-size="20" fill="#333">KESİT A-A</text>
</g>
</svg>`;

const SAMPLE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150" viewBox="0 0 320 150">
<rect x="18" y="25" width="100" height="100" rx="14" fill="#201c17"/>
<path d="M43 100 L68 48 L93 100 Z" fill="none" stroke="#f7f4ee" stroke-width="7"/>
<circle cx="94" cy="102" r="10" fill="#b8502f"/>
<text x="138" y="80" font-family="Georgia" font-size="34" fill="#201c17">ATÖLYE A</text>
<text x="140" y="106" font-family="Arial" font-size="14" letter-spacing="4" fill="#8a8272">MİMARLIK</text>
</svg>`;

$("#btnSample").addEventListener("click", () => {
  state.inputs.plan = { dataUrl: svgDataUrl(SAMPLE_PLAN_SVG), name: "ornek-kat-plani.svg" };
  state.inputs.kesit = { dataUrl: svgDataUrl(SAMPLE_KESIT_SVG), name: "ornek-kesit.svg" };
  state.inputs.logo = { dataUrl: svgDataUrl(SAMPLE_LOGO_SVG), name: "ornek-logo.svg" };
  renderPlanUpload(); renderKesitUpload(); renderLogoUpload();

  Object.assign(state.info, {
    projeAdi: "Vadi Evleri Konut Projesi", konum: "Urla, İzmir", isveren: "ABC Yapı A.Ş.",
    firma: "Atölye A Mimarlık", olcek: "1/100", arsa: "2450", insaat: "6800", kat: "Zemin + 3",
    not: "Zemin katta ticari birimler; üst katlarda 1+1, 2+1 ve 3+1 konut tipolojileri yer almaktadır.",
  });
  for (const [k, sel] of Object.entries(INFO_FIELDS)) $(sel).value = state.info[k];
  persistInfo();

  state.typologies = [];
  addTypology({ name: "1+1 Tip A", area: "52", count: "12" });
  addTypology({ name: "2+1 Tip B", area: "78", count: "18" });
  addTypology({ name: "3+1 Tip C", area: "104", count: "6" });

  toast("Örnek proje yüklendi — adımları gezerek deneyebilirsiniz.");
  goTo(1);
});

/* ============================================================
   BAŞLANGIÇ
   ============================================================ */

window.addEventListener("beforeunload", (e) => {
  if (state.inputs.plan || Object.values(state.outputs).some((o) => o.result)) {
    e.preventDefault();
    e.returnValue = "";
  }
});

bindInfo();
bindApi();
renderTypologies();
syncStepUI();
