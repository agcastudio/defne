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
  // 1) Ara sunucu adresi — anahtar Cloudflare'de Secret olarak saklanır,
  //    siteye ve depoya hiç girmez. (Aktif yöntem, 2026-07-15)
  proxyUrl: "https://pafta-gemini.kutbeddinagca.workers.dev",

  // 2) Base64 kodlanmış anahtar (proxy kullanıldığı için boş)
  apiKeyB64: "",

  // 3) Açık metin anahtar (yalnızca kendi bilgisayarınızda!)
  apiKey: "",

  // Model sabittir: Nano Banana Pro ("gemini-3-pro-image-preview", 4K çıktı).
  // Farklı bir model pinlemek isterseniz buraya yazın; boş = Nano Banana Pro.
  model: "",
};
