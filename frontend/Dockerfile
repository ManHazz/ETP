# Stage 1 — build the Vite dashboard
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — Caddy serves the built dist AND reverse-proxies /api/* to the API.
# Caddyfile is mounted at runtime by docker-compose.prod.yml.
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
