/* ============================================================
   PAFTA STUDIO — Analiz modülü
   Kapı tespiti, ortak alan / daire tipi tespiti (Gemini vision),
   kapı işaretleme, tipoloji izolasyonu ve üretim doğrulaması
   (dış hat IoU + overlay). Tamamen tarayıcıda çalışır; Gemini
   çağrıları studio.js'in yapılandırdığı adres üzerinden gider.
   ============================================================ */
"use strict";

window.PaftaAnalysis = (() => {
  let transport = null; // { url: () => string, headers: () => object }

  const DETECT_PROMPT = `You are analyzing a 2D architectural floor plan drawing (it may be the full plan or a cropped part of it). Find EVERY door-swing symbol: a quarter-circle arc (with its door leaf line) showing a door and its swing direction. Include ALL of them: interior room doors, bathroom and WC doors, apartment entrance doors, balcony doors. Work systematically: scan the drawing area by area (every bedroom, every bathroom/WC, kitchen, hall, balcony and the corridor) so no door is missed — the small bathroom/WC doors are the most commonly missed. Do not report curves that are not door swings (toilets, sinks, round tables).

Return ONLY a JSON array, no explanations, no code fences:
[{"box_2d": [ymin, xmin, ymax, xmax]}, ...]
Coordinates are integers normalized to 0-1000 relative to THIS image's height and width. One box per door symbol, tight around the swing arc.`;

  const REGION_PROMPT = `This image is the floor plan of ONE full storey of a residential building. Work step by step:

STEP 1 — Find the shared stair core, elevator and the shared corridor/landing. Find every apartment ENTRANCE door that opens from this shared space. The number of apartments on this floor EQUALS the number of entrance doors — no more, no fewer.

STEP 2 — For each apartment, walk through its entrance door and collect EVERY space reachable through interior doors: entrance hall, living room, kitchen, every bedroom, every bathroom/WC, storage, AND its balconies/terraces (a balcony belongs to the apartment whose rooms open onto it — balconies are NEVER left out and NEVER common area). Apartments are usually NOT rectangles — they interlock around the core. NEVER split one apartment into several units just because its rooms form separate visual clusters, and NEVER merge two apartments.

MERGE RULE — a candidate unit that has NO entrance door of its own opening from the common area is NOT a separate apartment — it is part of the apartment it connects to through interior doors or a private hall; merge it into that apartment.

STEP 3 — COMMON AREA is ONLY the shared circulation: the corridor/landing the entrance doors open from, the stair core, the elevator shaft and shared service shafts. A hall, corridor or bathroom INSIDE an apartment is NOT common area.

STEP 4 — Group the apartments into types: identical or mirrored layouts share the SAME type letter ("A", "B", ...); different layouts get different letters.

OUTPUT — ONLY a JSON list, no explanations, no code fences. ONE ENTRY PER ROOM/SPACE:
{"unit": "1" | "2" | ... | "common", "type": "A" | "B" | ... , "box_2d": [ymin, xmin, ymax, xmax], "name": "living room" | "bedroom" | "bathroom" | "kitchen" | "hall" | "balcony" | "corridor" | "stairs" | "elevator" | ...}
- "unit": which apartment instance the space belongs to ("1", "2", "3", ...), or "common".
- "type": the apartment's type letter; omit for common entries.
- box_2d: integers normalized to 0-1000, tight around that single space.
Every room, balcony and shaft visible on the plan must appear in exactly one entry.`;

  const TYPE_COLORS = ["#b8502f", "#3d7a4f", "#c9a227", "#7e6bb5", "#a33427", "#22788c"];
  const COMMON_COLOR = "#5b7fa6";

  function letterColor(letter) {
    const c = letter ? letter.charCodeAt(0) - 65 : 0;
    return TYPE_COLORS[((c % TYPE_COLORS.length) + TYPE_COLORS.length) % TYPE_COLORS.length];
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function configure(t) { transport = t; }

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Görsel yüklenemedi."));
      img.src = src;
    });
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  async function toJpegPart(dataUrl, maxDim = 1440) {
    const img = await loadImg(dataUrl);
    const w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, maxDim / Math.max(w, h));
    const c = makeCanvas(w * s, h * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { inlineData: { mimeType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.92).split(",")[1] } };
  }

  /* Beyaz kenarları kırparak modele gönderilecek kareyi bulur (tespit isabetini
     artırır); dönen crop ile normalize koordinatlar orijinal kareye eşlenir. */
  async function inkCrop(dataUrl) {
    const img = await loadImg(dataUrl);
    const W = img.naturalWidth, H = img.naturalHeight;
    const s = Math.min(1, 640 / Math.max(W, H));
    const c = makeCanvas(W * s, H * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const p = (y * c.width + x) * 4;
        if (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2] < 245) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return { img, x0: 0, y0: 0, w: W, h: H };
    const m = 0.02 * Math.max(W, H);
    const rx0 = Math.max(0, x0 / s - m), ry0 = Math.max(0, y0 / s - m);
    const rx1 = Math.min(W, (x1 + 1) / s + m), ry1 = Math.min(H, (y1 + 1) / s + m);
    return { img, x0: rx0, y0: ry0, w: rx1 - rx0, h: ry1 - ry0 };
  }

  function croppedJpegPart(crop, maxDim = 1440) {
    const s = Math.min(1, maxDim / Math.max(crop.w, crop.h));
    const c = makeCanvas(crop.w * s, crop.h * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(crop.img, crop.x0, crop.y0, crop.w, crop.h, 0, 0, c.width, c.height);
    return { inlineData: { mimeType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.92).split(",")[1] } };
  }

  /* ---- Gemini metin (JSON) çağrısı ----
     Tespit için flash sınıfı bir model kullanılır (mekânsal kutu analizinde
     görüntü modelinden çok daha kararlı). Google model adlarını emekliye
     ayırabildiği için adaylar sırayla denenir; çalışan ad önbelleklenir.
     Hiçbiri kabul edilmezse (eski worker) üretim modeline düşülür. */
  const DETECT_CANDIDATES = ["gemini-flash-latest", "gemini-3-flash", "gemini-3-flash-preview", "gemini-2.5-flash"];
  const MODEL_ERR = /izin verilmeyen model|not found|not supported|permission|deprecated/i;
  let detectModel; // undefined = henüz çözümlenmedi, null = varsayılan üretim modeli

  async function geminiJsonWith(model, promptText, imagePart) {
    const body = {
      contents: [{ parts: [{ text: promptText }, imagePart] }],
      generationConfig: { responseModalities: ["TEXT"], temperature: 0 },
    };
    let res;
    try {
      res = await fetch(transport.url(model || undefined), { method: "POST", headers: transport.headers(), body: JSON.stringify(body) });
    } catch {
      throw new Error("Ağa ulaşılamadı — internet bağlantınızı kontrol edin.");
    }
    let json = null;
    try { json = await res.json(); } catch { /* gövdesiz */ }
    if (!res.ok) {
      const e = new Error("Analiz hatası: " + (json?.error?.message || "HTTP " + res.status));
      e.httpStatus = res.status;
      throw e;
    }
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const txt = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
    const m = txt.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("Analiz yanıtı çözümlenemedi.");
    return JSON.parse(m[0]);
  }

  async function geminiJson(promptText, imagePart) {
    if (!transport) throw new Error("Analiz modülü yapılandırılmadı.");
    if (detectModel !== undefined) {
      return geminiJsonWith(detectModel, promptText, imagePart);
    }
    for (const m of DETECT_CANDIDATES) {
      try {
        const out = await geminiJsonWith(m, promptText, imagePart);
        detectModel = m;
        return out;
      } catch (e) {
        // Model izinli değil / bulunamadı → sıradakini dene; diğer hatalar gerçek hatadır
        if (!(MODEL_ERR.test(e.message) || e.httpStatus === 400 || e.httpStatus === 404)) throw e;
      }
    }
    detectModel = null; // hiçbir aday kabul edilmedi → üretim modeli
    return geminiJsonWith(null, promptText, imagePart);
  }

  /* ---- Kapı tespiti ----
     Büyük planlarda tek geçiş küçük kapıları kaçırır: plan örtüşmeli 2×2
     parçaya bölünüp her parça ayrı taranır (paralel), tam kare geçişiyle
     birleştirilir. Parça tespitleri (daha yüksek çözünürlük) önceliklidir. */
  async function detectDoors(dataUrl) {
    const crop = await inkCrop(dataUrl);
    const base = Math.max(crop.w, crop.h);
    const frames = [];
    if (base > 1100) {
      const hw = crop.w * 0.56, hh = crop.h * 0.56; // %12 örtüşme
      for (const fy of [0, 1]) for (const fx of [0, 1]) {
        frames.push({ x0: crop.x0 + fx * (crop.w - hw), y0: crop.y0 + fy * (crop.h - hh), w: hw, h: hh, tile: true });
      }
    }
    frames.push({ x0: crop.x0, y0: crop.y0, w: crop.w, h: crop.h, tile: false });

    const results = await Promise.all(frames.map(async (f) => {
      try {
        const part = croppedJpegPart({ img: crop.img, x0: f.x0, y0: f.y0, w: f.w, h: f.h });
        return { f, arr: await geminiJson(DETECT_PROMPT, part), err: null };
      } catch (err) { return { f, arr: null, err }; }
    }));
    if (results.every((r) => !r.arr)) throw results[results.length - 1].err || new Error("Kapı tespiti başarısız.");

    const raw = [];
    for (const { f, arr } of results) {
      if (!arr) continue;
      for (const e of arr) {
        const box = Array.isArray(e) ? e : e?.box_2d;
        if (!box || box.length !== 4) continue;
        const [ymin, xmin, ymax, xmax] = box.map(Number);
        const x = f.x0 + ((xmin + xmax) / 2 / 1000) * f.w;
        const y = f.y0 + ((ymin + ymax) / 2 / 1000) * f.h;
        const r = clamp(Math.max(((xmax - xmin) / 1000) * f.w, ((ymax - ymin) / 1000) * f.h) / 2, 0.008 * base, 0.06 * base);
        if (Number.isFinite(x) && Number.isFinite(y)) raw.push({ x, y, r, tile: f.tile });
      }
    }
    raw.sort((a, b) => (b.tile ? 1 : 0) - (a.tile ? 1 : 0)); // parça tespitleri önce
    const doors = [];
    for (const d of raw) {
      if (doors.every((k) => (d.x - k.x) ** 2 + (d.y - k.y) ** 2 > (0.7 * Math.max(d.r, k.r)) ** 2)) {
        doors.push({ x: d.x, y: d.y, r: d.r });
      }
    }
    return doors;
  }

  /* ---- Ortak alan + daire tespiti (oda kutuları birleşimi) ----
     Tek çağrının koşudan koşuya oynaklığına karşı 3 paralel tespit yapılır;
     çoğunluğun bulduğu daire sayısı kazanır (eşitlikte küçük sayı — model
     hatası neredeyse hep fazla bölme yönündedir), aynı sayıdaki koşulardan
     en eksiksiz kapsama (en çok oda kutusu) seçilir. */
  async function detectRegions(dataUrl) {
    const crop = await inkCrop(dataUrl);
    const part = croppedJpegPart(crop);
    const settled = await Promise.allSettled([0, 1, 2].map(() => geminiJson(REGION_PROMPT, part)));
    const runs = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (!runs.length) {
      throw settled[0].reason || new Error("Alan tespiti başarısız.");
    }
    const candidates = runs.map((arr) => parseRegionRun(arr, crop)).filter((p) => p.units.length);
    if (!candidates.length) throw new Error("Alan tespiti sonuç vermedi.");
    return candidates;
  }

  const totalRects = (p) => p.units.reduce((s, u) => s + u.rects.length, 0);

  /* Kapı, verilen kutulardan birine tol payıyla değiyor mu? */
  function nearRects(d, rects, tol) {
    return (rects || []).some(([x0, y0, x1, y1]) =>
      d.x >= x0 - tol && d.x <= x1 + tol && d.y >= y0 - tol && d.y <= y1 + tol);
  }

  /* İki kutu kümesinin paylaştığı sınır uzunluğu (komşuluk ölçüsü) */
  function rectAdjacency(rectsA, rectsB, tol) {
    let sum = 0;
    for (const a of rectsA) {
      for (const b of rectsB) {
        const xov = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
        const yov = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
        if (xov > 0 && (Math.abs(a[3] - b[1]) <= tol || Math.abs(b[3] - a[1]) <= tol)) sum += xov;
        if (yov > 0 && (Math.abs(a[2] - b[0]) <= tol || Math.abs(b[2] - a[0]) <= tol)) sum += yov;
        if (xov > 0 && yov > 0) sum += Math.min(xov, yov); // örtüşen kutular
      }
    }
    return sum;
  }

  function relabelUnits(units) {
    const byLetter = new Map();
    for (const u of units) {
      const L = u.letter || "?";
      if (!byLetter.has(L)) byLetter.set(L, []);
      byLetter.get(L).push(u);
    }
    for (const [L, us] of byLetter) {
      us.forEach((u, i) => { u.label = "Tip " + L + (us.length > 1 ? " · " + (i + 1) : ""); });
    }
    return units;
  }

  /* Aday koşulardan en iyisini KAPI KANITIYLA seçer: gerçek bir dairenin ortak
     alana açılan giriş kapısı olmalıdır. Girişi olan daire sayısı yüksek, girişsiz
     "yetim" parça sayısı düşük koşu kazanır; eşitlikte az daire (model hatası hep
     fazla bölme yönünde) ve eksiksiz kapsama tercih edilir. Ardından yetim
     parçalar en uzun sınırı paylaştıkları daireye otomatik birleştirilir. */
  function chooseRegions(candidates, doors) {
    if (!candidates?.length) return null;
    const entranceFlags = (p) => {
      const tol = 0.025 * Math.max(p.w, p.h);
      return p.units.map((u) =>
        (doors || []).some((d) => nearRects(d, u.rects, tol) && nearRects(d, p.common, tol)));
    };
    const scored = candidates.map((p) => {
      const e = entranceFlags(p);
      const valid = e.filter(Boolean).length;
      return { p, e, valid, s: valid - (p.units.length - valid) };
    });
    scored.sort((a, b) => b.s - a.s || a.p.units.length - b.p.units.length || totalRects(b.p) - totalRects(a.p));
    const { p: picked, e, valid } = scored[0];

    // Yetim birleştirme YALNIZCA sinyal güvenilirken: en az 2 daire giriş kanıtlı
    // olmalı; yetimler sadece giriş kanıtlı dairelere, komşuluk varsa katılır.
    // Hiçbir dairede kanıt yoksa (ortak alan/kapı tespiti zayıf) dokunulmaz.
    if (valid >= 2 && valid < picked.units.length) {
      const adjTol = 0.02 * Math.max(picked.w, picked.h);
      const keep = [], orphans = [];
      picked.units.forEach((u, i) => (e[i] ? keep : orphans).push(u));
      for (const o of orphans) {
        let best = null, bestAdj = 0;
        for (const v of keep) {
          const adj = rectAdjacency(o.rects, v.rects, adjTol);
          if (adj > bestAdj) { bestAdj = adj; best = v; }
        }
        if (best) {
          best.rects.push(...o.rects);
          (best.names || (best.names = [])).push(...(o.names || []));
        } else keep.push(o); // komşuluğu yoksa ayrı bırak — yanlış birleştirme yapma
      }
      picked.units = keep;
    }
    relabelUnits(picked.units);
    return picked;
  }

  function parseRegionRun(arr, crop) {
    const W = crop.img.naturalWidth, H = crop.img.naturalHeight;
    const units = new Map();
    for (const e of arr) {
      const box = e?.box_2d;
      if (!box || box.length !== 4) continue;
      const [ymin, xmin, ymax, xmax] = box.map(Number);
      const x0 = clamp(crop.x0 + (Math.min(xmin, xmax) / 1000) * crop.w, 0, W);
      const x1 = clamp(crop.x0 + (Math.max(xmin, xmax) / 1000) * crop.w, 0, W);
      const y0 = clamp(crop.y0 + (Math.min(ymin, ymax) / 1000) * crop.h, 0, H);
      const y1 = clamp(crop.y0 + (Math.max(ymin, ymax) / 1000) * crop.h, 0, H);
      if (x1 - x0 < 6 || y1 - y0 < 6) continue;
      const uid = String(e.unit ?? "?").trim().toLowerCase();
      const u = units.get(uid) || { letter: null, rects: [], names: [] };
      u.rects.push([x0, y0, x1, y1]);
      u.names.push(String(e.name || "").trim().toLowerCase());
      const t = String(e.type || "").trim().toUpperCase().slice(0, 1);
      if (/[A-Z]/.test(t) && uid !== "common") u.letter = t;
      units.set(uid, u);
    }
    const common = units.get("common")?.rects || [];
    units.delete("common");
    const byLetter = new Map();
    for (const [uid, u] of units) {
      const L = u.letter || "?";
      if (!byLetter.has(L)) byLetter.set(L, []);
      byLetter.get(L).push({ uid, rects: u.rects, names: u.names });
    }
    const list = [];
    for (const [L, us] of [...byLetter.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      us.forEach((u, i) => list.push({
        uid: u.uid, letter: L,
        label: "Tip " + L + (us.length > 1 ? " · " + (i + 1) : ""),
        rects: u.rects, names: u.names,
      }));
    }
    return { units: list, common, w: W, h: H };
  }

  /* Bina/daire dış hattını mavi bant olarak çizen katman (doğal ölçekte).
     fromRender=true: kaynak çizim değil boyalı render ise kontur, kenar-medyan
     arka plan ayrımıyla (buildingFromRender) çıkarılır. */
  function outlineLayer(img, fromRender = false) {
    const S = scaledData(img, 1000);
    const m = fromRender
      ? buildingFromRender(S.data, S.w, S.h)
      : buildingFromInk(inkMask(S.data, S.w, S.h), S.w, S.h);
    const e = Math.max(2, Math.round(0.005 * Math.max(S.w, S.h)));
    const dil = dilate(m, S.w, S.h, e);
    const ero = erode(m, S.w, S.h, e);
    const edge = new ImageData(S.w, S.h);
    for (let i = 0; i < m.length; i++) {
      if (dil[i] && !ero[i]) {
        const p = i * 4;
        edge.data[p] = 30; edge.data[p + 1] = 70; edge.data[p + 2] = 225; edge.data[p + 3] = 230;
      }
    }
    const ec = makeCanvas(S.w, S.h);
    ec.getContext("2d").putImageData(edge, 0, 0);
    return ec;
  }

  /* Salt dış sınır görseli: beyaz zemin üzerine bina taban sınırı bandı.
     Dış render gibi "sadece kontur" girdisi gereken üretimler için ayrık görsel. */
  async function outlineImage(dataUrl, fromRender = false) {
    const img = await loadImg(dataUrl);
    const c = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(outlineLayer(img, fromRender), 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }

  /* ---- İşaretleme: kırmızı kapı halkaları + (isteğe bağlı) mavi dış hat bandı ----
     withOutline: false | true ("ink" — çizgi kaynaklı) | "render" (boyalı görsel) */
  async function annotateDoors(dataUrl, doors, withOutline = false) {
    const img = await loadImg(dataUrl);
    const c = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    if (withOutline) {
      try { ctx.drawImage(outlineLayer(img, withOutline === "render"), 0, 0, c.width, c.height); } catch { /* dış hat kritik değil */ }
    }
    ctx.strokeStyle = "#e11d1d";
    ctx.lineWidth = Math.max(3, 0.004 * Math.max(c.width, c.height));
    for (const d of doors || []) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 1.2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    return c.toDataURL("image/png");
  }

  /* ---- Tipoloji izolasyonu: daire dışı beyazlanır, daireye kırpılır ---- */
  async function isolateUnit(dataUrl, unit, doors) {
    const img = await loadImg(dataUrl);
    const W = img.naturalWidth, H = img.naturalHeight, base = Math.max(W, H);
    const k = Math.max(6, 0.012 * base); // çevre duvarları maskeye kat
    const rects = unit.rects.map(([x0, y0, x1, y1]) => [
      Math.max(0, x0 - k), Math.max(0, y0 - k), Math.min(W, x1 + k), Math.min(H, y1 + k),
    ]);
    const m = 0.03 * base;
    const bx0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r[0])) - m));
    const by0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r[1])) - m));
    const bx1 = Math.min(W, Math.ceil(Math.max(...rects.map((r) => r[2])) + m));
    const by1 = Math.min(H, Math.ceil(Math.max(...rects.map((r) => r[3])) + m));
    const c = makeCanvas(bx1 - bx0, by1 - by0);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    const path = new Path2D();
    for (const [x0, y0, x1, y1] of rects) path.rect(x0 - bx0, y0 - by0, x1 - x0, y1 - y0);
    ctx.clip(path);
    ctx.drawImage(img, -bx0, -by0);
    ctx.restore();
    const inRects = (x, y) => rects.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    const unitDoors = (doors || []).filter((d) => inRects(d.x, d.y)).map((d) => ({ x: d.x - bx0, y: d.y - by0, r: d.r }));
    return { dataUrl: c.toDataURL("image/png"), doors: unitDoors };
  }

  /* ============================================================
     DOĞRULAMA — dış hat IoU + overlay
     ============================================================ */
  const AS = 760; // maske analizlerinin uzun kenarı

  function scaledData(img, maxDim) {
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * s, img.naturalHeight * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { data: ctx.getImageData(0, 0, c.width, c.height), w: c.width, h: c.height, scale: s };
  }

  function inkMask(imgData, w, h) {
    const d = imgData.data, out = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
      const l = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
      if (l < 245) out[i] = 1;
    }
    return out;
  }

  /* İkili görüntüde ayrılabilir kare dilate (r piksel) — satır+sütun prefix toplamı */
  function dilate(mask, w, h, r) {
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = 0; x < Math.min(r, w); x++) acc += mask[row + x];
      for (let x = 0; x < w; x++) {
        if (x + r < w) acc += mask[row + x + r];
        if (x - r - 1 >= 0) acc -= mask[row + x - r - 1];
        tmp[row + x] = acc > 0 ? 1 : 0;
      }
    }
    const out = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = 0; y < Math.min(r, h); y++) acc += tmp[y * w + x];
      for (let y = 0; y < h; y++) {
        if (y + r < h) acc += tmp[(y + r) * w + x];
        if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * w + x];
        out[y * w + x] = acc > 0 ? 1 : 0;
      }
    }
    return out;
  }

  function erode(mask, w, h, r) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
    const d = dilate(inv, w, h, r);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i] ? 0 : 1;
    return out;
  }

  const close = (m, w, h, r) => erode(dilate(m, w, h, r), w, h, r);

  /* Kenardan BFS: passable=1 piksellerden yayılarak arka planı işaretler */
  function floodBg(passable, w, h) {
    const bg = new Uint8Array(w * h);
    const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
    let head = 0, tail = 0;
    const push = (x, y) => {
      const i = y * w + x;
      if (!bg[i] && passable[i]) { bg[i] = 1; qx[tail] = x; qy[tail] = y; tail++; }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (head < tail) {
      const x = qx[head], y = qy[head]; head++;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    return bg;
  }

  /* En büyük bağlı bileşeni bırakır */
  function largestComponent(mask, w, h) {
    const label = new Int32Array(w * h);
    const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
    let best = 0, bestSize = 0, cur = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || label[i]) continue;
      cur++;
      let head = 0, tail = 0, size = 0;
      qx[tail] = i % w; qy[tail] = (i / w) | 0; tail++;
      label[i] = cur;
      while (head < tail) {
        const x = qx[head], y = qy[head]; head++; size++;
        const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !label[j]) { label[j] = cur; qx[tail] = nx; qy[tail] = ny; tail++; }
        }
      }
      if (size > bestSize) { bestSize = size; best = cur; }
    }
    const out = new Uint8Array(w * h);
    if (best) for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
    return out;
  }

  function fillHoles(mask, w, h) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
    const bg = floodBg(inv, w, h);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = bg[i] ? 0 : 1;
    return out;
  }

  /* Kaynak çizimden bina maskesi: kapat → delik doldur → en büyük parça */
  function buildingFromInk(ink, w, h) {
    const r = Math.max(4, Math.round(0.01 * Math.max(w, h)));
    return largestComponent(fillHoles(close(ink, w, h, r), w, h), w, h);
  }

  /* Üretimden bina maskesi: kenar medyan rengine yakın pikseller arka plan sayılır */
  function buildingFromRender(imgData, w, h) {
    const d = imgData.data;
    const rs = [], gs = [], bs = [];
    const band = 4;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= band && x < w - band && y >= band && y < h - band) continue;
        const p = (y * w + x) * 4;
        rs.push(d[p]); gs.push(d[p + 1]); bs.push(d[p + 2]);
      }
    }
    const med = (a) => { a.sort((x, y) => x - y); return a[(a.length / 2) | 0]; };
    const mr = med(rs), mg = med(gs), mb = med(bs);
    const TOL = 32;
    const passable = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < passable.length; i++, p += 4) {
      if (Math.abs(d[p] - mr) <= TOL && Math.abs(d[p + 1] - mg) <= TOL && Math.abs(d[p + 2] - mb) <= TOL) passable[i] = 1;
    }
    const bg = floodBg(passable, w, h);
    const building = new Uint8Array(w * h);
    for (let i = 0; i < building.length; i++) building[i] = bg[i] ? 0 : 1;
    const r = Math.max(4, Math.round(0.01 * Math.max(w, h)));
    return largestComponent(fillHoles(close(building, w, h, r), w, h), w, h);
  }

  function maskBbox(mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }

  async function verifyResult(sourceDataUrl, doors, resultDataUrl) {
    const [srcImg, resImg] = await Promise.all([loadImg(sourceDataUrl), loadImg(resultDataUrl)]);

    const S = scaledData(srcImg, AS);
    const R = scaledData(resImg, AS);
    const srcInk = inkMask(S.data, S.w, S.h);
    const mSrc = buildingFromInk(srcInk, S.w, S.h);
    const mOut = buildingFromRender(R.data, R.w, R.h);
    const bs = maskBbox(mSrc, S.w, S.h);
    const bo = maskBbox(mOut, R.w, R.h);
    if (!bs || !bo) return { iou: 0, verdict: "bozuk", label: "Bina sınırı bulunamadı", overlay: resultDataUrl };

    // Sınır kutuları eşitlenerek IoU
    const bw = bs.x1 - bs.x0, bh = bs.y1 - bs.y0;
    let inter = 0, uni = 0;
    for (let y = 0; y < bh; y++) {
      const oy = bo.y0 + Math.floor((y / bh) * (bo.y1 - bo.y0));
      for (let x = 0; x < bw; x++) {
        const s = mSrc[(bs.y0 + y) * S.w + (bs.x0 + x)];
        const ox = bo.x0 + Math.floor((x / bw) * (bo.x1 - bo.x0));
        const o = mOut[oy * R.w + ox];
        if (s && o) inter++;
        if (s || o) uni++;
      }
    }
    const iou = uni ? inter / uni : 0;

    // Overlay — kaynak doğal ölçeğinde: hizalanmış üretim + kırmızı kaynak çizgiler + yeşil kapı halkaları
    const sScale = 1 / S.scale; // analiz → kaynak doğal piksel
    const nx0 = Math.round(bs.x0 * sScale), ny0 = Math.round(bs.y0 * sScale);
    const nw = Math.round(bw * sScale), nh = Math.round(bh * sScale);
    const rScale = 1 / R.scale;
    const ox0 = Math.round(bo.x0 * rScale), oy0 = Math.round(bo.y0 * rScale);
    const ow = Math.round((bo.x1 - bo.x0) * rScale), oh = Math.round((bo.y1 - bo.y0) * rScale);

    const c = makeCanvas(nw, nh);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(resImg, ox0, oy0, ow, oh, 0, 0, nw, nh);

    // Kaynak mürekkep → yarı saydam kırmızı katman
    const sc = makeCanvas(nw, nh);
    const sctx = sc.getContext("2d");
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, nw, nh);
    sctx.drawImage(srcImg, nx0, ny0, nw, nh, 0, 0, nw, nh);
    const sd = sctx.getImageData(0, 0, nw, nh);
    const px = sd.data;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      if (l < 245) { px[i] = 214; px[i + 1] = 40; px[i + 2] = 40; px[i + 3] = 168; }
      else px[i + 3] = 0;
    }
    sctx.putImageData(sd, 0, 0);
    ctx.drawImage(sc, 0, 0);

    ctx.strokeStyle = "#2fae4f";
    ctx.lineWidth = Math.max(3, 0.004 * Math.max(nw, nh));
    for (const d of doors || []) {
      ctx.beginPath();
      ctx.arc(d.x - nx0, d.y - ny0, d.r * 1.2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    let verdict, label;
    if (iou >= 0.95) { verdict = "uyumlu"; label = "Dış hat kaynakla örtüşüyor"; }
    else if (iou >= 0.85) { verdict = "sapma"; label = "Dış hatta küçük sapma var — overlay'i inceleyin"; }
    else { verdict = "bozuk"; label = "Dış hat kaynaktan belirgin şekilde sapmış"; }
    return { iou, verdict, label, overlay: c.toDataURL("image/jpeg", 0.9) };
  }

  /* ============================================================
     KAPI / ALAN DÜZENLEME PENCERESİ
     ============================================================ */
  function openEditor({ title, dataUrl, doors, units, common, onSave }) {
    const work = (doors || []).map((d) => ({ ...d }));
    const unitsWork = (units || []).map((u) => ({ ...u, rects: u.rects.map((r) => [...r]), names: [...(u.names || [])] }));
    let mergeSel = -1; // birleştirme için seçili daire çipi
    const wrap = document.createElement("div");
    wrap.className = "pa-modal";
    wrap.innerHTML = `
      <div class="pa-box">
        <div class="pa-head">
          <b>${title || "Plan Analizi"}</b>
          <span class="pa-count"></span>
          <span class="pa-legend"></span>
          <button class="pa-x" type="button" title="Kapat">✕</button>
        </div>
        <p class="pa-hint">Kırmızı halkalar kapı işaretleridir: eksik kapıya <b>tıklayıp ekleyin</b>, yanlış işarete <b>tıklayıp kaldırın</b>. Model bir daireyi yanlışlıkla ikiye böldüyse üstteki <b>daire çiplerinden ikisine sırayla tıklayın</b> — ikincisi birincisine birleştirilir.</p>
        <div class="pa-scroll"><div class="pa-editor"><img alt="Plan"><canvas class="pa-regions"></canvas></div></div>
        <div class="pa-foot">
          <button class="btn btn-ghost pa-cancel" type="button">İptal</button>
          <button class="btn btn-primary pa-ok" type="button">✓ Kaydet</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const img = wrap.querySelector("img");
    const regionCv = wrap.querySelector(".pa-regions");
    const editor = wrap.querySelector(".pa-editor");
    let natW = 1, natH = 1;

    const legend = wrap.querySelector(".pa-legend");
    function renderLegend() {
      legend.innerHTML = unitsWork.map((u, i) =>
        `<button class="pa-lg pa-unit ${i === mergeSel ? "sel" : ""}" data-ui="${i}" type="button" title="Birleştirmek için iki daireye sırayla tıklayın"><i style="background:${letterColor(u.letter)}"></i>${u.label}</button>`
      ).join("") + ((common || []).length ? `<span class="pa-lg"><i style="background:${COMMON_COLOR}"></i>Ortak Alan</span>` : "");
      legend.querySelectorAll(".pa-unit").forEach((b) => {
        b.addEventListener("click", () => {
          const i = +b.dataset.ui;
          if (mergeSel === -1) { mergeSel = i; }
          else if (mergeSel === i) { mergeSel = -1; }
          else {
            // İkinci seçilen daire ilkine katılır
            unitsWork[mergeSel].rects.push(...unitsWork[i].rects);
            unitsWork[mergeSel].names.push(...(unitsWork[i].names || []));
            unitsWork.splice(i, 1);
            mergeSel = -1;
          }
          renderLegend();
          renderRegions();
        });
      });
    }

    const count = () => { wrap.querySelector(".pa-count").textContent = work.length + " kapı"; };

    function renderMarkers() {
      editor.querySelectorAll(".pa-marker").forEach((m) => m.remove());
      const k = img.clientWidth / natW;
      work.forEach((d, i) => {
        const m = document.createElement("div");
        m.className = "pa-marker";
        const size = Math.max(16, 2 * d.r * 1.2 * k);
        m.style.cssText = `left:${d.x * k}px; top:${d.y * k}px; width:${size}px; height:${size}px`;
        m.title = "Kaldırmak için tıklayın";
        m.addEventListener("click", (e) => { e.stopPropagation(); work.splice(i, 1); renderMarkers(); count(); });
        editor.appendChild(m);
      });
      count();
    }

    function renderRegions() {
      const k = img.clientWidth / natW;
      regionCv.width = img.clientWidth;
      regionCv.height = img.clientHeight;
      const ctx = regionCv.getContext("2d");
      const draw = (rects, color) => {
        ctx.fillStyle = color + "38";
        for (const [x0, y0, x1, y1] of rects) {
          ctx.fillRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
        }
      };
      for (const u of unitsWork) draw(u.rects, letterColor(u.letter));
      if (common?.length) draw(common, COMMON_COLOR);
    }

    img.addEventListener("load", () => {
      natW = img.naturalWidth; natH = img.naturalHeight;
      renderLegend();
      renderRegions();
      renderMarkers();
    });
    img.src = dataUrl;

    img.addEventListener("click", (e) => {
      const rect = img.getBoundingClientRect();
      const k = natW / img.clientWidth;
      const rDef = work.length ? work.reduce((s, d) => s + d.r, 0) / work.length : 0.02 * Math.max(natW, natH);
      work.push({ x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k, r: rDef });
      renderMarkers();
    });
    window.addEventListener("resize", renderMarkers);

    const closeModal = () => { window.removeEventListener("resize", renderMarkers); wrap.remove(); };
    wrap.querySelector(".pa-x").addEventListener("click", closeModal);
    wrap.querySelector(".pa-cancel").addEventListener("click", closeModal);
    wrap.querySelector(".pa-ok").addEventListener("click", () => { onSave?.({ doors: work, units: unitsWork }); closeModal(); });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  }

  /* Daire oda adlarından "2+1" biçiminde şema çıkarır (yatak odası + salon).
     Yatak odası hiç yoksa stüdyo kabul edilir ("1+0"); ad bilgisi yoksa null. */
  function roomScheme(unit) {
    let beds = 0, livings = 0;
    for (const n of unit?.names || []) {
      if (/bed|yatak/.test(n)) beds++;
      else if (/living|salon|lounge/.test(n)) livings++;
    }
    if (!beds && !livings) return null;
    return beds ? `${beds}+${livings || 1}` : "1+0";
  }

  return { configure, detectDoors, detectRegions, chooseRegions, annotateDoors, outlineImage, isolateUnit, verifyResult, openEditor, letterColor, roomScheme };
})();
