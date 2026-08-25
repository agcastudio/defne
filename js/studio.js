/* ============================================================
   PAFTA STUDIO — Stüdyo uygulaması
   Girdiler → Proje bilgileri → Üretim (Gemini) → Sunum paftası
   ============================================================ */
"use strict";

/* ---------------- Sabitler ---------------- */

const PALETTES = {
  toprak: { name: "Toprak", desc: "Terracotta & kum", colors: ["#b8502f", "#e0a184", "#f3e6d8", "#4f3a2d"], duo: ["#6b3a24", "#f6efe4"], en: "warm terracotta, sand beige and muted clay tones" },
  kuzey: { name: "Kuzey", desc: "Adaçayı & meşe", colors: ["#7e9484", "#c9b799", "#f0ede5", "#33403a"], duo: ["#33403a", "#f1efe8"], en: "soft sage green, warm oak wood and off-white Scandinavian tones" },
  gece: { name: "Gece", desc: "Lacivert & pirinç", colors: ["#22334a", "#c9a227", "#e9e4d8", "#141d2b"], duo: ["#22334a", "#eef0f4"], en: "deep navy blue with brass accents and warm grey tones" },
  pastel: { name: "Pastel", desc: "Pudra & adaçayı", colors: ["#d8a49b", "#aebfa8", "#f5eee9", "#7a6660"], duo: ["#8d6f68", "#f7f0eb"], en: "muted pastel pink, sage green and cream tones" },
  mono: { name: "Monokrom", desc: "Gri & tek vurgu", colors: ["#2b2b2b", "#8f8f8f", "#e8e8e8", "#b8502f"], duo: ["#2b2b2b", "#f2f2f2"], en: "monochrome greyscale with a single warm red accent" },
};

const STYLES = {
  modern: { name: "Modern", en: "contemporary modern" },
  minimal: { name: "Minimal", en: "refined minimalist" },
  iskandinav: { name: "İskandinav", en: "Scandinavian" },
  endustriyel: { name: "Endüstriyel", en: "industrial loft" },
  akdeniz: { name: "Akdeniz", en: "Mediterranean" },
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

function primaryPlanKey() {
  for (const k of PLAN_PRIORITY) if (state.inputs.plans[k]) return k;
  return null;
}
function primaryPlan() {
  const k = primaryPlanKey();
  return k ? state.inputs.plans[k] : null;
}
function anyPlan() { return primaryPlan() || state.inputs.plans.vaziyet || null; }

/* Tipolojinin kaynak katı: seçili katlarından planı yüklü ilk kat; yoksa öncelikli kat */
const KAT_TO_PLAN = { "Bodrum Kat": "bodrum", "Zemin Kat": "zemin", "Ara Katlar": "ara", "Son Kat": "son", "Çatı Katı": "cati" };
function tipSourceFloorKey(t) {
  for (const v of t.katlar || []) {
    const k = KAT_TO_PLAN[v];
    if (k && state.inputs.plans[k]) return k;
  }
  return primaryPlanKey();
}

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
const LS_INFO = "pafta_info";
const DEFAULT_MODEL = "gemini-3-pro-image-preview"; // Nano Banana Pro
const MAX_IMG_DIM = 2000; // yoğun planlarda kapı/dış hat detayı kaybolmasın

/* ---------------- Durum ---------------- */

const state = {
  step: 1,
  activePlans: new Set(), // seçilen plan türleri — yalnızca bunların yükleme alanı görünür
  inputs: { plans: {}, kesit: null, logo: null }, // plans[key]/kesit/logo: {dataUrl, name}
  info: { projeAdi: "", konum: "", isveren: "", firma: "", olcek: "", arsa: "", insaat: "", daireAlan: "", ortakAlan: "", kat: "", not: "", kesitNot: "" },
  palette: "toprak",
  style: "modern",
  typologies: [], // {id, name, area, count, image:{dataUrl,name}|null}
  outputs: {},    // id -> {id,title,group,prompt,defaultPrompt,status,result,error,sources,base}
  order: [],      // çıktı sırası
  busy: false,
  analysis: {},   // planKey -> {status, doors:[{x,y,r}], units, common, forUrl, error}
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

/* ---------------- PDF desteği (PDF.js, yerel vendor) ---------------- */

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(new URL("js/vendor/pdfjs.js", document.baseURI).href).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL("js/vendor/pdfjs.worker.js", document.baseURI).href;
      return lib;
    });
  }
  return pdfjsPromise;
}

function isPdf(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

/* PDF'in ilk sayfasını yüksek çözünürlüklü PNG data URL'e çevirir */
async function pdfToDataUrl(file) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, Math.max(1, 2200 / Math.max(base.width, base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // intent: "print" — ekran render'ının requestAnimationFrame beklemesi, sekme
    // arka plandayken sonsuza dek takılabildiği için senkron akışla çiziyoruz.
    await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
    return { dataUrl: canvas.toDataURL("image/png"), pages: pdf.numPages };
  } finally {
    pdf.destroy();
  }
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
    if (!file) return;
    try {
      let dataUrl;
      if (isPdf(file)) {
        toast("PDF görüntüye dönüştürülüyor…");
        const res = await pdfToDataUrl(file);
        dataUrl = res.dataUrl;
        if (res.pages > 1) toast(`PDF ${res.pages} sayfalı — ilk sayfası alındı.`);
      } else if (file.type.startsWith("image/")) {
        dataUrl = await readFileAsDataUrl(file);
        await loadImage(dataUrl); // bozuk dosyayı erken yakala
      } else {
        toast("Lütfen bir görsel ya da PDF dosyası seçin.", true);
        return;
      }
      set({ dataUrl, name: file.name });
      renderUpload();
    } catch { toast("Dosya okunamadı — farklı bir dosya deneyin.", true); }
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
      <input type="file" id="file-${t.key}" accept="image/*,.pdf,application/pdf" hidden>
      <div class="file-actions">
        <span class="file-name" id="name-${t.key}"></span>
        <button class="link-danger" id="rm-${t.key}" type="button" hidden>Kaldır</button>
      </div>
      <div class="an-row" id="an-${t.key}"></div>
    </div>`).join("");

  for (const t of active) {
    const render = setupUpload({
      dz: $("#dz-" + t.key), input: $("#file-" + t.key), nameEl: $("#name-" + t.key), rm: $("#rm-" + t.key),
      get: () => state.inputs.plans[t.key],
      set: (v) => { state.inputs.plans[t.key] = v; delete state.analysis[t.key]; renderAnalysisRows(); },
    });
    render(); // daha önce yüklenmiş görsel varsa önizlemesini geri getir
  }
  renderAnalysisRows();
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
  olcek: "#fOlcek", arsa: "#fArsa", insaat: "#fInsaat", daireAlan: "#fDaire", ortakAlan: "#fOrtak",
  kat: "#fKat", not: "#fNot", kesitNot: "#fKesitNot",
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
    netArea: data.netArea || "",
    brutArea: data.brutArea || "",
    count: data.count || "",
    katlar: data.katlar || [], // seçilen standart katlar (birden çok olabilir)
    dubleks: data.dubleks || false,
    unitUid: data.unitUid || "", // plan analizindeki daire eşleşmesi ("" = otomatik)
  });
  renderTypologies();
}

/* Tipolojinin kaynak katındaki analiz edilmiş daireler için seçenek listesi */
function unitOptionsHtml(t) {
  const k = tipSourceFloorKey(t);
  const a = k ? state.analysis[k] : null;
  let opts = `<option value="">Otomatik (tip adına göre)</option>`;
  if (a?.status === "hazir") {
    for (const u of a.units) {
      opts += `<option value="${esc(u.uid)}" ${t.unitUid === u.uid ? "selected" : ""}>${esc(u.label)}</option>`;
    }
  }
  return opts;
}

/* Tipolojinin alan · adet · dubleks · kat özet satırı */
function typoMeta(t) {
  return [
    t.netArea && "Net " + t.netArea + " m²",
    t.brutArea && "Brüt " + t.brutArea + " m²",
    t.count && t.count + " adet",
    t.dubleks && "Dubleks",
    t.katlar?.length && "Kat: " + t.katlar.join(", "),
  ].filter(Boolean).join(" · ");
}

/* Dubleks tip için en az iki kat seçili olmasını sağlar.
   Tek kat seçiliyse bitişiğindeki katı ekler; hiç seçim yoksa Son Kat + Çatı Katı (çatı dubleksi). */
function ensureDuplexFloors(t) {
  const secili = t.katlar?.length || 0;
  if (secili >= 2) return false;
  const order = KAT_OPTIONS.map((o) => o.value);
  if (secili === 1) {
    const i = order.indexOf(t.katlar[0]);
    const komsu = order[i + 1] || order[i - 1];
    t.katlar = order.filter((v) => v === t.katlar[0] || v === komsu);
  } else {
    t.katlar = ["Son Kat", "Çatı Katı"];
  }
  return true;
}

function renderTypologies() {
  const list = $("#typoList");
  list.innerHTML = state.typologies.map((t) => `
    <div class="typology-row" data-id="${t.id}">
      <div class="typo-grid">
        <div class="field typo-name"><label>Tip Adı</label><input data-f="name" type="text" placeholder="örn. 2+1 Tip A" value="${esc(t.name)}"></div>
        <div class="field"><label>Net Alan (m²)</label><input data-f="netArea" type="text" inputmode="decimal" placeholder="68" value="${esc(t.netArea)}"></div>
        <div class="field"><label>Brüt Alan (m²)</label><input data-f="brutArea" type="text" inputmode="decimal" placeholder="78" value="${esc(t.brutArea)}"></div>
        <div class="field"><label>Adet</label><input data-f="count" type="text" inputmode="numeric" placeholder="12" value="${esc(t.count)}"></div>
        <div class="field field-dubleks"><label>Dubleks</label>
          <label class="check-box check-only" title="Çift katlı (dubleks) daire">
            <input type="checkbox" data-dubleks ${t.dubleks ? "checked" : ""}>
          </label>
        </div>
        <button class="link-danger" data-act="rm" type="button">Sil</button>
      </div>
      <div class="typo-floors">
        <span class="floors-label">Kat(lar)</span>
        <div class="chip-row chip-row-sm">
          ${KAT_OPTIONS.map((o) => `
          <label class="chip chip-sm" title="${o.value}">
            <input type="checkbox" data-kat="${o.value}" ${t.katlar.includes(o.value) ? "checked" : ""}>
            <span>${o.short}</span>
          </label>`).join("")}
        </div>
        <span class="floors-label">Daire</span>
        <select class="typo-unit" data-f="unitUid" title="Plan analizinde tespit edilen dairelerden hangisi bu tip? (1. adımda 'Kapı & daire analizi' çalıştırın)">${unitOptionsHtml(t)}</select>
      </div>
    </div>`).join("");

  $$(".typology-row", list).forEach((row) => {
    const t = state.typologies.find((x) => x.id === row.dataset.id);
    $$("input[data-f], select[data-f]", row).forEach((inp) => {
      inp.addEventListener("input", () => { t[inp.dataset.f] = inp.value; });
    });
    $$("input[data-kat]", row).forEach((cb) => {
      cb.addEventListener("change", () => {
        t.katlar = KAT_OPTIONS
          .filter((o) => row.querySelector(`input[data-kat="${o.value}"]`).checked)
          .map((o) => o.value);
        if (t.dubleks && t.katlar.length < 2 && ensureDuplexFloors(t)) {
          toast("Dubleks tip en az iki katta yer alır — kat seçimi otomatik tamamlandı.");
          renderTypologies();
        }
      });
    });
    $("input[data-dubleks]", row).addEventListener("change", (e) => {
      t.dubleks = e.target.checked;
      if (t.dubleks && ensureDuplexFloors(t)) toast("Dubleks için iki kat otomatik seçildi.");
      renderTypologies();
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
/* Model sabittir: yalnızca Nano Banana Pro kullanılır (config.js'ten farklı model pinlenebilir). */
function modelName() { return EMBEDDED_MODEL || DEFAULT_MODEL; }
function hasAiAccess() { return !!(PROXY_URL || apiKey()); }

function bindApi() {
  if (EMBEDDED_KEY || PROXY_URL) {
    $(".api-panel").style.display = "none";
    const sub = $('.step-panel[data-step="3"] .panel-head p');
    if (sub) sub.innerHTML = "İstediğiniz görseli tek tek ürettirebilir ya da doğrudan “Tümünü Üret” diyebilirsiniz.";
    return;
  }
  $("#fApiKey").value = localStorage.getItem(LS_KEY) || "";
  $("#fApiKey").addEventListener("input", () => localStorage.setItem(LS_KEY, apiKey()));
}

/* ============================================================
   ANALİZ — kapı & daire tespiti, tipoloji izolasyonu, doğrulama
   (js/analysis.js modülü; Gemini çağrıları aynı proxy/anahtar
   düzeniyle yapılır)
   ============================================================ */

PaftaAnalysis.configure({
  // model verilmezse üretim modeli (Nano Banana Pro) kullanılır
  url: (model) => PROXY_URL
    ? `${PROXY_URL}/${encodeURIComponent(model || modelName())}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || modelName())}:generateContent`,
  headers: () => {
    const h = { "Content-Type": "application/json" };
    if (!PROXY_URL) h["x-goog-api-key"] = apiKey();
    return h;
  },
});

/* Plan analizini (kapılar + daireler) çalıştırır; sonucu plan başına önbellekler */
async function ensureAnalysis(k) {
  const plan = state.inputs.plans[k];
  if (!plan) throw new Error("Plan bulunamadı.");
  const existing = state.analysis[k];
  if (existing?.status === "hazir" && existing.forUrl === plan.dataUrl) return existing;
  if (existing?.status === "calisiyor") throw new Error("Analiz zaten sürüyor — bitmesini bekleyin.");
  if (!hasAiAccess()) throw new Error("Analiz için yapay zekâ bağlantısı gerekli.");
  const a = state.analysis[k] = { status: "calisiyor", forUrl: plan.dataUrl, doors: [], units: [], common: [], error: null };
  renderAnalysisRows();
  try {
    const [doors, regionCands] = await Promise.all([
      PaftaAnalysis.detectDoors(plan.dataUrl),
      PaftaAnalysis.detectRegions(plan.dataUrl).catch(() => null), // daire tespiti isteğe bağlı
    ]);
    a.doors = doors;
    if (regionCands) {
      // Aday koşulardan seçim ve yetim parça birleştirme kapı kanıtıyla yapılır
      const regions = PaftaAnalysis.chooseRegions(regionCands, doors);
      if (regions) { a.units = regions.units; a.common = regions.common; }
    }
    a.status = "hazir";
  } catch (err) {
    a.status = "hata";
    a.error = err.message || "Analiz başarısız.";
    throw err;
  } finally {
    renderAnalysisRows();
    renderTypologies();
  }
  return a;
}

function renderAnalysisRows() {
  for (const t of PLAN_TYPES) {
    const el = document.getElementById("an-" + t.key);
    if (!el) continue;
    const plan = state.inputs.plans[t.key];
    if (!plan || !hasAiAccess()) { el.innerHTML = ""; continue; }
    const a = state.analysis[t.key];
    if (a?.status === "calisiyor") {
      el.innerHTML = `<span class="an-status">Analiz ediliyor…</span>`;
    } else if (a?.status === "hazir") {
      el.innerHTML = `
        <span class="an-status ok">✓ ${a.doors.length} kapı${a.units.length ? ` · ${a.units.length} daire` : ""}</span>
        <button class="link-btn" data-an-edit="${t.key}" type="button">✎ Düzenle</button>
        <button class="link-btn" data-an-redo="${t.key}" type="button" title="Tespiti yeniden çalıştır">↻ Yeniden</button>`;
    } else {
      el.innerHTML = `
        <button class="link-btn" data-an-run="${t.key}" type="button">🔍 Kapı &amp; daire analizi</button>
        ${a?.status === "hata" ? `<span class="an-status err">${esc(a.error || "hata")}</span>` : ""}`;
    }
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-an-run], [data-an-edit], [data-an-redo]");
  if (!btn) return;
  const k = btn.dataset.anRun || btn.dataset.anEdit || btn.dataset.anRedo;
  if (btn.dataset.anRedo) delete state.analysis[k]; // tespit yeniden çalışsın
  try {
    const a = await ensureAnalysis(k);
    PaftaAnalysis.openEditor({
      title: (PLAN_TYPES.find((t) => t.key === k)?.name || "Plan") + " — Analiz",
      dataUrl: state.inputs.plans[k].dataUrl,
      doors: a.doors, units: a.units, common: a.common,
      onSave: ({ doors, units }) => {
        a.doors = doors;
        if (units) a.units = units;
        renderAnalysisRows();
        renderTypologies(); // daire seçicileri güncellensin
        toast("Analiz düzenlemeleri kaydedildi.");
      },
    });
  } catch (err) { toast(err.message, true); }
});

/* Tipolojiye karşılık gelen daireyi seçer: kullanıcı seçimi > tip adındaki harf > tek daire */
function pickUnit(a, t) {
  if (!a?.units?.length) return null;
  if (t.unitUid) return a.units.find((u) => u.uid === t.unitUid) || null;
  const m = /tip\s*([a-z])/i.exec(t.name || "");
  if (m) {
    const us = a.units.filter((u) => u.letter === m[1].toUpperCase());
    if (us.length) return us[0];
  }
  return a.units.length === 1 ? a.units[0] : null;
}

/* Üretim öncesi hazırlık: tefriş → kapı işaretli plan; tip → izole edilmiş daire.
   Analiz başarısız olursa eski davranışa düşülür — akış asla kilitlenmez. */
async function prepareTefris(it) {
  const k = it.floorKey;
  let a = null;
  try { a = await ensureAnalysis(k); } catch { /* analizsiz devam */ }
  // Kapı bloğu analiz durumuna göre buildPrompt içinde, dış hat bloğu her zaman eklenir
  it.prompt = buildPrompt(it) + "\n\n" + OUTLINE_ANNOT_EN;
  it._verify = { source: state.inputs.plans[k].dataUrl, doors: a?.doors || [] };
  // Mavi dış hat bandı analizsiz de çizilebilir (yerel hesap); kapılar varsa halkalar da eklenir
  return [await PaftaAnalysis.annotateDoors(state.inputs.plans[k].dataUrl, a?.doors || [], true)];
}

async function prepareTip(it) {
  const t = state.typologies.find((x) => "tip-" + x.id === it.id);
  if (!t) throw new Error("Tipoloji bulunamadı.");
  const k = tipSourceFloorKey(t);
  let a = null;
  if (k) { try { a = await ensureAnalysis(k); } catch { /* eski yola düş */ } }
  const unit = a ? pickUnit(a, t) : null;
  if (unit) {
    const iso = await PaftaAnalysis.isolateUnit(state.inputs.plans[k].dataUrl, unit, a.doors);
    it.prompt = TIP_UNIT_PROMPT + "\n\n" + OUTLINE_ANNOT_EN;
    it._verify = { source: iso.dataUrl, doors: iso.doors };
    return [await PaftaAnalysis.annotateDoors(iso.dataUrl, iso.doors, true)];
  }
  // Eski yol: üretilmiş boyalı plandan ayrıştırma
  it.prompt = buildPrompt(it);
  it._verify = null;
  const srcs = it.sources();
  if (!srcs.length) throw new Error(it.missingMsg || "Kaynak görsel bulunamadı.");
  return srcs;
}

/* ============================================================
   PROMPT ŞABLONLARI — SABİT
   Site kullanıcıları promptları göremez ve düzenleyemez.
   Şablonları değiştirmek için YALNIZCA bu fonksiyonu düzenleyin;
   palet/stil/kat değişkenleri otomatik yerleştirilir.
   ============================================================ */

/* Dış hat bantlı üretimlerde prompt'a eklenen blok */
const OUTLINE_ANNOT_EN = `OUTLINE ANNOTATION — CRITICAL:
- The thick BLUE band drawn on the plan traces the EXACT outer boundary of the building/unit. It is an annotation only — do NOT render the blue band itself; it must not appear in the output.
- The rendered footprint must follow this boundary precisely: every notch, step, angle and balcony edge stays exactly where the blue band shows it. Nothing may be rendered outside the band, and no drawn part inside it may be cut away, shifted or resized.
- NEVER straighten, square up or simplify the boundary. Before finishing, trace the band segment by segment and confirm the rendered outline matches it.`;

/* Kapı işaretli üretimlerde prompt'a eklenen blok */
const DOOR_ANNOT_EN = `DOOR ANNOTATIONS — CRITICAL:
- The RED CIRCLES drawn on the plan are ANNOTATIONS ONLY, marking the position of every door. Do NOT render the red circles themselves — they must not appear in the output.
- At EVERY red-circled position render exactly one clearly visible OPEN wooden door leaf, hinged on the drawn side, swung open ~90° following the drawn swing arc, at the drawn width.
- A doorway at a red circle rendered as blank wall or as an empty opening without a door leaf makes the output INVALID. Before finishing, go circle by circle and confirm each has its door leaf.`;

/* Tipoloji: plandan izole edilmiş TEK dairenin boyanması */
const TIP_UNIT_PROMPT = `This image shows ONE SINGLE APARTMENT UNIT isolated from a residential floor plan — everything outside the unit has been blanked to plain white. Transform this apartment into a photorealistic top-down 3D render (dollhouse-style cutaway, walls cut at ~1.2 m height), viewed from directly above at exactly 90°, orthographic, no perspective.

ABSOLUTE CONSISTENCY RULES — HIGHEST PRIORITY:
- The drawing is ground truth. Reproduce the unit's wall layout EXACTLY: every wall, door, window, room and balcony keeps its exact position, size, proportion, orientation and count. Do NOT add, remove, move, resize or merge anything.
- Preserve the unit's outline geometry exactly as drawn — NEVER straighten, square up, simplify or "correct" it.
- Render ONLY this unit. The blank white surroundings must stay a clean, empty light background: do NOT invent neighboring rooms, corridors, walls or any building parts outside the unit's drawn outline.

${DOOR_ANNOT_EN}

FURNITURE: render ONLY what is drawn — each piece in its drawn position, size and orientation. Interpret symbols correctly: rectangles with pillows are beds, X-crossed rectangles are wardrobes, L-shaped counters are kitchen counters, toilets and washbasins only in bathrooms.

MATERIALS & STYLE — warm terracotta, sand beige and muted clay tones, contemporary modern style: warm light-oak wood flooring in living rooms and bedrooms; sand-beige matte ceramic tile in kitchens, bathrooms, foyers and balconies; matte clay-toned kitchen cabinetry with beige stone countertops; white sanitaryware; upholstered furniture in terracotta and muted clay fabrics; cut wall tops uniform off-white; soft diffused lighting with subtle wall shadows; clean light grey-white background; no text, labels, dimensions or annotations. High-end real estate presentation quality.`;

function buildPrompt(item) {
  const p = PALETTES[state.palette];
  const s = STYLES[state.style];

  switch (item.group) {
    case "tefris": {
      const floorCtx = item.floorEn ? `\n\nFLOOR CONTEXT: This drawing is the ${item.floorEn} plan of the building.` : "";
      const anDoors = state.analysis[item.floorKey];
      const doorAnnot = anDoors?.status === "hazir" && anDoors.doors.length ? `\n\n${DOOR_ANNOT_EN}` : "";
      return `Transform this 2D architectural floor plan into a photorealistic top-down 3D render (dollhouse-style cutaway, walls cut at ~1.2 m height), viewed from directly above at exactly 90°, orthographic view, no perspective or lens distortion.

ABSOLUTE CONSISTENCY RULES — HIGHEST PRIORITY:
- The source drawing is ground truth. Analyze it carefully and reproduce the wall layout EXACTLY: every wall, partition, door and window must keep its exact position, size, orientation and count.
- Do NOT add, remove, move, resize or merge any wall, door, window or room. Do not invent openings that are not drawn.
- Preserve the exact building footprint and outline geometry of the uploaded drawing. If the outline is slanted, angled, trapezoidal, curved or irregular in ANY way, reproduce that geometry precisely — NEVER straighten, square up, simplify or "correct" it.
- If the uploaded plan has symmetry, mirrored wings or repeating units, preserve that arrangement exactly as drawn; if it is asymmetrical, keep it asymmetrical. NEVER impose symmetry that is not drawn, and NEVER break symmetry that is.

DOORS — STRICT RULES, ZERO TOLERANCE:
- Before rendering, scan the ENTIRE plan and count every door-swing arc symbol. The render must contain EXACTLY that many door leaves — not one more, not one fewer.
- Every drawn door-swing arc = one clearly visible door leaf, hinged on the drawn side, opening in the drawn swing direction, at the drawn width.
- A drawn doorway must NEVER be rendered as blank wall, and NEVER as an empty opening without a door leaf. Conversely, never invent a door where no arc is drawn.
- Pay special attention to the SMALL doors of toilets and bathrooms that are entered from inside bedrooms — these are the most commonly missed. Every bathroom and WC must have its drawn entrance door rendered; not a single one may be missing.
- Every enclosed room must be reachable through its drawn door; no room may end up sealed off with no door.
- If the uploaded plan contains mirrored or repeated units, doors must appear consistently in every instance: for each door in one unit, verify that its counterpart exists in every mirrored or repeated twin unit.
- Interior doors: muted clay-toned flat-panel wood, contemporary modern. Apartment entrance doors on the common corridor: slightly darker clay tone to distinguish them.
- FINAL SELF-CHECK before output: go room by room (each bathroom, WC, bedroom, kitchen, apartment entrance) and confirm its door is present exactly as drawn. A single missing door makes the output invalid.

FURNITURE: render ONLY what is drawn — beds, wardrobes, sofas, armchairs, dining tables with chairs, kitchen counters with sinks and cooktops, toilets, washbasins, bathtubs/showers — each in its drawn position and orientation. No extra furniture.

MATERIALS & PALETTE — warm terracotta, sand beige and muted clay tones, contemporary modern style:
- Common corridor, elevator lobby and stair landing: large-format matte porcelain tile flooring in sand beige; stair treads in the same beige stone; muted clay-toned apartment entrance doors.
- Apartment living rooms and bedrooms: warm light-oak wood flooring; sofas and beds upholstered in terracotta and muted clay fabrics; sand-beige walls.
- Kitchens: matte clay-toned cabinetry, beige stone countertops, exactly on the drawn counter runs.
- Bathrooms: sand-beige matte ceramic floor and wall tiles, white sanitaryware exactly as drawn.
- Cut wall tops: uniform neutral off-white so the layout stays readable.

STYLE:
- Straight top-down orthographic camera, no perspective tilt, but walls have slight visible height and thickness, casting soft subtle shadows onto the floors — like a physical scale model photographed from above.
- Light, airy, warm neutral palette overall: pale floors, cream-white wall tops, natural light wood door frames and furniture accents.
- Fully furnished with realistic rendered furniture: upholstered beds with soft duvets and layered pillows, fabric sofas with cushions, wooden dining table with chairs, wardrobes, kitchen counters with sink and cooktop, WC, washbasin, bathtub — all with real material textures (linen, wood, ceramic).
- Render ALL doors in the OPEN position: each door leaf stands open (swung about 90 degrees, following the swing direction drawn in the source plan), so every doorway reads as an open passage and room connections are clearly visible. Do not render any door closed, and do not remove the door leaves — they stay visible, just open.
- Small styling details: potted plants, area rugs under seating groups, muted olive-green accent pillows.
- Soft diffused ambient lighting, gentle realistic shadows, no harsh highlights.
- Clean light grey-white background around the plan, no text labels, no dimensions.
- High-end real estate presentation quality, calm and elegant atmosphere.${floorCtx}${doorAnnot}`;
    }
    case "vaziyet":
      return `You are an expert architectural illustrator. Redraw the attached schematic site plan as a high-quality architectural presentation site plan (top-down view): building footprints shown as roof plans with subtle drop shadows, landscaped surroundings with trees drawn as top-view canopies, pathways, roads and parking areas, ground textures (grass, paving, water if present) in a ${p.en} color scheme, property boundary clearly marked with a dashed line. Keep the site layout, building positions and proportions exactly as in the source. Clean white background outside the site, thin precise linework, flat orthographic top-down view. Presentation-board quality.`;
    case "perspektif":
      return `Convert the attached top-down rendered floor plan into an ANGLED ISOMETRIC 3D cutaway view of the same floor — a dollhouse-style axonometric render viewed from an elevated corner angle (approximately 30-45 degrees), the kind used in high-end real estate presentations.

CAMERA & FORM:
- The camera is positioned at ONE CORNER of the building, elevated about 30-45 degrees, looking diagonally ACROSS the plan — a true three-quarter corner view where TWO adjacent sides are clearly visible. NEVER render a straight top-down view or a frontal view; the diagonal corner angle is mandatory.
- Isometric / axonometric projection, no lens distortion, no fisheye — parallel lines stay parallel.
- Walls rise to a uniform cut height (about 1 meter equivalent), cleanly cut at the top with a flat white cap, so every room interior stays fully visible.
- Furniture becomes true 3D objects with correct height and proportions: beds, sofas, tables, chairs, wardrobes, kitchen counters, sanitary fixtures.
- Soft realistic lighting from above, gentle ambient occlusion in room corners, subtle shadows cast by walls and furniture.
- Clean light grey-white background, no text labels.

ABSOLUTE FIDELITY RULES — change ONLY the camera angle:
- The wall layout, room shapes, proportions and apartment boundaries must remain EXACTLY as in the source image. Do not add, remove, move or resize any wall.
- Every door and window stays in its exact position with the same width. Do not add or remove any.
- Every piece of furniture stays in the SAME position, SAME orientation and SAME size as in the source — no additions, no removals, no rearranging, no restyling.
- All floor materials remain identical to the source: the same warm light-oak wood flooring in living rooms and bedrooms, the same sand-beige matte ceramic tiles in kitchens, bathrooms, foyers, halls and balconies, and the same sand-beige matte porcelain tile flooring in the common corridor, elevator lobby and stair landing.
- The color palette, furniture styling and overall atmosphere must match the source image exactly.
- This is the SAME floor plan and SAME render, only rotated into an isometric perspective — not a reinterpretation.`;
    case "kesit":
      return `Redraw the attached schematic building section as a clean architectural presentation section drawing: cut structural elements (slabs, walls, foundations, ground) as solid black poché, interior spaces washed in light ${p.en} accent tones, simple furniture hints and a few flat human silhouettes for scale, level lines with subtle annotations, plain white background, thin precise linework, flat 2D vector style. Keep the number of floors and the overall proportions exactly as in the source. Presentation-board quality.`;
    case "render": {
      const katRule = state.info.kat
        ? `- FLOOR COUNT — taken from the project information: the building has "${state.info.kat}" floors (Turkish floor naming: "Bodrum" = basement level below grade, "Zemin" = ground floor, "Ara" / "Normal" = typical upper floors, "Çatı" = roof level; e.g. "Zemin + 3" means a ground floor plus 3 upper floors). Work out the exact number of ABOVE-GROUND storeys from this and build the facade with EXACTLY that many visible floor levels — count the horizontal rows of windows/balconies to verify. Not one more, not one fewer. Basement levels stay below grade and are not visible on the facade.`
        : `- FLOOR COUNT: no floor count is given in the project information; render a realistic low-to-mid-rise residential building with a clearly countable number of storeys.`;
      return `The attached image is the rendered top-down floor plan (colored and furnished) of one full storey of this building. Use it as the DIRECT BASE for the design and produce a PHOTOREALISTIC exterior architectural visualization of the completed building.

ABSOLUTE CONSISTENCY RULES — HIGHEST PRIORITY:
- FOOTPRINT: the building's ground footprint must follow the OUTER OUTLINE of the attached plan exactly — same overall shape, same proportions, same corner geometry. If the outline is slanted, angled, L/U-shaped, stepped or irregular in ANY way, the built mass must show that same geometry. NEVER simplify or square it up into a plain box, and never change its proportions.
${katRule}
- FACADE FROM THE PLAN: derive the facade layout from the plan — place generous windows where the plan shows living rooms and bedrooms along the outer edge, and place balconies on the facade exactly where the plan shows balconies/terraces, repeated on the residential floors. The building entrance sits on the side where the plan's common core (stair / elevator hall) reaches the outer edge.
- FINAL SELF-CHECK before output: recount the storeys on the facade and re-compare the massing footprint with the plan's outer boundary. A wrong floor count or a changed footprint makes the output invalid.

STYLE & MATERIALS: ${s.en} architecture; facade materials and accents following a ${p.en} palette — warm sand-beige plaster and natural stone, terracotta and muted clay accent panels, natural wood soffits at balconies and the entrance canopy, slim dark window frames, glass balcony railings.

PHOTOREALISM — this must read as a real photograph of a finished building, not an illustration: golden-hour sunlight with physically plausible soft shadows and reflections, subtle material texture (plaster grain, stone joints, glass reflections), landscaped surroundings with trees and low planting, paved sidewalk and street, a few people and a parked car for scale, eye-level camera from across the street with a slight wide angle showing two facades in a three-quarter view, sharp architectural detail, high-end archviz quality. No text, labels or watermarks.`;
    }
    case "tipper":
      return `Convert the attached top-down rendered plan of a SINGLE apartment unit into an ANGLED ISOMETRIC 3D cutaway view of the same unit — a dollhouse-style axonometric render viewed from an elevated corner angle (approximately 30-45 degrees), the kind used in high-end real estate presentations.

CAMERA & FORM:
- The camera is positioned at ONE CORNER of the unit, elevated about 30-45 degrees, looking diagonally ACROSS the unit — a true three-quarter corner view where TWO adjacent sides of the unit are clearly visible. NEVER render a straight top-down view, a frontal view or a flat elevation; the diagonal corner angle is mandatory.
- Isometric / axonometric projection, no lens distortion, no fisheye — parallel lines stay parallel.
- Walls rise to a uniform cut height (about 1 meter equivalent), cleanly cut at the top with a flat white cap, so every room interior stays fully visible.
- Furniture becomes true 3D objects with correct height and proportions: beds, sofas, tables, chairs, wardrobes, kitchen counters, sanitary fixtures.
- Soft realistic lighting from above, gentle ambient occlusion in room corners, subtle shadows cast by walls and furniture.
- Clean light grey-white background, no text labels.

ABSOLUTE FIDELITY RULES — change ONLY the camera angle:
- The unit's wall layout, room shapes, proportions, outline and balconies must remain EXACTLY as in the source image. Do not add, remove, move or resize any wall.
- Every door and window stays in its exact position with the same width; doors stay open exactly as in the source. Do not add or remove any.
- Every piece of furniture stays in the SAME position, SAME orientation and SAME size as in the source — no additions, no removals, no rearranging, no restyling.
- All floor materials and the color palette remain identical to the source.
- Render ONLY this unit — do NOT invent neighboring rooms, corridors or any other building parts around it.
- This is the SAME unit and SAME render, only rotated into an isometric perspective — not a reinterpretation.`;
    case "tip": {
      const t = state.typologies.find((x) => "tip-" + x.id === item.id) || {};
      const katEnList = (t.katlar || []).map((v) => KAT_OPTIONS.find((o) => o.value === v)?.en).filter(Boolean);
      const alanTxt = t.netArea
        ? `, approximately ${t.netArea} m² net area${t.brutArea ? ` (${t.brutArea} m² gross)` : ""}`
        : (t.brutArea ? `, approximately ${t.brutArea} m² gross area` : "");
      const unit = `${t.name || "the unit"}${t.dubleks ? " (duplex)" : ""}${alanTxt}${katEnList.length ? `, located on ${katEnList.join(" and ")}` : ""}`;
      const duplexTxt = t.dubleks
        ? " This is a DUPLEX unit spanning two levels connected by an internal staircase: draw BOTH levels side by side as two separate plans (lower level on the left, upper level on the right), each fully furnished, with the connecting staircase clearly shown in the same position on both levels."
        : "";
      return `STEP 1 — ANALYZE THE RENDERED PLAN FIRST (do this BEFORE drawing anything):
The attached image is the rendered (colored and furnished) top-down plan of one FULL floor of a residential building. Study it slowly and thoroughly.
- FIRST, DETECT EVERY DOOR: locate every rendered door leaf and doorway on the floor. Doors are the PRIMARY KEY for reading the plan.
- The doors opening from the shared corridor / stair-elevator core are the APARTMENT ENTRANCE doors. The area those doors open FROM is the COMMON AREA; everything reached BEHIND one entrance door is ONE private apartment.
- Confirm the boundaries with the material difference too: the common area has different flooring than the apartment interiors.
- Determine how many apartments exist on the floor and trace each apartment's exact boundary.

STEP 2 — TRACE THE TARGET UNIT'S BOUNDARY WITH ZERO TOLERANCE:
- An apartment consists of ALL rooms reachable from its single entrance door without re-entering the common area — its hall, living room, bedrooms, kitchen, bathrooms/WC and its balconies.
- The boundary follows the apartment's enclosing walls exactly. NEVER cut through a room, NEVER include any part of the common corridor/stair/elevator core, NEVER include rooms of a neighboring apartment, and NEVER leave out a room that belongs to the unit.
- If several apartments of the same type exist on the floor (e.g., mirrored twins), select exactly ONE representative instance.

STEP 3 — OUTPUT: extract and present ONLY the residential unit type "${unit}" as its own standalone top-down render: keep EXACTLY the same rendering style, materials, colors, furniture placement and lighting as the source image — as if the unit were cleanly cut out along its boundary walls and presented alone, re-centered on a clean light grey-white background, no text labels. Every door and window of the unit found in the analysis must be present.${duplexTxt} High-end real estate presentation quality.`;
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
    next[def.id] = {
      status: "bekliyor", result: null, error: null, enabled: true, report: null,
      ...old,
      ...def,
      // Promptlar sabittir; her kurulumda buildPrompt() şablonundan tazelenir.
      prompt: buildPrompt(def),
    };
    order.push(def.id);
  };

  const plans = state.inputs.plans;

  // Her yüklenen plan için: boyalı plan + (vaziyet hariç) hemen ardından o katın
  // perspektif planı. Perspektif, aynı katın boyaması "hazır" ise onu ikinci
  // referans görsel olarak alır (renk/tefriş birebir aktarılsın diye).
  for (const t of PLAN_TYPES) {
    if (!plans[t.key]) continue;
    const k = t.key;
    if (k === "vaziyet") {
      put({ id: "tefris-vaziyet", group: "vaziyet", title: "Vaziyet Planı", sub: "Sunum vaziyet planı", base: () => plans.vaziyet.dataUrl, sources: () => [plans.vaziyet.dataUrl] });
      continue;
    }
    put({ id: "tefris-" + k, group: "tefris", floorEn: t.en, floorKey: k, prep: "tefris", title: t.name, sub: "Tefrişli boyalı plan", base: () => plans[k].dataUrl, sources: () => [plans[k].dataUrl] });
    put({
      id: "perspektif-" + k, group: "perspektif", floorEn: t.en,
      title: t.name.replace(" Planı", " Perspektif Planı"),
      sub: "3B kesit-perspektif",
      base: () => (state.outputs["tefris-" + k]?.result || state.inputs.plans[k].dataUrl),
      // Perspektif, YALNIZCA üretilen boyalı plan üzerinden oluşturulur.
      sources: () => {
        const boyama = state.outputs["tefris-" + k];
        return boyama?.status === "hazir" && boyama.result ? [boyama.result] : [];
      },
      missingMsg: "Önce bu katın boyalı planı üretilmeli — perspektif, üretilen boyalı plan üzerinden oluşturulur.",
    });
  }

  const prim = primaryPlan();
  if (state.inputs.kesit) {
    put({ id: "kesit", group: "kesit", title: "Sunum Kesiti", sub: "Şematik kesitten", base: () => state.inputs.kesit.dataUrl, sources: () => [state.inputs.kesit.dataUrl] });
  }
  if (prim) {
    put({
      id: "render", group: "render", title: "Dış Mekân Render", sub: "Boyalı plandan fotogerçekçi dış görsel",
      base: () => {
        const k = primaryPlanKey();
        return state.outputs["tefris-" + k]?.result || state.inputs.plans[k].dataUrl;
      },
      // Girdi: ana katın ÜRETİLMİŞ boyalı planı (perspektif/tipoloji ile aynı mantık);
      // kat sayısı prompt'a proje künyesindeki "Kat Sayısı" alanından eklenir.
      sources: () => {
        const k = primaryPlanKey();
        const boyama = state.outputs["tefris-" + k];
        return boyama?.status === "hazir" && boyama.result ? [boyama.result] : [];
      },
      missingMsg: "Önce ana katın boyalı planı üretilmeli — dış render, boyalı plan altlık alınarak oluşturulur.",
    });
  }
  for (const t of state.typologies) {
    if (!t.name || !prim) continue; // tip planı, ilgili katın boyamasından türetilir
    const tt = t;
    put({
      id: "tip-" + tt.id, group: "tip", prep: "tip", title: `Tipoloji — ${tt.name}`, sub: typoMeta(tt) || "Tip planı",
      base: () => {
        const k = tipSourceFloorKey(tt);
        return state.outputs["tefris-" + k]?.result || state.inputs.plans[k].dataUrl;
      },
      // Girdi: ilgili katın ÜRETİLMİŞ boyalı planı (perspektifle aynı mantık)
      sources: () => {
        const k = tipSourceFloorKey(tt);
        const boyama = state.outputs["tefris-" + k];
        return boyama?.status === "hazir" && boyama.result ? [boyama.result] : [];
      },
      missingMsg: "Önce ilgili katın boyalı planı üretilmeli — tipoloji planı, kat boyaması üzerinden ayrıştırılır.",
    });
    // Tipin 3B kesit-perspektifi — üretilen tip planı üzerinden oluşturulur
    put({
      id: "tipper-" + tt.id, group: "tipper",
      title: `Tipoloji Perspektif — ${tt.name}`, sub: "3B kesit-perspektif",
      base: () => {
        const r = state.outputs["tip-" + tt.id]?.result;
        if (r) return r;
        const k = tipSourceFloorKey(tt);
        return k ? state.inputs.plans[k].dataUrl : null;
      },
      sources: () => {
        const tip = state.outputs["tip-" + tt.id];
        return tip?.status === "hazir" && tip.result ? [tip.result] : [];
      },
      missingMsg: "Önce bu tipin planı üretilmeli — perspektif, üretilen tip planı üzerinden oluşturulur.",
    });
  }

  state.outputs = next;
  state.order = order;
}

/* --- Çıktı kartları --- */

const STATUS_LABEL = { bekliyor: "Bekliyor", uretiliyor: "Üretiliyor…", hazir: "Hazır", onizleme: "Önizleme", hata: "Hata" };

function renderOutputs() {
  const pick = $("#pickList");
  const grid = $("#outputsGrid");

  if (!state.order.length) {
    pick.innerHTML = `<p class="empty-note" style="padding:24px 12px; grid-column:1/-1">Üretilecek çıktı yok — önce 1. adımda en az bir plan yükleyin.</p>`;
    grid.innerHTML = "";
    return;
  }

  /* Kompakt seçim listesi: tüm olası çıktılar, işaretle/çıkar + tekil üretim */
  pick.innerHTML = state.order.map((id) => {
    const it = state.outputs[id];
    const st = it.status !== "bekliyor" ? `<span class="status-chip ${it.status}">${STATUS_LABEL[it.status]}</span>` : "";
    const busyRow = state.busy || it.status === "uretiliyor";
    return `
    <div class="pick-row ${it.enabled ? "" : "off"}" data-id="${id}">
      <label class="check-box check-only pick-check" title="${it.enabled ? "Üretimden çıkar" : "Üretime ekle"}">
        <input type="checkbox" data-enable ${it.enabled ? "checked" : ""}>
      </label>
      <div class="pick-info"><b>${esc(it.title)}</b><span>${esc(it.sub || "")}</span></div>
      ${st}
      <button class="btn btn-soft btn-sm" data-act="gen" type="button" ${!it.enabled || busyRow ? "disabled" : ""}>${it.result ? "↻" : "✦"} Üret</button>
    </div>`;
  }).join("");

  $$(".pick-row", pick).forEach((row) => {
    const it = state.outputs[row.dataset.id];
    $("input[data-enable]", row).addEventListener("change", (e) => { it.enabled = e.target.checked; renderOutputs(); });
    $("[data-act=gen]", row).addEventListener("click", () => generateItem(it.id));
  });

  /* Kartlar yalnızca üretimi başlamış/bitmiş görseller için oluşur */
  const visible = state.order.filter((id) => state.outputs[id].status !== "bekliyor");
  grid.innerHTML = visible.map((id) => {
    const it = state.outputs[id];
    const imgHtml = it.status === "uretiliyor"
      ? `<div class="placeholder"><span class="spinner"></span><span>Üretiliyor — bu birkaç saniye sürebilir…</span></div>`
      : it.result
        ? `<img src="${it.result}" alt="${esc(it.title)}">`
        : `<div class="placeholder">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span>Üretilemedi</span>
           </div>`;
    return `
    <article class="out-card" data-id="${id}">
      <div class="out-img">${imgHtml}</div>
      <div class="out-body">
        <div class="out-title">
          <div><b>${esc(it.title)}</b><div style="font-size:12px;color:var(--ink-faint)">${esc(it.sub || "")}</div></div>
          <span class="status-chip ${it.status}">${STATUS_LABEL[it.status]}</span>
        </div>
        ${it.report ? `
        <div class="verify-line ${it.report.verdict}">
          <span>${it.report.verdict === "uyumlu" ? "✓" : "⚠"} Dış hat %${(it.report.iou * 100).toFixed(1)} — ${esc(it.report.label)}</span>
          <button class="link-btn" data-act="ovl" type="button">⇆ Overlay</button>
        </div>` : ""}
        ${it.error ? `<div class="out-error">${esc(it.error)}</div>` : ""}
        <div class="out-actions">
          <button class="btn btn-soft btn-sm" data-act="gen" type="button" ${state.busy || !it.enabled ? "disabled" : ""}>${it.result ? "↻ Yeniden Üret" : "✦ Üret"}</button>
          ${it.result ? `<button class="btn btn-soft btn-sm" data-act="dl" type="button">↓ İndir</button>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");

  $$(".out-card", grid).forEach((card) => {
    const it = state.outputs[card.dataset.id];
    $("[data-act=gen]", card).addEventListener("click", () => generateItem(it.id));
    $("[data-act=dl]", card)?.addEventListener("click", () => downloadDataUrl(it.result, `${slug(state.info.projeAdi)}-${it.id}`));
    $("[data-act=ovl]", card)?.addEventListener("click", (ev) => {
      const imgEl = $(".out-img img", card);
      if (!imgEl || !it.report) return;
      const showing = imgEl.dataset.ovl === "1";
      imgEl.src = showing ? it.result : it.report.overlay;
      imgEl.dataset.ovl = showing ? "" : "1";
      ev.target.textContent = showing ? "⇆ Overlay" : "⇆ Sonuç";
    });
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
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { imageSize: "4K" }, // Nano Banana Pro: 4K çıktı
        },
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
  throw new Error("Model görsel döndürmedi" + (block ? ` (${block})` : "") + (txt ? ` — “${txt.slice(0, 140)}”` : "") + ". Yeniden deneyin.");
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
  if (!it || it.status === "uretiliyor" || !it.enabled) return;
  it.status = "uretiliyor";
  it.error = null;
  renderOutputs();
  try {
    if (hasAiAccess()) {
      let srcs;
      if (it.prep === "tefris") srcs = await prepareTefris(it);
      else if (it.prep === "tip") srcs = await prepareTip(it);
      else {
        srcs = it.sources();
        if (!srcs.length) throw new Error(it.missingMsg || "Kaynak görsel bulunamadı.");
      }
      it.result = await callGemini(it.prompt, srcs);
      it.status = "hazir";
      it.report = null;
      if (it._verify) {
        try {
          it.report = await PaftaAnalysis.verifyResult(it._verify.source, it._verify.doors, it.result);
        } catch { /* doğrulama üretimi engellemez */ }
        // Dış hat belirgin bozuksa BİR kez otomatik yeniden üretilir; iyi olan tutulur
        if (it.report?.verdict === "bozuk") {
          setGenStatus(`${it.title}: dış hat sapması algılandı — otomatik olarak bir kez yeniden üretiliyor…`);
          try {
            const second = await callGemini(it.prompt, srcs);
            const rep2 = await PaftaAnalysis.verifyResult(it._verify.source, it._verify.doors, second);
            if (rep2.iou > it.report.iou) { it.result = second; it.report = rep2; }
          } catch { /* ilk sonuç kalır */ }
        }
      }
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
  const targets = state.order.filter((id) => state.outputs[id].enabled);
  if (!targets.length) { toast("Üretim için işaretli görsel yok — listeden en az birini işaretleyin.", true); return; }
  state.busy = true;
  const btn = $("#btnGenAll");
  btn.disabled = true;
  const mode = hasAiAccess() ? "Gemini ile üretiliyor" : "Stilize önizleme oluşturuluyor";
  let i = 0, fail = 0;
  for (const id of targets) {
    i++;
    setGenStatus(`${mode}: ${i}/${targets.length} — ${state.outputs[id].title}`);
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
    if (t.key !== "vaziyet") {
      add("perspektif-" + t.key, t.name.replace(" Planı", " Perspektif Planı"), { cap: "3B kesit-perspektif" });
    }
  }
  add("kesit", "Şematik Kesit", { fallback: state.inputs.kesit?.dataUrl, cap: "Kesit A-A", scale: true, note: i.kesitNot });
  add("render", "Dış Mekân Görselleştirmesi", { cap: "Boyalı plan altlıklı kütle çalışması" });
  // Tipoloji paftaları: sağda plan, sol üstte perspektif, sol altta bilgi tablosu
  for (const t of state.typologies) {
    if (!t.name) continue;
    const o = outImg("tip-" + t.id);
    if (!o?.src) continue;
    defs.push({
      title: `Tipoloji — ${t.name}`, src: o.src, cap: i.olcek || "",
      note: "", scale: true, north: true, preview: !!o.preview, raw: false,
      tipo: t, persp: outImg("tipper-" + t.id)?.src || null,
    });
  }
  return defs;
}

/* Tipoloji paftasındaki bilgi tablosu */
function tipoTableHtml(t) {
  const rows = [
    ["Tip Adı", t.name],
    ["Net Alan", t.netArea && t.netArea + " m²"],
    ["Brüt Alan", t.brutArea && t.brutArea + " m²"],
    ["Adet", t.count && t.count + " adet"],
    ["Kat(lar)", t.katlar?.length ? t.katlar.join(", ") : ""],
    ["Daire Tipi", t.dubleks ? "Dubleks" : "Tek Kat"],
  ].filter(([, v]) => v);
  return `<table class="tp-table"><tbody>${rows.map(([k, v]) =>
    `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
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
    ["Toplam Daire Alanı", i.daireAlan && i.daireAlan + " m²"],
    ["Toplam Ortak Alan", i.ortakAlan && i.ortakAlan + " m²"],
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
    // Tipoloji paftası: sol üstte perspektif, altında bilgi tablosu, sağda plan.
    // Not varsa: sol şeritte büyük puntolu bilgi panosu + sağda çizim.
    const bodyHtml = d.tipo
      ? `<div class="pg-body pg-split pg-tipo">
           <aside class="tp-left">
             <div class="tp-persp">${d.persp
               ? `<img src="${d.persp}" alt="Tipoloji perspektifi">`
               : `<div class="tp-empty">3B perspektif üretilmedi — 3. adımda "Tipoloji Perspektif" çıktısını üretin</div>`}</div>
             <div class="tp-info">
               <span class="sn-head">Tipoloji Bilgileri</span>
               ${tipoTableHtml(d.tipo)}
             </div>
           </aside>
           <div class="pg-img-area">${imgHtml}${marksHtml}</div>
         </div>`
      : d.note
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
    firma: "Atölye A Mimarlık", olcek: "1/100", arsa: "2450", insaat: "6800",
    daireAlan: "6500", ortakAlan: "300", kat: "Zemin + 3",
    not: "Zemin katta ticari birimler; üst katlarda 1+1, 2+1 ve 3+1 konut tipolojileri yer almaktadır.",
    kesitNot: "Müteahhit payı: %50\nMal sahibi payı: %50\n\nToplam inşaat alanı: 6800 m²\nToplam ortak alan: 300 m²\n\nZemin kat yüksekliği: 4.50 m\nNormal kat yüksekliği: 3.00 m\nÇatı mahyası: +12.40",
  });
  for (const [k, sel] of Object.entries(INFO_FIELDS)) $(sel).value = state.info[k];
  persistInfo();

  state.typologies = [];
  addTypology({ name: "1+1 Tip A", netArea: "45", brutArea: "52", count: "12", katlar: ["Zemin Kat", "Ara Katlar"] });
  addTypology({ name: "2+1 Tip B", netArea: "68", brutArea: "78", count: "18", katlar: ["Ara Katlar"] });
  addTypology({ name: "3+1 Tip C", netArea: "89", brutArea: "104", count: "6", katlar: ["Son Kat", "Çatı Katı"], dubleks: true });

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
