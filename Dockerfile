# --- build stage ---
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:20-slim
# Bake the commit into the image for /api/version:
#   fly deploy --build-arg GIT_SHA=$(git rev-parse HEAD)
ARG GIT_SHA
WORKDIR /app
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib ./src/lib
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "server/index.js"]
