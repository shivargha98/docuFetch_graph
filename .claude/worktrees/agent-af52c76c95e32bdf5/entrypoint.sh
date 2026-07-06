#!/bin/bash
# Ensures the official plugin marketplace and a fixed set of plugins are
# installed before every claude session. Installs are idempotent and
# persisted in the claude-auth volume, so this is fast after the first run.
set -e

# .claude.json (onboarding/trust state) lives next to ~/.claude, not inside it,
# so the claude-auth volume mount misses it. Persist it by relocating it into
# the volume and symlinking it back to the expected path.
CONFIG_LINK="$HOME/.claude.json"
CONFIG_TARGET="$HOME/.claude/.claude.json"
if [ -e "$CONFIG_LINK" ] && [ ! -L "$CONFIG_LINK" ]; then
  mv "$CONFIG_LINK" "$CONFIG_TARGET"
fi
if [ ! -s "$CONFIG_TARGET" ]; then
  echo '{}' > "$CONFIG_TARGET"
fi
ln -sf "$CONFIG_TARGET" "$CONFIG_LINK"

claude plugin marketplace add anthropics/claude-plugins-official || true

for plugin in frontend-design skill-creator superpowers code-review; do
  claude plugin install "${plugin}@claude-plugins-official" || true
done

exec claude "$@"
