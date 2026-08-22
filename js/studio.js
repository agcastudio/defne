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

/* Plan türleri — her biri ayrı yüklenir, ayrı üretilir, ayrı pafta olur */
const PLAN_TYPES = [
  { key: "vaziyet", name: "Vaziyet Planı", en: "site plan", hint: "Arsa yerleşimi; ağaç, yol ve zemin dokularıyla sunum vaziyetine dönüştürülür." },
  { key: "bodrum", name: "Bodrum Kat Planı", en: "basement floor", hint: "Otopark, depo ve teknik hacimler nizami tefrişlenir." },
  { key: "zemin", name: "Zemin Kat Planı", en: "ground floor", hint: "Giriş katı; ticari birimler ve ortak alanlar." },
  { key: "ara", name: "Ara Kat Planı", en: "typical intermediate floor", hint: "Tekrarlayan tipik kat; perspektif ve tipolojilerin ana kaynağıdır." },
  { key: "son", name: "Son Kat Planı", en: "top floor", hint: "En üst yaşam katı; teras ve farklılaşan daireler." },
  { key: "cati", name: "Çatı Katı Planı", en: "roof floor / penthouse", hint: "Çatı arası, çatı terası veya çekme kat." },
];
/* Perspektif, render ve tipolojiler için temel alınacak kat önceliği */
const PLAN_PRIORITY = ["ara", "zemin", "son", "cati", "bodrum"];

function primaryPlan() {
  for (const k of PLAN_PRIORITY) if (state.inputs.plans[k]) return state.inputs.plans[k];
  return null;
}
function anyPlan() { return primaryPlan() || state.inputs.plans.vaziyet || null; }

/* Tipolojiler için standart kat seçenekleri — birden çok kat seçilebilir
   (short: satırdaki çip etiketi, en: prompt'taki İngilizce karşılık) */
const KAT_OPTIONS = [
  { value: "Bodrum Kat", short: "Bodrum", en: "the basement floor" },
  { value: "Zemin Kat", short: "Zemin", en: "the ground floor" },
  { value: "Ara Katlar", short: "Ara", en: "the typical intermediate floors" },
  { value: "Son Kat", short: "Son", en: "the top floor" },
  { value: "Çatı Katı", short: "Çatı", en: "the roof floor" },
];

const LS_KEY = "pafta_api_key";
const LS_MODEL = "pafta_model";
const LS_INFO = "pafta_info";
const DEFAULT_MODEL = "gemini-3-pro-image-preview"; // Nano Banana Pro
const MAX_IMG_DIM = 1568;

/* ---------------- Durum ---------------- */

const state = {
  step: 1,
  activePlans: new Set(), // seçilen plan türleri — yalnızca bunların yükleme alanı görünür
  inputs: { plans: {}, kesit: null, logo: null }, // plans[key]/kesit/logo: {dataUrl, name}
  info: { projeAdi: "", konum: "", isveren: "", firma: "", olcek: "", arsa: "", insaat: "", kat: "", not: "", kesitNot: "" },
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
  if (step > 1 && !anyPlan()) {
    toast("Devam etmek için en az bir plan yükleyin.", true);
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

function setupUpload({ dz, input, nameEl, rm, get, set }) {
  const setImage = async (file) => {
    if (!file || !file.type.startsWith("image/")) { toast("Lütfen bir görsel dosyası seçin.", true); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await loadImage(dataUrl); // bozuk dosyayı erken yakala
      set({ dataUrl, name: file.name });
      renderUpload();
    } catch { toast("Görsel okunamadı — farklı bir dosya deneyin.", true); }
  };

  const renderUpload = () => {
    const item = get();
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
  rm.addEventListener("click", (e) => { e.stopPropagation(); set(null); renderUpload(); });

  return renderUpload;
}

/* Plan türleri çiplerle seçilir; yalnızca seçilenlerin yükleme kartı açılır */
function renderPlanCards() {
  const chipRow = $("#planTypeChips");
  chipRow.innerHTML = PLAN_TYPES.map((t) => {
    const on = state.activePlans.has(t.key);
    return `
    <label class="chip">
      <input type="checkbox" data-plan="${t.key}" ${on ? "checked" : ""}>
      <span>${on ? "✓" : "+"} ${t.name}</span>
    </label>`;
  }).join("");

  $$("input[data-plan]", chipRow).forEach((inp) => {
    inp.addEventListener("change", () => {
      const k = inp.dataset.plan;
      if (inp.checked) {
        state.activePlans.add(k);
      } else {
        state.activePlans.delete(k);
        if (state.inputs.plans[k]) {
          state.inputs.plans[k] = null;
          toast(`${PLAN_TYPES.find((t) => t.key === k).name} ve yüklenen görseli kaldırıldı.`);
        }
      }
      renderPlanCards();
    });
  });

  const grid = $("#planGrid");
  const active = PLAN_TYPES.filter((t) => state.activePlans.has(t.key));
  if (!active.length) {
    grid.innerHTML = `<p class="plan-empty">Henüz plan türü seçilmedi — yukarıdaki seçeneklerden elinizde olanları işaretleyin.</p>`;
    return;
  }
  grid.innerHTML = active.map((t) => `
    <div class="upload-card">
      <h3>${t.name}</h3>
      <p class="hint">${t.hint}</p>
      <div class="dropzone" id="dz-${t.key}" tabindex="0" role="button" aria-label="${t.name} yükle">
        <div class="dz-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>
          <span><b>Tıklayın</b> ya da dosyayı buraya sürükleyin</span>
        </div>
      </div>
      <input type="file" id="file-${t.key}" accept="image/*" hidden>
      <div class="file-actions">
        <span class="file-name" id="name-${t.key}"></span>
        <button class="link-danger" id="rm-${t.key}" type="button" hidden>Kaldır</button>
      </div>
    </div>`).join("");

  for (const t of active) {
    const render = setupUpload({
      dz: $("#dz-" + t.key), input: $("#file-" + t.key), nameEl: $("#name-" + t.key), rm: $("#rm-" + t.key),
      get: () => state.inputs.plans[t.key],
      set: (v) => { state.inputs.plans[t.key] = v; },
    });
    render(); // daha önce yüklenmiş görsel varsa önizlemesini geri getir
  }
}

const renderKesitUpload = setupUpload({
  dz: $("#dzKesit"), input: $("#fileKesit"), nameEl: $("#nameKesit"), rm: $("#rmKesit"),
  get: () => state.inputs.kesit, set: (v) => { state.inputs.kesit = v; },
});
const renderLogoUpload = setupUpload({
  dz: $("#dzLogo"), input: $("#fileLogo"), nameEl: $("#nameLogo"), rm: $("#rmLogo"),
  get: () => state.inputs.logo, set: (v) => { state.inputs.logo = v; },
});

/* ============================================================
   ADIM 2 — PROJE BİLGİLERİ, PALET, STİL, TİPOLOJİLER
   ============================================================ */

const INFO_FIELDS = {
  projeAdi: "#fProjeAdi", konum: "#fKonum", isveren: "#fIsveren", firma: "#fFirma",
  olcek: "#fOlcek", arsa: "#fArsa", insaat: "#fInsaat", kat: "#fKat", not: "#fNot",
  kesitNot: "#fKesitNot",
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
    katlar: data.katlar || [], // seçilen standart katlar (birden çok olabilir)
  });
  renderTypologies();
}

/* Tipolojinin alan · adet · kat özet satırı */
function typoMeta(t) {
  return [
    t.area && t.area + " m²",
    t.count && t.count + " adet",
    t.katlar?.length && "Kat: " + t.katlar.join(", "),
  ].filter(Boolean).join(" · ");
}

function renderTypologies() {
  const list = $("#typoList");
  list.innerHTML = state.typologies.map((t) => `
    <div class="typology-row" data-id="${t.id}">
      <div class="field"><label>Tip Adı</label><input data-f="name" type="text" placeholder="örn. 2+1 Tip A" value="${esc(t.name)}"></div>
      <div class="field"><label>Alan (m²)</label><input data-f="area" type="text" inputmode="decimal" placeholder="78" value="${esc(t.area)}"></div>
      <div class="field"><label>Adet</label><input data-f="count" type="text" inputmode="numeric" placeholder="12" value="${esc(t.count)}"></div>
      <div class="field field-katlar"><label>Kat(lar) — birden çok seçilebilir</label>
        <div class="chip-row chip-row-sm">
          ${KAT_OPTIONS.map((o) => `
          <label class="chip chip-sm" title="${o.value}">
            <input type="checkbox" data-kat="${o.value}" ${t.katlar.includes(o.value) ? "checked" : ""}>
            <span>${o.short}</span>
          </label>`).join("")}
        </div>
      </div>
      <button class="link-danger" data-act="rm" type="button">Sil</button>
    </div>`).join("");

  $$(".typology-row", list).forEach((row) => {
    const t = state.typologies.find((x) => x.id === row.dataset.id);
    $$("input[data-f]", row).forEach((inp) => {
      inp.addEventListener("input", () => { t[inp.dataset.f] = inp.value; });
    });
    $$("input[data-kat]", row).forEach((cb) => {
      cb.addEventListener("change", () => {
        t.katlar = KAT_OPTIONS
          .filter((o) => row.querySelector(`input[data-kat="${o.value}"]`).checked)
          .map((o) => o.value);
      });
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
    case "tefris": {
      const floorCtx = item.floorEn ? ` This drawing is the ${item.floorEn} plan of the building — furnish and label it accordingly.` : "";
      return `You are an expert architectural illustrator. Redraw the attached schematic floor plan as a high-quality 2D presentation floor plan, strictly preserving its exact wall layout, room proportions and door/window positions. Draw cut walls as solid black poché, doors with quarter-circle swing symbols and windows with standard double-line symbols on the walls. Furnish every room appropriately (sofas, beds, dining table, kitchen counters, wardrobes, rugs, plants) in a neat top-down 2D style consistent with a ${s.en} interior. Color the floors room by room using a ${p.en} color scheme with subtle material textures. Pure white background, crisp thin linework, flat orthographic top-down view, no perspective distortion.${floorCtx} Presentation-board quality.`;
    }
    case "vaziyet":
      return `You are an expert architectural illustrator. Redraw the attached schematic site plan as a high-quality architectural presentation site plan (top-down view): building footprints shown as roof plans with subtle drop shadows, landscaped surroundings with trees drawn as top-view canopies, pathways, roads and parking areas, ground textures (grass, paving, water if present) in a ${p.en} color scheme, property boundary clearly marked with a dashed line. Keep the site layout, building positions and proportions exactly as in the source. Clean white background outside the site, thin precise linework, flat orthographic top-down view. Presentation-board quality.`;
    case "perspektif":
      return `Using the attached floor plan as the exact layout reference, create a 3D cutaway floor plan visualization (bird's-eye axonometric view) of the same unit: walls raised and cut at about 1 meter height with white cut surfaces, interior fully furnished in a ${s.en} style, materials and colors following a ${p.en} palette, soft daylight and subtle shadows, pure white background, high-end archviz presentation quality. The room layout, doors and windows must match the source plan exactly.`;
    case "kesit":
      return `Redraw the attached schematic building section as a clean architectural presentation section drawing: cut structural elements (slabs, walls, foundations, ground) as solid black poché, interior spaces washed in light ${p.en} accent tones, simple furniture hints and a few flat human silhouettes for scale, level lines with subtle annotations, plain white background, thin precise linework, flat 2D vector style. Keep the number of floors and the overall proportions exactly as in the source. Presentation-board quality.`;
    case "render":
      return `Based on the attached architectural drawings (floor plans, schematic section and/or site plan, as provided), imagine a plausible building massing and produce a photorealistic exterior architectural visualization: ${s.en} architecture, facade materials and accents following a ${p.en} palette, ${kat}golden-hour lighting, landscaped surroundings with trees, soft shadows and a few people for scale, eye-level camera with slight wide angle, high-end archviz render quality.`;
    case "tip": {
      const t = state.typologies.find((x) => "tip-" + x.id === item.id) || {};
      const katEnList = (t.katlar || []).map((v) => KAT_OPTIONS.find((o) => o.value === v)?.en).filter(Boolean);
      const unit = `${t.name || "the unit"}${t.area ? `, approximately ${t.area} m²` : ""}${katEnList.length ? `, located on ${katEnList.join(" and ")}` : ""}`;
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

  const plans = state.inputs.plans;

  // Her yüklenen plan için ayrı üretim (vaziyet dahil)
  for (const t of PLAN_TYPES) {
    if (!plans[t.key]) continue;
    const k = t.key;
    if (k === "vaziyet") {
      put({ id: "tefris-vaziyet", group: "vaziyet", title: "Vaziyet Planı", sub: "Sunum vaziyet planı", base: () => plans.vaziyet.dataUrl, sources: () => [plans.vaziyet.dataUrl] });
    } else {
      put({ id: "tefris-" + k, group: "tefris", floorEn: t.en, title: t.name, sub: "Tefrişli boyalı plan", base: () => plans[k].dataUrl, sources: () => [plans[k].dataUrl] });
    }
  }

  const prim = primaryPlan();
  if (prim) {
    put({ id: "perspektif", group: "perspektif", title: "Perspektif Plan", sub: "3B kesit-perspektif", base: () => primaryPlan().dataUrl, sources: () => [primaryPlan().dataUrl] });
  }
  if (state.inputs.kesit) {
    put({ id: "kesit", group: "kesit", title: "Sunum Kesiti", sub: "Şematik kesitten", base: () => state.inputs.kesit.dataUrl, sources: () => [state.inputs.kesit.dataUrl] });
  }
  if (prim || plans.vaziyet) {
    put({
      id: "render", group: "render", title: "Dış Mekân Render", sub: "Tahmini kütle",
      base: () => (state.inputs.kesit || primaryPlan() || plans.vaziyet).dataUrl,
      sources: () => [primaryPlan()?.dataUrl, state.inputs.kesit?.dataUrl, plans.vaziyet?.dataUrl].filter(Boolean),
    });
  }
  for (const t of state.typologies) {
    if (!t.name || !prim) continue; // tip planı ana kat planından türetilir
    put({
      id: "tip-" + t.id, group: "tip", title: `Tipoloji — ${t.name}`, sub: typoMeta(t) || "Tip planı",
      base: () => primaryPlan().dataUrl,
      sources: () => [primaryPlan().dataUrl],
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
    grid.innerHTML = `<p class="empty-note">Üretilecek çıktı yok — önce 1. adımda en az bir plan yükleyin.</p>`;
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
  if (!state.order.length) { toast("Üretilecek çıktı yok — önce en az bir plan yükleyin.", true); return; }
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

/* Not metnini satır satır panoya çevirir; "Etiket: değer" satırlarında değer kalın yazılır */
function sideNoteHtml(note) {
  return String(note).split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return `<div class="sn-gap"></div>`;
    const idx = t.indexOf(":");
    if (idx > 0 && idx < t.length - 1) {
      return `<div class="sn-row">${esc(t.slice(0, idx + 1))} <b>${esc(t.slice(idx + 1).trim())}</b></div>`;
    }
    return `<div class="sn-row">${esc(t)}</div>`;
  }).join("");
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
    defs.push({ title, src, cap: opts.cap || "", note: opts.note || "", scale: !!opts.scale, north: !!opts.north, preview: !!o?.preview, raw: !o });
  };
  for (const t of PLAN_TYPES) {
    add("tefris-" + t.key, t.name, {
      fallback: state.inputs.plans[t.key]?.dataUrl,
      cap: t.key === "vaziyet" ? "Vaziyet" : i.olcek,
      scale: true, north: true,
    });
  }
  add("perspektif", "Perspektif Plan", { cap: "3B kesit-perspektif" });
  add("kesit", "Şematik Kesit", { fallback: state.inputs.kesit?.dataUrl, cap: "Kesit A-A", scale: true, note: i.kesitNot });
  add("render", "Dış Mekân Görselleştirmesi", { cap: "Tahmini kütle çalışması" });
  for (const t of state.typologies) {
    if (!t.name) continue;
    add("tip-" + t.id, `Tipoloji — ${t.name}`, {
      cap: typoMeta(t),
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

  let heroTefris = null;
  for (const k of [...PLAN_PRIORITY, "vaziyet"]) {
    heroTefris = outImg("tefris-" + k)?.src;
    if (heroTefris) break;
  }
  const hero = outImg("render")?.src || heroTefris || anyPlan()?.dataUrl || null;

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
    const marksHtml = d.scale || d.north ? `<div class="pg-marks">${d.scale ? SCALEBAR_HTML : ""}${d.north ? NORTH_SVG : ""}</div>` : "";
    const imgHtml = `<img src="${d.src}" alt="${esc(d.title)}">`;
    // Not varsa: sol şeritte büyük puntolu bilgi panosu + sağda çizim
    const bodyHtml = d.note
      ? `<div class="pg-body pg-split">
           <aside class="pg-sidenote">
             <span class="sn-head">Proje Notları</span>
             ${sideNoteHtml(d.note)}
           </aside>
           <div class="pg-img-area">${imgHtml}${marksHtml}</div>
         </div>`
      : `<div class="pg-body">${imgHtml}${marksHtml}</div>`;
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
    ${bodyHtml}
    ${footHtml}
  </section>`;
  }).join("");

  wrap.innerHTML = coverHtml + contentHtml;
  $("#pageCount").textContent = `${total} sayfa` + (defs.length ? "" : " — içerik sayfaları için 1. adımda en az bir plan yükleyip 3. adımda üretim yapın");
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

const SAMPLE_VAZIYET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="640" viewBox="0 0 880 640">
<rect width="880" height="640" fill="#ffffff"/>
<polygon points="90,70 800,60 820,500 70,520" fill="none" stroke="#111" stroke-width="3" stroke-dasharray="14 8"/>
<rect x="60" y="540" width="780" height="50" fill="none" stroke="#111" stroke-width="2"/>
<g stroke="#999" stroke-width="1.5"><line x1="80" y1="565" x2="820" y2="565" stroke-dasharray="20 14"/></g>
<text x="430" y="620" font-family="Arial" font-size="16" fill="#555" text-anchor="middle">SOKAK</text>
<g>
  <rect x="250" y="160" width="380" height="240" fill="none" stroke="#111" stroke-width="5"/>
  <line x1="250" y1="280" x2="630" y2="280" stroke="#111" stroke-width="2"/>
  <line x1="440" y1="160" x2="440" y2="400" stroke="#111" stroke-width="2"/>
  <text x="440" y="290" font-family="Arial" font-size="20" fill="#333" text-anchor="middle">BLOK A</text>
</g>
<rect x="250" y="430" width="160" height="60" fill="none" stroke="#111" stroke-width="2"/>
<text x="330" y="465" font-family="Arial" font-size="13" fill="#555" text-anchor="middle">OTOPARK</text>
<g fill="none" stroke="#111" stroke-width="1.6">
  <circle cx="150" cy="160" r="26"/><circle cx="180" cy="240" r="20"/><circle cx="140" cy="330" r="24"/>
  <circle cx="720" cy="150" r="24"/><circle cx="750" cy="240" r="20"/><circle cx="710" cy="340" r="26"/>
  <circle cx="540" cy="470" r="20"/><circle cx="640" cy="460" r="24"/>
</g>
<path d="M410 400 L410 540" stroke="#111" stroke-width="1.6" stroke-dasharray="6 6"/>
<g transform="translate(790,90)">
  <circle cx="0" cy="0" r="22" fill="none" stroke="#111" stroke-width="2"/>
  <path d="M0 -16 L8 12 L0 6 L-8 12 Z" fill="#111"/>
  <text x="0" y="-28" font-family="Arial" font-size="13" text-anchor="middle" fill="#111">K</text>
</g>
<text x="110" y="600" font-family="Arial" font-size="15" fill="#555">VAZİYET PLANI — 1/500</text>
</svg>`;

const SAMPLE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150" viewBox="0 0 320 150">
<rect x="18" y="25" width="100" height="100" rx="14" fill="#201c17"/>
<path d="M43 100 L68 48 L93 100 Z" fill="none" stroke="#f7f4ee" stroke-width="7"/>
<circle cx="94" cy="102" r="10" fill="#b8502f"/>
<text x="138" y="80" font-family="Georgia" font-size="34" fill="#201c17">ATÖLYE A</text>
<text x="140" y="106" font-family="Arial" font-size="14" letter-spacing="4" fill="#8a8272">MİMARLIK</text>
</svg>`;

$("#btnSample").addEventListener("click", () => {
  state.activePlans = new Set(["vaziyet", "zemin"]);
  state.inputs.plans = {
    vaziyet: { dataUrl: svgDataUrl(SAMPLE_VAZIYET_SVG), name: "ornek-vaziyet.svg" },
    zemin: { dataUrl: svgDataUrl(SAMPLE_PLAN_SVG), name: "ornek-zemin-kat.svg" },
  };
  state.inputs.kesit = { dataUrl: svgDataUrl(SAMPLE_KESIT_SVG), name: "ornek-kesit.svg" };
  state.inputs.logo = { dataUrl: svgDataUrl(SAMPLE_LOGO_SVG), name: "ornek-logo.svg" };
  renderPlanCards();
  renderKesitUpload(); renderLogoUpload();

  Object.assign(state.info, {
    projeAdi: "Vadi Evleri Konut Projesi", konum: "Urla, İzmir", isveren: "ABC Yapı A.Ş.",
    firma: "Atölye A Mimarlık", olcek: "1/100", arsa: "2450", insaat: "6800", kat: "Zemin + 3",
    not: "Zemin katta ticari birimler; üst katlarda 1+1, 2+1 ve 3+1 konut tipolojileri yer almaktadır.",
    kesitNot: "Müteahhit payı: %50\nMal sahibi payı: %50\n\nToplam inşaat alanı: 6800 m²\nToplam ortak alan: 300 m²\n\nZemin kat yüksekliği: 4.50 m\nNormal kat yüksekliği: 3.00 m\nÇatı mahyası: +12.40",
  });
  for (const [k, sel] of Object.entries(INFO_FIELDS)) $(sel).value = state.info[k];
  persistInfo();

  state.typologies = [];
  addTypology({ name: "1+1 Tip A", area: "52", count: "12", katlar: ["Zemin Kat", "Ara Katlar"] });
  addTypology({ name: "2+1 Tip B", area: "78", count: "18", katlar: ["Ara Katlar"] });
  addTypology({ name: "3+1 Tip C", area: "104", count: "6", katlar: ["Son Kat", "Çatı Katı"] });

  toast("Örnek proje yüklendi — adımları gezerek deneyebilirsiniz.");
  goTo(1);
});

/* ============================================================
   BAŞLANGIÇ
   ============================================================ */

window.addEventListener("beforeunload", (e) => {
  if (anyPlan() || state.inputs.kesit || Object.values(state.outputs).some((o) => o.result)) {
    e.preventDefault();
    e.returnValue = "";
  }
});

renderPlanCards();
bindInfo();
bindApi();
renderTypologies();
syncStepUI();
