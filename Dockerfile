FROM node:22

# git is required for cloning client repos. ca-certificates keeps HTTPS happy
# across package updates.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash agent

WORKDIR /app

RUN npm install -g tsx

COPY --chown=agent:agent package*.json tsconfig.json ./
RUN npm ci --production && chown -R agent:agent /app

COPY --chown=agent:agent src ./src
COPY --chown=agent:agent scripts ./scripts

# /app/data is the Fly volume mount point; /tmp/gbp-edge-blog-runs is the
# scratch dir for git clones. Both must be writable by `agent`.
RUN mkdir -p /app/data /tmp/gbp-edge-blog-runs \
 && chown -R agent:agent /app/data /tmp/gbp-edge-blog-runs

# Claude Code refuses --dangerously-skip-permissions as root.
USER agent

CMD ["tsx", "src/index.ts"]
