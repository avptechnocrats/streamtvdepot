FROM node:20-alpine AS builder

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_PUBLIC_RTMP_SERVER_HOST
ENV NEXT_PUBLIC_RTMP_SERVER_HOST=$NEXT_PUBLIC_RTMP_SERVER_HOST

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536

# Install dependencies based on lockfile first so Docker cache is reused effectively.
COPY package*.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# Copy the app source only after dependencies are resolved.
COPY . .
RUN mkdir -p public && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
