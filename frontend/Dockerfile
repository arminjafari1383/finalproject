# مرحله ۱: ساخت پروژه (Build Stage)
FROM node:20-alpine AS build
WORKDIR /app

# نصب وابستگی‌ها
COPY package*.json ./
RUN npm install

# اضافه کردن کد پروژه
COPY . .

# ⭐ اضافه کردن این خط برای شکستن کش در مرحله build
ARG CACHE_BREAKER=1
RUN echo "Cache breaker: ${CACHE_BREAKER}" && npm run build

# مرحله ۲: سرو خروجی با Nginx (Production Serve)
FROM nginx:1.25-alpine

# نصب curl برای health check
RUN apk add --no-cache curl

# پاک‌سازی کانفیگ پیش‌فرض Nginx
RUN rm -rf /usr/share/nginx/html/*

# کپی کردن خروجی build به مسیر Nginx
COPY --from=build /app/build /usr/share/nginx/html

# کپی کانفیگ Nginx (اختیاری)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]