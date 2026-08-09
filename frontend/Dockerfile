# ===========================
# مرحله ۱: ساخت پروژه
# ===========================
FROM node:22-alpine AS build

WORKDIR /app

# کپی فقط package.json برای کش بهتر
COPY package*.json ./

# نصب وابستگی‌ها با cache پاک
RUN npm ci --only=production || npm install

# کپی کدهای پروژه
COPY . .

# ساخت خروجی نهایی
RUN npm run build

# ===========================
# مرحله ۲: سرو خروجی با Nginx
# ===========================
FROM nginx:1.25-alpine

# نصب curl برای health check (اختیاری)
RUN apk add --no-cache curl

# پاک‌سازی فایل‌های پیش‌فرض
RUN rm -rf /usr/share/nginx/html/*

# کپی فایل‌های build شده
COPY --from=build /app/dist /usr/share/nginx/html

# کپی کانفیگ Nginx (اگر دارید)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# expose پورت
EXPOSE 80

# health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# اجرای Nginx
CMD ["nginx", "-g", "daemon off;"]