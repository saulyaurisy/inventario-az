[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("inventario-az-share-" + [guid]::NewGuid().ToString("N"))
$serverOutput = Join-Path $runtimeDirectory "next-output.log"
$serverError = Join-Path $runtimeDirectory "next-error.log"
$tunnelOutput = Join-Path $runtimeDirectory "cloudflared-output.log"
$tunnelError = Join-Path $runtimeDirectory "cloudflared-error.log"
$serverProcess = $null
$tunnelProcess = $null
$consoleControlModeChanged = $false
$previousTreatControlCAsInput = $false

function Assert-Repository {
    $packagePath = Join-Path $repositoryRoot "package.json"
    if (-not (Test-Path -LiteralPath $packagePath)) {
        throw "No se encontro package.json. Ejecuta el script dentro de Inventario AZ."
    }
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne "inventario-az") {
        throw "Este repositorio no corresponde a Inventario AZ."
    }
}

function Get-RequiredCommandPath {
    param([string]$Name, [string]$InstallMessage)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) { throw $InstallMessage }
    return $command.Source
}

function Get-PortOwner {
    param([int]$CandidatePort)
    $listener = Get-NetTCPConnection -LocalPort $CandidatePort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $listener) { return $null }
    $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        Id = $listener.OwningProcess
        Name = if ($null -eq $owner) { "desconocido" } else { $owner.ProcessName }
    }
}

function Select-FreePort {
    param([int]$PreferredPort)
    $candidate = $PreferredPort
    while ($candidate -le 65535) {
        $owner = Get-PortOwner -CandidatePort $candidate
        if ($null -eq $owner) { return $candidate }
        Write-Warning ("Puerto {0} ocupado por PID {1} ({2}). No se detendra ese proceso." -f $candidate, $owner.Id, $owner.Name)
        $candidate++
    }
    throw "No se encontro un puerto libre."
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 45,
        [System.Diagnostics.Process]$Process
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastFailure = "sin respuesta"
    while ((Get-Date) -lt $deadline) {
        if ($null -ne $Process -and $Process.HasExited) {
            throw "El proceso termino antes de que respondiera $Url."
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $response.StatusCode
            }
            $lastFailure = "HTTP $($response.StatusCode)"
        }
        catch {
            $lastFailure = $_.Exception.Message
            Start-Sleep -Milliseconds 750
            continue
        }
        Start-Sleep -Milliseconds 750
    }
    throw "Tiempo agotado esperando respuesta de $Url. Ultimo error: $lastFailure"
}

function Get-ProcessDescendants {
    param([int]$RootProcessId)
    $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $pending = New-Object System.Collections.Generic.Queue[int]
    $pending.Enqueue($RootProcessId)
    $descendants = New-Object System.Collections.Generic.List[int]
    while ($pending.Count -gt 0) {
        $parentId = $pending.Dequeue()
        foreach ($child in $allProcesses | Where-Object { $_.ParentProcessId -eq $parentId }) {
            $childId = [int]$child.ProcessId
            $descendants.Add($childId)
            $pending.Enqueue($childId)
        }
    }
    return @($descendants)
}

function Stop-StartedProcessTree {
    param([System.Diagnostics.Process]$RootProcess)
    if ($null -eq $RootProcess) { return }
    $rootId = $RootProcess.Id
    $descendants = @(Get-ProcessDescendants -RootProcessId $rootId)
    [array]::Reverse($descendants)
    foreach ($processIdValue in $descendants) {
        Stop-Process -Id $processIdValue -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $rootId -Force -ErrorAction SilentlyContinue
}

function Read-TunnelUrl {
    param(
        [System.Diagnostics.Process]$Process,
        [int]$TimeoutSeconds = 60
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $pattern = 'https://[a-z0-9-]+\.trycloudflare\.com'
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) { throw "cloudflared termino antes de crear el tunel." }
        $content = ""
        if (Test-Path -LiteralPath $tunnelOutput) {
            $content += Get-Content -LiteralPath $tunnelOutput -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $tunnelError) {
            $content += Get-Content -LiteralPath $tunnelError -Raw -ErrorAction SilentlyContinue
        }
        $match = [regex]::Match($content, $pattern)
        if ($match.Success) { return $match.Value }
        Start-Sleep -Milliseconds 500
    }
    throw "cloudflared no devolvio una URL trycloudflare.com dentro del tiempo esperado."
}

Push-Location $repositoryRoot
try {
    Assert-Repository
    $nodePath = Get-RequiredCommandPath -Name "node.exe" -InstallMessage "Node.js no esta disponible."
    $npmPath = Get-RequiredCommandPath -Name "npm.cmd" -InstallMessage "npm no esta disponible."
    $cloudflaredPath = Get-RequiredCommandPath -Name "cloudflared.exe" -InstallMessage "cloudflared no esta instalado o no esta en PATH. Instalalo manualmente y vuelve a ejecutar."
    Write-Host "Herramientas confirmadas:" -ForegroundColor Green
    Write-Host "- node: $nodePath"
    Write-Host "- npm: $npmPath"
    Write-Host "- cloudflared: $cloudflaredPath"

    $selectedPort = Select-FreePort -PreferredPort $Port
    Write-Host "Puerto local seleccionado: $selectedPort" -ForegroundColor Cyan

    Write-Host "Ejecutando build de produccion..." -ForegroundColor Cyan
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build fallo; no se inicio el acceso temporal." }

    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    # cmd.exe /s /c requires one outer quoted command when the executable path
    # itself contains spaces (the normal Node.js installation path on Windows).
    $serverCommand = '""{0}" run start -- -p {1}"' -f $npmPath, $selectedPort
    $serverProcess = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $serverCommand) -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $serverOutput -RedirectStandardError $serverError -PassThru
    $localUrl = "http://localhost:$selectedPort"
    $localStatus = Wait-ForHttp -Url $localUrl -Process $serverProcess
    Write-Host "Servidor Next.js listo: $localUrl (HTTP $localStatus)" -ForegroundColor Green

    $tunnelProcess = Start-Process -FilePath $cloudflaredPath -ArgumentList @("tunnel", "--url", $localUrl, "--no-autoupdate") -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $tunnelOutput -RedirectStandardError $tunnelError -PassThru
    $publicUrl = Read-TunnelUrl -Process $tunnelProcess
    $hostname = ([uri]$publicUrl).Host
    $rootStatus = Wait-ForHttp -Url "$publicUrl/" -Process $tunnelProcess
    $loginStatus = Wait-ForHttp -Url "$publicUrl/login" -Process $tunnelProcess

    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host "LINK TEMPORAL INVENTARIO AZ" -ForegroundColor Green
    Write-Host $publicUrl -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host "Firebase Authorized Domain: $hostname" -ForegroundColor Yellow
    Write-Host "Agrega este hostname en Firebase Console > Authentication > Settings > Authorized domains si aun no esta autorizado." -ForegroundColor Yellow
    Write-Host "Smoke test /: HTTP $rootStatus"
    Write-Host "Smoke test /login: HTTP $loginStatus"
    Write-Host "Presiona Ctrl+C para cerrar el acceso temporal." -ForegroundColor Cyan

    try {
        $previousTreatControlCAsInput = [Console]::TreatControlCAsInput
        [Console]::TreatControlCAsInput = $true
        $consoleControlModeChanged = $true
    }
    catch {
        $consoleControlModeChanged = $false
    }

    while (-not $serverProcess.HasExited -and -not $tunnelProcess.HasExited) {
        if ($consoleControlModeChanged -and [Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            $isControlC = $key.Key -eq [ConsoleKey]::C -and (($key.Modifiers -band [ConsoleModifiers]::Control) -ne 0)
            if ($isControlC) {
                Write-Host "Cierre solicitado por el usuario." -ForegroundColor Cyan
                break
            }
        }
        Start-Sleep -Milliseconds 250
    }
    if ($serverProcess.HasExited) { throw "El servidor Next.js termino inesperadamente." }
    if ($tunnelProcess.HasExited) { throw "cloudflared termino inesperadamente." }
}
finally {
    if ($consoleControlModeChanged) {
        [Console]::TreatControlCAsInput = $previousTreatControlCAsInput
    }
    Write-Host "Cerrando unicamente los procesos iniciados por este script..." -ForegroundColor Cyan
    Stop-StartedProcessTree -RootProcess $tunnelProcess
    Stop-StartedProcessTree -RootProcess $serverProcess
    $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeDirectory)
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedRuntime.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedRuntime)) {
        Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}
