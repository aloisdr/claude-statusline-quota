# claude-statusline-quota

Statusline minimaliste pour [Claude Code](https://claude.com/claude-code) : affiche les **% de quota d'abonnement** (Pro/Max) et le **% de fenêtre de contexte** — **aucun prix, que des pourcentages**.

```
🤖 Fable 5 | 🧠 5% (53k/1.0M) | ⏱️ 5h: 14% →13:40 | 📅 Sem: 3% | 🎭 Fable: 3%
```

| Élément | Signification |
|---|---|
| 🧠 | Fenêtre de contexte utilisée (détection auto 200k / 1M) |
| ⏱️ 5h | % du quota de session (fenêtre 5 h) + heure de reset |
| 📅 Sem | % du quota hebdomadaire global |
| 🎭 | % du quota hebdomadaire spécifique au modèle (Fable, Opus…) |

Les pourcentages sont color-codés : vert < 70 %, jaune 70–89 %, rouge ≥ 90 %.

## Comment ça marche

- Les quotas viennent du même endpoint que la commande `/usage` de Claude Code (`api.anthropic.com/api/oauth/usage`), interrogé avec le token OAuth de **ton abonnement** — trouvé automatiquement dans le Keychain macOS ou dans `~/.claude/.credentials.json` (Linux/Windows). Ce sont donc tes vrais quotas, pas une estimation de coût.
- Réponse mise en cache 30 s (`~/.claude/.quota-cache.json`) pour ne pas marteler l'API ; en cas d'API injoignable, la dernière valeur connue est réutilisée.
- Le % de contexte est lu dans les derniers 512 Ko du transcript de la session courante.
- Zéro dépendance, zéro daemon : un simple script Node relancé par Claude Code à chaque rafraîchissement (~30 ms, ~55 Mo transitoires). Aucun token LLM consommé.

## Installation

Prérequis : Node.js ≥ 18, et être connecté à Claude Code avec son abonnement.

```bash
git clone https://github.com/yeezop/claude-statusline-quota.git
cd claude-statusline-quota
./install.sh
```

Puis redémarre Claude Code.

### Installation manuelle

1. Copie `statusline-quota.mjs` dans `~/.claude/` ;
2. Ajoute dans `~/.claude/settings.json` (remplace le chemin de `node` par le résultat de `which node`) :

```json
"statusLine": {
  "type": "command",
  "command": "/chemin/vers/node /Users/TOI/.claude/statusline-quota.mjs",
  "padding": 0
}
```

## Notes

- La détection de la fenêtre 1M se fait via le payload de Claude Code, puis via le modèle pinné dans `settings.json` (suffixe `[1m]`), puis via un garde-fou (> 200k tokens utilisés ⇒ 1M).
- Le rafraîchissement est event-driven : la statusline ne se met à jour que lorsque la conversation change (au max toutes les ~300 ms). À l'idle, consommation nulle.

## Licence

MIT
