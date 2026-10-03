[CmdletBinding()]
param(
    [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedProject = "inventario-az"
$blockedProject = "azbel-corp"
$confirmationText = "BORRAR DATOS OPERATIVOS inventario-az"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$helperPath = Join-Path $PSScriptRoot "reset-operational-data.cjs"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Assert-Repository {
    $packagePath = Join-Path $repositoryRoot "package.json"
    if (-not (Test-Path -LiteralPath $packagePath)) {
        throw "No se encontro package.json. Ejecuta el script dentro de Inventario AZ."
    }
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne "inventario-az") {
        throw "Este repositorio no corresponde a Inventario AZ."
    }
    if (-not (Test-Path -LiteralPath $helperPath)) {
        throw "No se encontro el helper seguro de reset."
    }
}

function Get-ActiveFirebaseProject {
    $npxCommand = Get-Command npx.cmd -ErrorAction Stop
    $output = @(& $npxCommand.Source firebase-tools use 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo consultar el proyecto activo con Firebase CLI."
    }
    $activeProject = ($output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ } | Select-Object -Last 1)
    if ($activeProject -eq $blockedProject) {
        throw "Operacion bloqueada: nunca se permite ejecutar el reset sobre $blockedProject."
    }
    if ($activeProject -ne $expectedProject) {
        throw "Proyecto Firebase inesperado: '$activeProject'. Se esperaba '$expectedProject'."
    }
    return $activeProject
}

function Invoke-ResetHelper {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("audit", "execute")][string]$Mode,
        [string]$BackupDirectory
    )
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $arguments = @($helperPath, $Mode)
    if ($BackupDirectory) { $arguments += $BackupDirectory }
    $json = & $nodeCommand.Source @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "La operacion '$Mode' fallo. No se continuo con el reset."
    }
    return ($json | Out-String | ConvertFrom-Json)
}

function Show-Counts {
    param([object]$Summary)
    $labels = [ordered]@{
        products = "Productos"
        product_skus = "Product SKUs"
        clients = "Clientes"
        client_documents = "Documentos de clientes"
        inventory = "Inventarios"
        inventory_movements = "Movimientos de inventario"
        replenishments = "Reposiciones"
        sales = "Ventas"
        sale_intents = "Intenciones de venta"
        sale_payment_proofs = "Comprobantes"
        payment_proof_uploads = "Subidas de comprobantes"
        suppliers = "Proveedores"
        purchases = "Compras"
        system_counters = "Counters totales"
        users = "Users / perfiles"
    }
    foreach ($entry in $labels.GetEnumerator()) {
        $property = $Summary.counts.PSObject.Properties[$entry.Key]
        $value = if ($null -eq $property) { 0 } else { $property.Value }
        Write-Host ("{0}: {1}" -f $entry.Value, $value)
    }
    Write-Host ("Counters operativos: {0}" -f $Summary.operationalCounters)
    Write-Host ("Usuarios Firebase Auth: {0}" -f $Summary.authUsers)
    Write-Host ("Archivos en carpeta Drive: {0}" -f $Summary.driveFiles)
    Write-Host ("Carpeta Drive privada: {0}" -f $Summary.drivePrivate)
    if ($Summary.unknownCollections.Count -gt 0) {
        Write-Warning ("Colecciones adicionales detectadas: " + ($Summary.unknownCollections -join ", "))
    }
}

Push-Location $repositoryRoot
try {
    Assert-Repository
    Write-Section "Verificacion de seguridad"
    $activeProject = Get-ActiveFirebaseProject
    Write-Host "Proyecto Firebase confirmado: $activeProject" -ForegroundColor Green

    Write-Section "Auditoria actual"
    $audit = Invoke-ResetHelper -Mode "audit"
    Show-Counts -Summary $audit

    if (-not $Execute) {
        Write-Host ""
        Write-Host ("DRY RUN {0} No se elimin{1} ning{2}n dato" -f [char]0x2014, [char]0x00F3, [char]0x00FA) -ForegroundColor Yellow
        exit 0
    }

    Write-Host ""
    Write-Warning "Esta operacion eliminara datos operativos de inventario-az."
    $confirmation = Read-Host "Escribe exactamente: $confirmationText"
    if ($confirmation -cne $confirmationText) {
        Write-Warning "Confirmacion incorrecta. Operacion abortada; no se elimino ningun dato."
        exit 2
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDirectory = Join-Path $env:LOCALAPPDATA "Temp\inventario-az-backups\reset-$timestamp"
    Write-Section "Backup y reset"
    Write-Host "Creando backup fuera de Git en: $backupDirectory"
    $result = Invoke-ResetHelper -Mode "execute" -BackupDirectory $backupDirectory

    Write-Section "ANTES"
    Show-Counts -Summary $result.before
    Write-Section "DESPUES"
    Show-Counts -Summary $result.after
    Write-Host ("Archivos Drive eliminados: {0}" -f $result.deletedDriveFiles)
    Write-Host ("Counters reiniciados: {0}" -f ($result.resetCounters -join ", "))
    Write-Host "Backup local: $($result.backupDirectory)" -ForegroundColor Green
    Write-Host "Users/perfiles y Firebase Authentication fueron conservados." -ForegroundColor Green
}
finally {
    Pop-Location
}
