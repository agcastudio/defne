/* ============================================================
   PAFTA STUDIO — Site Yapılandırması
   ------------------------------------------------------------
   Gemini API anahtarınızı aşağıdaki apiKey alanına yazarsanız
   site ziyaretçiden anahtar İSTEMEZ; 3. adımdaki "Yapay Zekâ
   Bağlantısı" paneli otomatik olarak gizlenir.

   Anahtar almak için: https://aistudio.google.com/apikey

   !!! UYARI !!!
   Bu dosya siteyle birlikte herkese açık yayınlanır. Anahtarı
   buraya gömüp siteyi internete koyarsanız, siteyi ziyaret eden
   HERKES anahtarınızı görebilir ve kotanızı/faturanızı kullanabilir.
   Yayınlamadan önce Google Cloud Console'dan anahtara
   "Website restrictions" (HTTP referrer) kısıtı ekleyip yalnızca
   kendi alan adınıza izin vermeniz şiddetle önerilir.
   ============================================================ */

window.PAFTA_CONFIG = {
  // Gemini API anahtarınızı tırnakların arasına yapıştırın, örn: "AIzaSyD...":
  apiKey: "AIzaSyD8mwO1gxRODuRM5AkJqsELzw4CS6qPW9o",

  // Boş bırakılırsa arayüzdeki model seçimi kullanılır.
  // Sabitlemek için: "gemini-3-pro-image-preview" (Nano Banana Pro)
  // veya "gemini-2.5-flash-image" (Nano Banana)
  model: "",
};
