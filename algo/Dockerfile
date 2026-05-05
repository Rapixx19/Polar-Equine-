FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ADD https://astral.sh/uv/install.sh /tmp/install-uv.sh
RUN sh /tmp/install-uv.sh && rm /tmp/install-uv.sh
ENV PATH="/root/.local/bin:/app/.venv/bin:${PATH}"

WORKDIR /app
COPY . .
RUN uv sync --locked --no-dev --no-editable
