#Requires -Version 7.0
<#
.SYNOPSIS
    TallerFlow — QA Suite completo

.DESCRIPTION
    Ejecuta los 5 pasos de QA en orden:
      1. Lint        (ESLint)
      2. Type check  (TypeScript — tsconfig.check.json)
      3. Unit tests  (Vitest)
      4. E2E tests   (Playwright — inicia el dev server automáticamente)
      5. Audit       (npm audit --audit-level=high)

.PARAMETER NoE2E
    Omite el paso E2E. Útil para checks rápidos de lint + tipos + unit tests.

.EXAMPLE
    # Ejecutar suite completa
    pwsh scripts/run-qa.ps1

.EXAMPLE
    # Sin E2E (más rápido)
    pwsh scripts/run-qa.ps1 -NoE2E

.NOTES
    Prerrequisitos:
      • Docker con PostgreSQL corriendo: docker compose up -d
      • El servidor de desarrollo NO debe estar corriendo previamente;
        Playwright lo inicia solo (reuseExistingServer: false en CI)
      • Variables de entorno en .env

    El type-check usa tsconfig.check.json que excluye src/fase2_broken_tests/,
    directorio de pruebas WIP con errores de sintaxis intencionados.
#>

[CmdletBinding()]
param(
    [switch]$NoE2E
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ── Colores (ANSI, PS7+) ──────────────────────────────────────────────────────

$ESC = [char]27
$C = @{
    Reset  = "$ESC[0m"
    Bold   = "$ESC[1m"
    Red    = "$ESC[31m"
    Green  = "$ESC[32m"
    Yellow = "$ESC[33m"
    Cyan   = "$ESC[36m"
}

function Write-Step  ([string]$Num, [string]$Msg) {
    Write-Host "`n$($C.Bold)$($C.Cyan)━━━ $Num. $Msg ━━━$($C.Reset)"
}
function Write-Ok    ([string]$Msg) { Write-Host "$($C.Green)  ✓ $Msg$($C.Reset)" }
function Write-Fail  ([string]$Msg) { Write-Host "$($C.Red)  ✗ $Msg$($C.Reset)" }
function Write-Warn  ([string]$Msg) { Write-Host "$($C.Yellow)  ⚠ $Msg$($C.Reset)" }
function Write-Info  ([string]$Msg) { Write-Host "  → $Msg" }

# ── Helpers ───────────────────────────────────────────────────────────────────

$FailedSteps = [System.Collections.Generic.List[string]]::new()
$TotalStart  = [System.Diagnostics.Stopwatch]::StartNew()

function Invoke-Step {
    param(
        [string]   $Name,
        [string[]] $Command,
        [switch]   $AllowFailure
    )

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $Command[0] @($Command[1..($Command.Length - 1)])
    $exitCode = $LASTEXITCODE
    $sw.Stop()
    $ms = [int]$sw.ElapsedMilliseconds

    if ($exitCode -eq 0) {
        Write-Ok "$Name completado (${ms}ms)"
    } else {
        Write-Fail "$Name FALLÓ — exit code $exitCode (${ms}ms)"
        if (-not $AllowFailure) {
            $script:FailedSteps.Add($Name)
        }
    }
    return $exitCode
}

# ── Cabecera ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "$($C.Bold)╔══════════════════════════════════════════╗$($C.Reset)"
Write-Host "$($C.Bold)║   TallerFlow — QA Suite                  ║$($C.Reset)"
Write-Host "$($C.Bold)╚══════════════════════════════════════════╝$($C.Reset)"
Write-Host ""
Write-Info "Directorio: $(Get-Location)"
Write-Info "PowerShell: $($PSVersionTable.PSVersion)"
Write-Info "Node:       $(node --version 2>$null)"
Write-Info "npm:        $(npm --version 2>$null)"
Write-Info "Fecha:      $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
if ($NoE2E) { Write-Warn "Modo -NoE2E: se omitirán los tests E2E" }

# ── 1. Lint ───────────────────────────────────────────────────────────────────

Write-Step "1" "Lint (ESLint)"
Invoke-Step -Name "Lint" -Command @("npm", "run", "lint") | Out-Null

# ── 2. Type check ─────────────────────────────────────────────────────────────

Write-Step "2" "Type check (TypeScript)"
Write-Info "Usando tsconfig.check.json (excluye src/fase2_broken_tests/)"
Invoke-Step -Name "Type check" -Command @("npx", "tsc", "--noEmit", "--project", "tsconfig.check.json") | Out-Null

# ── 3. Unit + Integration tests ───────────────────────────────────────────────

Write-Step "3" "Unit + Integration tests (Vitest)"
Invoke-Step -Name "Vitest" -Command @("npx", "vitest", "run") | Out-Null

# ── 4. E2E tests ──────────────────────────────────────────────────────────────

if (-not $NoE2E) {
    Write-Step "4" "E2E tests (Playwright)"
    Write-Info "Playwright inicia el servidor de desarrollo automáticamente"
    Invoke-Step -Name "E2E (Playwright)" -Command @("npx", "playwright", "test") | Out-Null
} else {
    Write-Step "4" "E2E tests (OMITIDO — -NoE2E)"
    Write-Warn "Omitido por parámetro -NoE2E"
}

# ── 5. npm audit ──────────────────────────────────────────────────────────────

Write-Step "5" "npm audit (vulnerabilidades high/critical)"
Invoke-Step -Name "npm audit" -Command @("npm", "audit", "--audit-level=high") | Out-Null

# ── Resumen ───────────────────────────────────────────────────────────────────

$TotalStart.Stop()
$totalSec = [Math]::Round($TotalStart.Elapsed.TotalSeconds, 1)

Write-Host ""
Write-Host "$($C.Bold)╔══════════════════════════════════════════╗$($C.Reset)"
Write-Host "$($C.Bold)║   Resumen QA                             ║$($C.Reset)"
Write-Host "$($C.Bold)╚══════════════════════════════════════════╝$($C.Reset)"
Write-Host ""
Write-Info "Tiempo total: ${totalSec}s"
Write-Host ""

if ($FailedSteps.Count -eq 0) {
    Write-Host "$($C.Bold)$($C.Green)  ✓ TODOS LOS PASOS COMPLETADOS EXITOSAMENTE$($C.Reset)"
    Write-Host ""
    exit 0
} else {
    Write-Host "$($C.Bold)$($C.Red)  ✗ PASOS FALLIDOS:$($C.Reset)"
    foreach ($step in $FailedSteps) {
        Write-Host "$($C.Red)      • $step$($C.Reset)"
    }
    Write-Host ""
    exit 1
}
