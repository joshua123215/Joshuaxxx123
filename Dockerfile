FROM node:22-bookworm-slim

# Install system ffmpeg/ffprobe and Liberation fonts for reliable HTTPS movie transcoding and AI video rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies cleanly from lockfile (fall back to npm install if lockfile drifted)
COPY package.json package-lock.json ./
RUN (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) && npm cache clean --force

# Copy application source and build frontend + backend server bundle
COPY . .
RUN npm run build

# Ensure runtime writable directories exist
RUN mkdir -p /app/data /app/public/generated-videos /app/public/generated-voices

ENV NODE_ENV=production
ENV PORT=10000
ENV NODE_OPTIONS="--max-old-space-size=320"

EXPOSE 10000

CMD ["npm", "run", "start"]
