# Dashboard image: build the SPA, then serve it via nginx with the
# control-plane API reverse-proxied (see nginx.conf).
#
# The typed API client is consumed as a LOCAL dependency at ./vendor/
# mobula-client (generated from mobula's openapi.json by deploy/up.sh), so
# the image builds with no GitHub Packages / npm auth. In a normal (non-
# compose) build the package comes from GHCR instead; here we override it.
FROM node:22-alpine AS build
WORKDIR /app

# Locally-generated client (deploy/up.sh puts it here).
COPY vendor/mobula-client ./vendor/mobula-client

COPY package.json package-lock.json* ./
# Point the client dependency at the vendored copy and install.
RUN npm pkg set dependencies.@brandonrc/mobula-client=file:./vendor/mobula-client \
 && npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
