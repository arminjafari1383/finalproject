# ===========================
# مرحله ۱: ساخت پروژه React
# ===========================
FROM node:22-alpine AS build

WORKDIR /app

# کپی package.json و package-lock.json
COPY package*.json ./

# نصب همه dependencies
RUN npm install --include=dev

# کپی کدهای پروژه
COPY . .

# ساخت خروجی نهایی
RUN npm run build

# ===========================
# مرحله ۲: سرو خروجی با Nginx
# ===========================
FROM nginx:1.25-alpine

# نصب curl برای health check
RUN apk add --no-cache curl

# پاک‌سازی فایل‌های پیش‌فرض
RUN rm -rf /usr/share/nginx/html/*

# ✅ کپی فایل‌های build (اگر خروجی در build است)
COPY --from=build /app/build /usr/share/nginx/html

# expose پورت
EXPOSE 80

# health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# اجرای Nginx
CMD ["nginx", "-g", "daemon off;"]