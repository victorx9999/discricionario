# syntax=docker/dockerfile:1

########################
# Estágio de dependências
########################
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

########################
# Estágio de build
########################
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

########################
# Desenvolvimento (usado pelo docker-compose)
########################
FROM node:22-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
RUN apk add --no-cache bash
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

########################
# Produção
########################
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
