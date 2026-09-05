FROM ubuntu:24.04

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    nodejs \
    npm \
    python3 \
    python3-pip \
    python3-venv \
    timeout \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g tsx@4.20.6

WORKDIR /workspace
USER nobody
