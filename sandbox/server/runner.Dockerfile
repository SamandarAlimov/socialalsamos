FROM ubuntu:24.04

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    fonts-dejavu-core \
    nodejs \
    npm \
    python3 \
    python3-pip \
    python3-venv \
    timeout \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g tsx@4.20.6

# Real "Presented file" generation. These packages are baked into the isolated
# runner image because runtime containers have no network access.
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    openpyxl==3.1.5 \
    python-docx==1.2.0 \
    python-pptx==1.0.2 \
    reportlab==4.4.3

WORKDIR /workspace
USER nobody
