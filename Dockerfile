FROM --platform=linux/amd64 node:22-bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       build-essential binutils-arm-none-eabi ca-certificates git libpng-dev python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN bash ./setup.sh

ENV DEKSA_HOST=0.0.0.0 \
    DEKSA_PORT=52655 \
    DEKSA_BUILD_JOBS=2
EXPOSE 52655
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:52655/api/status').then(r => process.exit([200,401].includes(r.status) ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "compiler/app/server.mjs"]
