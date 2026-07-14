/* ============================================================
   PAFTA STUDIO — Site Yapılandırması
   ------------------------------------------------------------
   Üç kullanım şekli (öncelik sırasıyla):

   1) proxyUrl  — EN GÜVENLİSİ. Anahtar, Cloudflare Worker gibi bir
      ara sunucuda gizli tutulur; siteye hiç inmez. worker/gemini-proxy.js
      dosyasındaki kodu Cloudflare'e kurup adresini buraya yazın.

   2) apiKeyB64 — PRATİK YOL. Anahtarın base64 kodlanmış hâli.
      Açık metin "AIza..." anahtarlar herkese açık GitHub depolarında
      otomatik taranıp Google tarafından İPTAL EDİLDİĞİ için, yayına
      açılacak depoda anahtar yalnızca bu kodlanmış biçimde tutulmalıdır.
      Kodlamak için (PowerShell):
        [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("AIza...ANAHTARINIZ"))
      Not: Bu yalnızca otomatik taramayı atlatır; anahtar isteyen herkesçe
      çözülebilir. Mutlaka Google Cloud Console'dan anahtara HTTP referrer
      (Website) kısıtı ekleyin ve harcama limiti tanımlayın.

   3) apiKey    — SADECE YEREL KULLANIM. Açık metin anahtar. Bu dosya
      herkese açık bir depoya bu alan doluyken ASLA gönderilmemelidir;
      gönderilirse Google anahtarı birkaç saat içinde iptal eder.

   Hiçbiri doluysa: sitede 3. adımda anahtar alanı görünür ve her
   ziyaretçi kendi anahtarını girer.

   Anahtar almak için: https://aistudio.google.com/apikey
   ============================================================ */

window.PAFTA_CONFIG = {
  // 1) Ara sunucu adresi, örn: "https://pafta-gemini.KULLANICI.workers.dev"
  proxyUrl: "",

  // 2) Base64 kodlanmış anahtar (herkese açık depo için önerilen biçim)
  apiKeyB64: "",

  // 3) Açık metin anahtar (yalnızca kendi bilgisayarınızda!)
  apiKey: "",

  // Boş bırakılırsa arayüzdeki model seçimi kullanılır.
  // Sabitlemek için: "gemini-3-pro-image-preview" (Nano Banana Pro)
  // veya "gemini-2.5-flash-image" (Nano Banana)
  model: "",
};
