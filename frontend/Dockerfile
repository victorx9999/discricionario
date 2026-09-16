# ---------------------------------------------------------------------------
# Desenvolvimento: ng serve com recarga automática, para subir junto da API
# via docker compose.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4200
CMD ["npm", "run", "start"]

# ---------------------------------------------------------------------------
# Produção: build estático servido por nginx.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist/discricionario/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
