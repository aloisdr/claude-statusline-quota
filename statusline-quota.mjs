#!/usr/bin/env node
// Statusline Claude Code : % de quota d'abonnement (session 5h, weekly, par modèle)
// + % de fenêtre de contexte. Aucun prix affiché.
// Source quotas : https://api.anthropic.com/api/oauth/usage (token OAuth du Keychain macOS)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, openSync, readSync, fstatSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_FILE = join(homedir(), ".claude", ".quota-cache.json");
const CACHE_TTL_MS = 30_000;

// ---------- helpers ----------
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
function colorPct(pct) {
  if (pct == null) return `${DIM}?%${RESET}`;
  const c = pct >= 90 ? "\x1b[31m" : pct >= 70 ? "\x1b[33m" : "\x1b[32m";
  return `${c}${Math.round(pct)}%${RESET}`;
}
function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "k";
  return String(n);
}
function fmtResetLocal(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ---------- stdin (payload Claude Code) ----------
let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {}
const modelName = payload?.model?.display_name ?? "Claude";
const modelId = payload?.model?.id ?? "";
const transcriptPath = payload?.transcript_path;

// ---------- taille de la fenêtre de contexte ----------
function contextLimit(usedTokens) {
  // 1) le payload mentionne 1M (id "[1m]" ou display_name "1M context")
  if (/\[1m\]|-1m/i.test(modelId) || /1M/i.test(modelName)) return 1_000_000;
  // 2) le modèle pinné dans settings.json est en variante 1M
  try {
    const settings = JSON.parse(
      readFileSync(join(homedir(), ".claude", "settings.json"), "utf8")
    );
    if (/\[1m\]/i.test(settings?.model ?? "")) return 1_000_000;
  } catch {}
  // 3) garde-fou : plus de 200k tokens utilisés → forcément une fenêtre 1M
  if (usedTokens > 200_000) return 1_000_000;
  return 200_000;
}

// ---------- contexte : derniers usage tokens du transcript ----------
function contextInfo() {
  if (!transcriptPath) return null;
  let tail;
  try {
    // Lire uniquement les derniers 512 Ko du transcript (suffisant, évite les gros fichiers)
    const fd = openSync(transcriptPath, "r");
    const size = fstatSync(fd).size;
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    closeSync(fd);
    tail = buf.toString("utf8");
  } catch {
    return null;
  }
  const lines = tail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"usage"')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.isSidechain) continue;
      const u = entry?.message?.usage;
      if (!u || u.input_tokens == null) continue;
      const used =
        (u.input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0);
      const limit = contextLimit(used);
      return { used, limit, pct: (used / limit) * 100 };
    } catch {}
  }
  return null;
}

// ---------- quotas : endpoint OAuth (avec cache 30 s) ----------
function fetchQuota() {
  // cache frais ?
  try {
    const cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    if (Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
  } catch {}

  let token;
  try {
    // macOS : token dans le Keychain
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", timeout: 3000 }
    );
    token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
  } catch {}
  if (!token) {
    // Linux/Windows (ou macOS sans Keychain) : fichier de credentials
    try {
      const raw = readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf8");
      token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
    } catch {}
  }
  if (!token) return staleCache();

  try {
    const res = execFileSync(
      "curl",
      [
        "-s", "--max-time", "4",
        "https://api.anthropic.com/api/oauth/usage",
        "-H", `Authorization: Bearer ${token}`,
        "-H", "anthropic-beta: oauth-2025-04-20",
      ],
      { encoding: "utf8", timeout: 6000 }
    );
    const data = JSON.parse(res);
    if (!Array.isArray(data?.limits)) return staleCache();
    try {
      writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
    return data;
  } catch {
    return staleCache();
  }
}
function staleCache() {
  // API indisponible → on réutilise le dernier résultat connu, même périmé
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")).data;
  } catch {
    return null;
  }
}

// ---------- assemblage ----------
const parts = [`🤖 ${modelName}`];

const ctx = contextInfo();
if (ctx) {
  parts.push(`🧠 ${colorPct(ctx.pct)} ${DIM}(${fmtTokens(ctx.used)}/${fmtTokens(ctx.limit)})${RESET}`);
}

const quota = fetchQuota();
if (quota?.limits) {
  const session = quota.limits.find((l) => l.kind === "session");
  const weekly = quota.limits.find((l) => l.kind === "weekly_all");
  const scoped = quota.limits.filter((l) => l.kind === "weekly_scoped");

  if (session) {
    const reset = session.resets_at ? ` ${DIM}→${fmtResetLocal(session.resets_at)}${RESET}` : "";
    parts.push(`⏱️ 5h: ${colorPct(session.percent)}${reset}`);
  }
  if (weekly) parts.push(`📅 Sem: ${colorPct(weekly.percent)}`);
  for (const s of scoped) {
    const name = s?.scope?.model?.display_name ?? "Modèle";
    parts.push(`🎭 ${name}: ${colorPct(s.percent)}`);
  }
} else {
  parts.push(`${DIM}quotas indisponibles${RESET}`);
}

process.stdout.write(parts.join(` ${DIM}|${RESET} `));
