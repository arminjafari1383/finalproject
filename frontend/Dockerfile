# مرحله ۱: ساخت پروژه (Build Stage)
FROM node:18 AS build
WORKDIR /app

# نصب وابستگی‌ها
COPY package*.json ./
RUN npm install

# اضافه کردن کد پروژه
COPY . .

# ساخت خروجی نهایی
RUN npm run build

# مرحله ۲: سرو خروجی با Nginx (Production Serve)
FROM nginx:1.25

# پاک‌سازی کانفیگ پیش‌فرض Nginx
RUN rm -rf /usr/share/nginx/html/*

# کپی کردن خروجی build به مسیر Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# برای React معمولاً پوشه build است:
# COPY --from=build /app/build /usr/share/nginx/html

# قرار دادن فایل کانفیگ اختصاصی (اختیاری)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
