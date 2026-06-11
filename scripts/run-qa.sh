#!/usr/bin/env bash
# =============================================================================
# TallerFlow — QA Suite
#
# Uso:
#   bash scripts/run-qa.sh             # Ejecutar todos los pasos
#   bash scripts/run-qa.sh --no-e2e   # Omitir tests E2E (más rápido)
#
# Prerrequisitos:
#   • Docker con PostgreSQL corriendo  (docker compose up -d)
#   • Servidor de desarrollo NO corriendo; Playwright lo inicia solo
#   • Variables de entorno en .env
#
# Notas:
#   • Type check usa tsconfig.check.json (excluye src/fase2_broken_tests/
#     que contiene pruebas WIP con errores de sintaxis intencionados).
#   • El paso E2E puede omitirse con --no-e2e si solo se quiere lint+tests.
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ── Colores ───────────────────────────────────────────────────────────────────

if [ -t 1 ] && command -v tput &>/dev/null; then
  RED=$(tput setaf 1)
  GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3)
  CYAN=$(tput setaf 6)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  RED='' GREEN='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

step()  { echo; echo "${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }
ok()    { echo "${GREEN}  ✓ $*${RESET}"; }
fail()  { echo "${RED}  ✗ $*${RESET}"; }
warn()  { echo "${YELLOW}  ⚠ $*${RESET}"; }
info()  { echo "  → $*"; }

elapsed_ms() {
  local start=$1 end
  end=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "$start")
  echo $(( end - start ))
}

# ── Argumentos ────────────────────────────────────────────────────────────────

RUN_E2E=true
for arg in "$@"; do
  case "$arg" in
    --no-e2e) RUN_E2E=false ;;
  esac
done

# ── Estado ────────────────────────────────────────────────────────────────────

FAILED_STEPS=()
TOTAL_START=$(date +%s%3N 2>/dev/null || echo "0")

pass_or_fail() {
  local name=$1 exit_code=$2 ms=$3
  if [ "$exit_code" -eq 0 ]; then
    ok "$name completado (${ms}ms)"
  else
    fail "$name FALLÓ (${ms}ms)"
    FAILED_STEPS+=("$name")
  fi
}

# ── Cabecera ──────────────────────────────────────────────────────────────────

echo
echo "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo "${BOLD}║   TallerFlow — QA Suite                  ║${RESET}"
echo "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo
info "Directorio: $(pwd)"
info "Node: $(node --version 2>/dev/null || echo 'no encontrado')"
info "npm:  $(npm --version 2>/dev/null || echo 'no encontrado')"
info "Fecha: $(date '+%Y-%m-%d %H:%M:%S')"
[ "$RUN_E2E" = false ] && warn "Modo --no-e2e: se omitirán los tests E2E"

# ── 1. Lint ───────────────────────────────────────────────────────────────────

step "1. Lint (ESLint)"
t0=$(date +%s%3N 2>/dev/null || echo "0")
set +e
npm run lint
LINT_CODE=$?
set -e
ms=$(elapsed_ms "$t0")
pass_or_fail "Lint" "$LINT_CODE" "$ms"

# ── 2. Type check ─────────────────────────────────────────────────────────────

step "2. Type check (TypeScript)"
info "Usando tsconfig.check.json (excluye src/fase2_broken_tests/)"
t0=$(date +%s%3N 2>/dev/null || echo "0")
set +e
npx tsc --noEmit --project tsconfig.check.json
TSC_CODE=$?
set -e
ms=$(elapsed_ms "$t0")
pass_or_fail "Type check" "$TSC_CODE" "$ms"

# ── 3. Unit + Integration tests ───────────────────────────────────────────────

step "3. Unit + Integration tests (Vitest)"
t0=$(date +%s%3N 2>/dev/null || echo "0")
set +e
npx vitest run
VITEST_CODE=$?
set -e
ms=$(elapsed_ms "$t0")
pass_or_fail "Vitest" "$VITEST_CODE" "$ms"

# ── 4. E2E tests ──────────────────────────────────────────────────────────────

if [ "$RUN_E2E" = true ]; then
  step "4. E2E tests (Playwright)"
  info "Playwright inicia el servidor de desarrollo automáticamente"
  t0=$(date +%s%3N 2>/dev/null || echo "0")
  set +e
  npx playwright test
  E2E_CODE=$?
  set -e
  ms=$(elapsed_ms "$t0")
  pass_or_fail "E2E (Playwright)" "$E2E_CODE" "$ms"
else
  step "4. E2E tests (OMITIDO — --no-e2e)"
  warn "Omitido por argumento --no-e2e"
fi

# ── 5. npm audit ──────────────────────────────────────────────────────────────

step "5. npm audit (vulnerabilidades high/critical)"
t0=$(date +%s%3N 2>/dev/null || echo "0")
set +e
npm audit --audit-level=high
AUDIT_CODE=$?
set -e
ms=$(elapsed_ms "$t0")
pass_or_fail "npm audit" "$AUDIT_CODE" "$ms"

# ── Resumen ───────────────────────────────────────────────────────────────────

TOTAL_MS=$(elapsed_ms "$TOTAL_START")
TOTAL_S=$(( TOTAL_MS / 1000 ))
TOTAL_REM=$(( TOTAL_MS % 1000 ))

echo
echo "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo "${BOLD}║   Resumen QA                             ║${RESET}"
echo "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo
info "Tiempo total: ${TOTAL_S}.${TOTAL_REM}s"
echo

if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
  echo "${BOLD}${GREEN}  ✓ TODOS LOS PASOS COMPLETADOS EXITOSAMENTE${RESET}"
  echo
  exit 0
else
  echo "${BOLD}${RED}  ✗ PASOS FALLIDOS:${RESET}"
  for s in "${FAILED_STEPS[@]}"; do
    echo "${RED}      • $s${RESET}"
  done
  echo
  exit 1
fi
