# Claude Sandbox — Pro plan (OAuth, no API key needed)
# Auth: Claude Code authenticates via your claude.ai Pro account on first run.
# Credentials are stored in ~/.claude and persisted via a volume mount.

FROM node:20-slim

# Install minimal utilities (python3 is required by the hookify plugin's hooks)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# --dangerously-skip-permissions refuses to run as root, so use a non-root user
# Give claude a writable npm prefix so auto-updates don't fail with permission errors
RUN useradd --create-home --shell /bin/bash claude \
    && mkdir -p /home/claude/.claude /home/claude/.npm-global/bin \
    && echo "prefix=/home/claude/.npm-global" > /home/claude/.npmrc \
    && chown -R claude:claude /home/claude/.claude /home/claude/.npm-global /home/claude/.npmrc

ENV PATH="/home/claude/.npm-global/bin:$PATH"

# Installs the official marketplace + a fixed plugin set before each session
COPY --chown=claude:claude entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER claude

# Workspace where you mount your local files
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
