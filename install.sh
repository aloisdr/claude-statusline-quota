#!/usr/bin/env bash
# Installe claude-statusline-quota : copie le script dans ~/.claude/
# et configure statusLine dans ~/.claude/settings.json (backup créé avant).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js introuvable dans le PATH. Installe Node ≥ 18 puis relance." >&2
  exit 1
fi

mkdir -p "$CLAUDE_DIR"
cp "$SCRIPT_DIR/statusline-quota.mjs" "$CLAUDE_DIR/statusline-quota.mjs"
echo "✓ Script copié dans $CLAUDE_DIR/statusline-quota.mjs"

[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak"
echo "✓ Backup : $SETTINGS.bak"

"$NODE_BIN" - "$SETTINGS" "$NODE_BIN" "$CLAUDE_DIR/statusline-quota.mjs" <<'EOF'
const fs = require("fs");
const [settingsPath, nodeBin, scriptPath] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
settings.statusLine = {
  type: "command",
  command: `${nodeBin} ${scriptPath}`,
  padding: 0,
};
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
EOF
echo "✓ statusLine configurée dans $SETTINGS (node : $NODE_BIN)"
echo
echo "Redémarre Claude Code pour voir la statusline. 🎉"
