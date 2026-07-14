# Pafta Studio — Mimari Sunum Web Sitesi

Şematik **kat planı** ve **kesit** çizimlerinden; tefrişli boyalı plan, perspektif plan,
tipoloji planları, sunum kesiti ve dış mekân renderı üretip hepsini firma kimliğinizle
**çok sayfalı A3 sunum dosyasında** (kapak + her içerik ayrı pafta) toplayan,
tamamen tarayıcıda çalışan statik bir web sitesi.

## Çalıştırma

Kurulum gerekmez. İki seçenek:

1. **Doğrudan:** `index.html` dosyasına çift tıklayın.
2. **Yerel sunucu (önerilen):**
   ```
   python -m http.server 8123
   ```
   komutunu bu klasörde çalıştırıp tarayıcıda `http://localhost:8123` adresini açın.

## Kullanım

1. **Girdiler** — Kat planınızı (zorunlu), şematik kesitinizi ve firma logonuzu yükleyin.
   Telefonla çekilmiş eskiz fotoğrafı da olur. Üst bardaki **"Örnek projeyi yükle"**
   düğmesiyle hazır verilerle deneyebilirsiniz.
2. **Proje Bilgileri** — Künyeyi doldurun; renk paleti, mimari stil ve konut
   tipolojilerini (ad, alan, adet, isteğe bağlı tip çizimi) tanımlayın.
3. **Üretim** — "Tümünü Üret" ile tüm görselleri oluşturun. Her kartta tek tek
   yeniden üretme ve prompt (üretim metni) düzenleme imkânı vardır.
4. **Sunum Dosyası** — Kapak + içerik sayfalarından oluşan çok sayfalı A3 yatay
   sunumu önizleyin; **PDF / Yazdır** ile tarayıcının yazdırma penceresinden
   *PDF olarak kaydet*'i seçin (kenar boşlukları: Yok, arka plan grafikleri: Açık).
   Görselleri tek tek de indirebilirsiniz.

## Yapay zekâ görsel üretimi

- Üretim, varsayılan olarak **Nano Banana Pro** (`gemini-3-pro-image-preview`,
  Gemini 3 Pro Image) modeliyle yapılır; 3. adımdan daha hızlı/ekonomik
  **Nano Banana** (`gemini-2.5-flash-image`) modeline geçilebilir.
- API anahtarı: <https://aistudio.google.com/apikey>. İki kullanım şekli var:
  1. **Siteye gömülü (kullanıcıdan istenmez):** Anahtarınızı
     [`js/config.js`](js/config.js) dosyasındaki `apiKey: ""` alanına yapıştırın.
     3. adımdaki "Yapay Zekâ Bağlantısı" paneli otomatik gizlenir ve site
     doğrudan üretime hazır olur. İsterseniz `model` alanıyla modeli de
     sabitleyebilirsiniz.
  2. **Ziyaretçinin kendi anahtarı:** `config.js` boş bırakılırsa 3. adımda
     anahtar alanı görünür; girilen anahtar yalnızca o tarayıcının
     localStorage'ında saklanır.
- (Nano Banana Pro bazı hesaplarda faturalandırma gerektirebilir; kota hatası
  alırsanız Nano Banana'ya geçin.)

> **Güvenlik uyarısı:** `js/config.js` siteyle birlikte herkese açık yayınlanır.
> Anahtarı gömüp siteyi internete koyarsanız, ziyaret eden herkes anahtarınızı
> görebilir ve kotanızı/faturanızı kullanabilir. Yayınlamadan önce
> [Google Cloud Console](https://console.cloud.google.com/apis/credentials)'dan
> anahtara **Website restrictions (HTTP referrer)** kısıtı ekleyip yalnızca kendi
> alan adınıza izin verin ve bir harcama limiti tanımlayın. Site yalnızca ofis
> içinde/kendi bilgisayarınızda kullanılacaksa bu risk yoktur.
- Üretim sırasında yüklediğiniz görseller yalnızca Google Gemini API'sine gönderilir;
  başka hiçbir sunucuya veri gitmez.
- **Anahtar girmezseniz** site yine çalışır: akışı denemeniz için seçtiğiniz palete
  uygun "stilize önizleme" görselleri üretilir.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `index.html` | Tanıtım sayfası |
| `studio.html` | 4 adımlı stüdyo uygulaması |
| `css/style.css` | Tasarım sistemi + sunum sayfaları + baskı (A3) stilleri |
| `js/config.js` | Site yapılandırması (gömülü API anahtarı, model sabitleme) |
| `js/studio.js` | Yükleme, form, Gemini entegrasyonu, sunum dosyası oluşturma |

## İnternete yayınlama

Site tamamen statiktir (sunucu kodu yok); herhangi bir statik barındırma
hizmetine olduğu gibi yüklenebilir:

- **GitHub Pages (ücretsiz):**
  1. <https://github.com/new> adresinden bir depo oluşturun (örn. `pafta-studio`).
  2. Bu klasördeki dosyaları depoya yükleyin ("uploading an existing file"
     bağlantısıyla sürükle-bırak da yapabilirsiniz).
  3. Depoda **Settings → Pages → Branch: main / (root) → Save** deyin.
  4. Siteniz `https://KULLANICIADI.github.io/pafta-studio/` adresinde yayında olur.
- **Netlify / Vercel / Cloudflare Pages:** "Deploy" ekranına bu klasörü
  sürükleyip bırakmanız yeterli; derleme komutu gerekmez.

Yayın sonrası not: API anahtarı siteye gömülmez; her ziyaretçi kendi anahtarını
kendi tarayıcısına girer, anahtar hiçbir sunucuya gönderilmez.

## Notlar

- Sayfa yenilenirse yüklenen görseller kaybolur (form bilgileri saklanır);
  tarayıcı bu durumda sizi uyarır.
- Üretilen görseller yapay zekâ yorumudur; ölçülü teknik çizim yerine geçmez,
  sunum amaçlıdır.
