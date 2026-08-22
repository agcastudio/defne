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

1. **Girdiler** — Vaziyet, bodrum, zemin, ara, son ve çatı katı planlarından
   elinizde olanları yükleyin (en az bir plan zorunlu); şematik kesit ve firma
   logosu isteğe bağlıdır. Telefonla çekilmiş eskiz fotoğrafı da olur. Her
   yüklenen plan için ayrı sunum paftası üretilir. Üst bardaki **"Örnek projeyi
   yükle"** düğmesiyle hazır verilerle deneyebilirsiniz.
2. **Proje Bilgileri** — Künyeyi doldurun ve konut tipolojilerini (ad, alan,
   adet, standart listeden kat) tanımlayın; tip planları ana kat planından
   türetilir. Renk paleti ve mimari stil sabit bir kurumsal ayarla arka planda
   uygulanır (`js/studio.js` içindeki `state.palette` / `state.style`
   varsayılanları).
3. **Üretim** — "Tümünü Üret" ile tüm görselleri oluşturun. Her kartta tek tek
   yeniden üretme imkânı vardır. Üretim promptları sabittir ve kullanıcıya
   gösterilmez; şablonları değiştirmek için `js/studio.js` içindeki
   `buildPrompt()` fonksiyonunu düzenleyin.
4. **Sunum Dosyası** — Kapak + içerik sayfalarından oluşan çok sayfalı A3 yatay
   sunumu önizleyin; **PDF / Yazdır** ile tarayıcının yazdırma penceresinden
   *PDF olarak kaydet*'i seçin (kenar boşlukları: Yok, arka plan grafikleri: Açık).
   Görselleri tek tek de indirebilirsiniz.

## Yapay zekâ görsel üretimi

- Üretim, varsayılan olarak **Nano Banana Pro** (`gemini-3-pro-image-preview`,
  Gemini 3 Pro Image) modeliyle yapılır; 3. adımdan daha hızlı/ekonomik
  **Nano Banana** (`gemini-2.5-flash-image`) modeline geçilebilir.
- API anahtarı: <https://aistudio.google.com/apikey>. Kullanım şekilleri
  (öncelik sırasıyla, ayrıntılar [`js/config.js`](js/config.js) içinde):
  1. **Ara sunucu / proxy (en güvenlisi):** [`worker/gemini-proxy.js`](worker/gemini-proxy.js)
     dosyasındaki kodu ücretsiz bir Cloudflare Worker'a kurun, anahtarı orada
     "Secret" olarak saklayın, worker adresini `config.js` → `proxyUrl` alanına
     yazın. Anahtar siteye ve depoya hiç girmez.
  2. **Kodlanmış gömülü anahtar (pratik):** Anahtarın base64 hâlini
     `config.js` → `apiKeyB64` alanına koyun. Ziyaretçiden anahtar istenmez.
  3. **Açık metin `apiKey`:** yalnızca kendi bilgisayarınızdaki kopyada!
  4. **Ziyaretçinin kendi anahtarı:** hepsi boşsa 3. adımda anahtar alanı
     görünür; girilen anahtar o tarayıcının localStorage'ında kalır.
- (Nano Banana Pro bazı hesaplarda faturalandırma gerektirebilir; kota hatası
  alırsanız Nano Banana'ya geçin.)

> **"API key was reported as leaked" hatası:** GitHub, herkese açık depoları
> tarar ve bulduğu açık metin `AIza...` anahtarlarını Google'a bildirir; Google
> da anahtarı kalıcı olarak iptal eder. Böyle bir anahtar kurtarılamaz:
> [AI Studio](https://aistudio.google.com/apikey)'dan eskisini silin, yenisini
> oluşturun ve yeni anahtarı depoya asla açık metin koymayın — yukarıdaki
> 1. veya 2. yolu kullanın.

> **Güvenlik uyarısı:** Kodlanmış (base64) anahtar da isteyen herkesçe
> çözülebilir; yalnızca otomatik taramayı atlatır. Hangi yolu seçerseniz seçin
> [Google Cloud Console](https://console.cloud.google.com/apis/credentials)'dan
> anahtara **Website restrictions (HTTP referrer)** kısıtı ekleyip yalnızca
> `https://KULLANICI.github.io/*` adresinize izin verin ve harcama
> limiti/uyarısı tanımlayın.
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
| `js/config.js` | Site yapılandırması (proxy adresi / kodlanmış anahtar / model) |
| `worker/gemini-proxy.js` | Cloudflare Worker ara sunucu kodu (anahtarı gizli tutar) |
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
