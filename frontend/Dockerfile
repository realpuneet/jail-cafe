# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_SOCKET_URL
ARG VITE_APP_NAME
ARG VITE_RAZORPAY_KEY_ID
ARG VITE_IMAGEKIT_URL_ENDPOINT
ARG VITE_IMAGEKIT_PUBLIC_KEY
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1
