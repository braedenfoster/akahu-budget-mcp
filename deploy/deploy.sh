#!/usr/bin/env bash
#
# Deploy akahu-budget-mcp + auth-page to the Raspberry Pi over the tailnet.
# Run from your Mac while connected to Tailscale:
#
#   ./deploy/deploy.sh                 # deploy both
#   PI=user@host ./deploy/deploy.sh    # override the target
#
# Two mechanisms, on purpose (see deploy/phase2-funnel-oauth.md):
#   - The MCP server BUILDS on the Pi: git pull + pnpm install + pnpm build.
#   - The auth-page CANNOT build on the Pi (no Stytch build token or deps there,
#     and dist/ is gitignored), so it ships as a prebuilt bundle via rsync.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- Config ----------------------------------------------------------------
# Identifying values (Pi user/host, tailnet URL) live in deploy/.env, which is
# git-ignored. Copy deploy/.env.example to deploy/.env and fill it in.
#
# Load KEY=value lines from a git-ignored env file. Values already present in
# the environment win, so `PI=user@host ./deploy/deploy.sh` still overrides.
load_env() {
  local file="$1" line key val cur
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|[#]*) continue ;; esac
    key="${line%%=*}"; key="${key//[[:space:]]/}"
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    val="${line#*=}"
    eval "cur=\${$key-}"
    [ -n "$cur" ] || eval "$key=\$val"
  done < "$file"
}
load_env "$ROOT/deploy/.env"

PI="${PI:-}"                                                  # SSH target: user@host (tailnet IP or hostname)
PI_DIR="${PI_DIR:-akahu-budget-mcp}"                          # repo path on the Pi, relative to $HOME
PUBLIC_URL="${PUBLIC_URL:-}"                                  # public base URL (Funnel) for the health checks

[ -n "$PI" ]         || die "PI is not set. Copy deploy/.env.example to deploy/.env and fill it in (or export PI=user@host)."
[ -n "$PUBLIC_URL" ] || die "PUBLIC_URL is not set. See deploy/.env.example."

# --- Preflight -------------------------------------------------------------
say "Preflight: reaching $PI"
ssh -o BatchMode=yes -o ConnectTimeout=8 "$PI" true 2>/dev/null \
  || die "Can't SSH to $PI. Are you on the Tailscale network? (override with PI=user@host)"

grep -q '^VITE_STYTCH_PUBLIC_TOKEN=' auth-page/.env 2>/dev/null \
  || die "auth-page/.env has no VITE_STYTCH_PUBLIC_TOKEN — the built page would fail loudly."

# --- 1. Build the auth-page locally (the Pi can't) -------------------------
say "Building auth-page bundle (local)"
pnpm --filter auth-page build

# --- 2. Update + build the MCP server on the Pi ----------------------------
# --ff-only fails loudly if the Pi's history diverged or its tree is dirty,
# rather than silently merging.
say "Pi: git pull + build MCP server"
ssh "$PI" "set -euo pipefail; cd '$PI_DIR'; git pull --ff-only; pnpm install; pnpm build"

# --- 3. Ship the prebuilt auth-page bundle ---------------------------------
# --delete on dist/ clears stale content-hashed assets from previous builds.
# serve.mjs is tracked, but rsync it too so it always matches the shipped dist.
say "Pi: rsync auth-page bundle"
rsync -az --delete auth-page/dist/ "$PI:$PI_DIR/auth-page/dist/"
rsync -az auth-page/serve.mjs "$PI:$PI_DIR/auth-page/serve.mjs"

# --- 4. Restart both services (sudo is passwordless on the Pi) --------------
say "Pi: restart services"
ssh "$PI" "sudo systemctl restart akahu-budget-mcp auth-page; systemctl is-active akahu-budget-mcp auth-page"

# --- 5. Verify public endpoints (poll until ready) -------------------------
# The MCP server binds its port a few seconds after systemd reports "active"
# (it runs a startup sync first), so poll rather than checking once — else the
# check races the restart and reports a false 502.
say "Verify public endpoints"
check() {
  local path="$1" tries=20 code=000
  for ((i = 1; i <= tries; i++)); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL$path" 2>/dev/null || echo 000)"
    case "$code" in 2??) printf '  %s%-18s -> %s\n' "$PUBLIC_URL" "$path" "$code"; return 0 ;; esac
    sleep 2
  done
  printf '  %s%-18s -> %s (after %ds)\n' "$PUBLIC_URL" "$path" "$code" "$((tries * 2))"
  return 1
}
rc=0
for path in /healthz /oauth/authorize; do check "$path" || rc=1; done
[ "$rc" -eq 0 ] || die "Endpoint(s) still not 2xx after waiting — check 'journalctl -u akahu-budget-mcp' / '-u auth-page' on the Pi."

say "Done. Auth-page + MCP server deployed."
