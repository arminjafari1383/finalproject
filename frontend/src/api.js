import axios from "axios";

// ساخت نمونه axios با تنظیمات پیش‌فرض
export const api = axios.create({
  // ✅ حتماً آدرس را با /api/ تمام کنید (همان کاری که کردید، درست است)
  baseURL: "https://aipolynet.com/api/",
  
  // ✅ تایم‌اوت ۳۰ ثانیه (برای شبکه‌های کند موبایل)
  timeout: 30000,
  
  // ✅ برای ارسال کوکی‌ها و احراز هویت بین دامنه‌ها (مهم برای موبایل)
  withCredentials: true,
});

// ============================================================
// ✅ میان‌افزار (Interceptor) برای تلاش مجدد در صورت خطای شبکه
// این بخش باعث می‌شود اگر اینترنت قطع شد، خودکار ۳ بار دوباره تلاش کند
// ============================================================
api.interceptors.response.use(
  (response) => response, // اگر موفق بود، همان را برگردان
  async (error) => {
    const { config, message, code } = error;

    // اگر خطای قطعی اینترنت یا Network Error بود
    if (message === "Network Error" || code === "ERR_NETWORK") {
      // تعداد تلاش‌های قبلی را بشمار
      config.retryCount = config.retryCount || 0;

      // اگر کمتر از ۳ بار تلاش کرده‌ایم
      if (config.retryCount < 3) {
        config.retryCount += 1;
        console.log(`🔄 تلاش مجدد... (${config.retryCount}/3)`);

        // ۱.۵ ثانیه صبر کن تا اینترنت وصل شود، سپس دوباره درخواست بفرست
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return api(config); // درخواست را دوباره بفرست
      }
    }

    // اگر بعد از ۳ بار تلاش هم شکست خورد، خطا را به فرانت‌اند بفرست
    return Promise.reject(error);
  }
);

// ============================================================
// ✅ (اختیاری) اگر می‌خواهید به جای هر بار تایپ کردن آدرس کامل،
// فقط آدرس‌های کوتاه بدهید، اینجا تنظیم کنید.
// ============================================================
export default api;÷