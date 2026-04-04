FROM node:20-bookworm-slim

# Build tools required for mediasoup native module
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    libssl-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
