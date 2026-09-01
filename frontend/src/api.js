import axios from "axios";

// ساخت نمونه axios
export const api = axios.create({
  baseURL: "https://aipolynet.com/api/",
  timeout: 30000,
});

// ============================================================
// Retry interceptor برای خطاهای شبکه
// ============================================================

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const { config, message, code } = error;

    // اگر درخواست اصلاً ارسال نشده یا خطای شبکه بود
    if (
      config &&
      (message === "Network Error" ||
        code === "ERR_NETWORK" ||
        code === "ECONNABORTED")
    ) {
      config.retryCount = config.retryCount || 0;

      if (config.retryCount < 3) {
        config.retryCount += 1;

        console.log(
          `🔄 تلاش مجدد... (${config.retryCount}/3)`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 1500)
        );

        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

export default api;