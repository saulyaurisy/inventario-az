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
    try { $null = $RootProcess.WaitForExit(5000) } catch { }
    try { $RootProcess.Dispose() } catch { }
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

function Get-TunnelLogContent {
    $parts = @()
    foreach ($logPath in @($tunnelOutput, $tunnelError)) {
        if (Test-Path -LiteralPath $logPath) {
            $content = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
            if (-not [string]::IsNullOrWhiteSpace($content)) { $parts += $content }
        }
    }
    return ($parts -join [Environment]::NewLine)
}

function Get-TunnelLogTail {
    param([int]$LineCount = 12)
    $content = Get-TunnelLogContent
    if ([string]::IsNullOrWhiteSpace($content)) { return "(cloudflared no escribio logs)" }
    $lines = @($content -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    return (($lines | Select-Object -Last $LineCount) -join [Environment]::NewLine)
}

function Test-TunnelRegistration {
    $content = Get-TunnelLogContent
    return $content -match '(?i)Registered tunnel connection|tunnel connection.*registered'
}

function Resolve-TunnelHostname {
    param(
        [string]$Hostname,
        [string]$Server
    )

    if ($null -eq (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue)) {
        return [pscustomobject]@{
            Resolved = $false
            Addresses = @()
            Error = "Resolve-DnsName no esta disponible."
        }
    }

    try {
        $resolveParameters = @{
            Name = $Hostname
            Type = "A"
            DnsOnly = $true
            QuickTimeout = $true
            ErrorAction = "Stop"
        }
        if (-not [string]::IsNullOrWhiteSpace($Server)) {
            $resolveParameters.Server = $Server
        }

        $records = @(Resolve-DnsName @resolveParameters)
        $addresses = @(
            $records |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_.IPAddress) } |
                ForEach-Object { $_.IPAddress } |
                Select-Object -Unique
        )
        return [pscustomobject]@{
            Resolved = $addresses.Count -gt 0
            Addresses = $addresses
            Error = if ($addresses.Count -gt 0) { $null } else { "El resolver no devolvio registros A." }
        }
    }
    catch {
        return [pscustomobject]@{
            Resolved = $false
            Addresses = @()
            Error = $_.Exception.Message
        }
    }
}

function Get-HttpFailureMessage {
    param(
        [System.Management.Automation.ErrorRecord]$ErrorRecord,
        [string]$Target
    )
    $responseProperty = $ErrorRecord.Exception.PSObject.Properties["Response"]
    $statusProperty = if ($null -eq $responseProperty -or $null -eq $responseProperty.Value) {
        $null
    }
    else {
        $responseProperty.Value.PSObject.Properties["StatusCode"]
    }
    if ($null -ne $statusProperty) {
        return "HTTP $([int]$statusProperty.Value) en $Target"
    }
    return "$Target`: $($ErrorRecord.Exception.Message)"
}

function Wait-ForPublicTunnel {
    param(
        [string]$PublicUrl,
        [string]$Hostname,
        [System.Diagnostics.Process]$Process,
        [int]$MaxAttempts = 36,
        [int]$DelaySeconds = 5
    )
    $lastFailure = "sin respuesta"
    $registrationObserved = $false
    $localDns = [pscustomobject]@{ Resolved = $false; Addresses = @(); Error = "Sin comprobar" }
    $publicDns = [pscustomobject]@{ Resolved = $false; Addresses = @(); Error = "Sin comprobar" }
    $rootStatus = $null
    $loginStatus = $null

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if ($Process.HasExited) {
            $logTail = Get-TunnelLogTail
            Write-Warning "cloudflared termino durante la espera. Ultimas lineas:"
            Write-Host $logTail
            return [pscustomobject]@{
                Success = $false
                Published = $false
                FailureType = "Proceso cloudflared"
                LastError = "cloudflared termino antes de publicar el tunel."
                RootStatus = $null
                LoginStatus = $null
                Registered = $registrationObserved
                LocalDnsResolved = $localDns.Resolved
                PublicDnsResolved = $false
            }
        }

        if (-not $registrationObserved -and (Test-TunnelRegistration)) {
            $registrationObserved = $true
            Write-Host "Cloudflare Tunnel conectado." -ForegroundColor Green
        }

        Write-Host ("Esperando Cloudflare... intento {0}/{1}" -f $attempt, $MaxAttempts) -ForegroundColor Yellow
        $localDns = Resolve-TunnelHostname -Hostname $Hostname
        $publicDns = Resolve-TunnelHostname -Hostname $Hostname -Server "1.1.1.1"

        if (-not $localDns.Resolved -and -not $publicDns.Resolved) {
            $lastFailure = "DNS local: $($localDns.Error) | DNS 1.1.1.1: $($publicDns.Error)"
            Write-Host "Cloudflare todavia esta publicando el hostname." -ForegroundColor DarkYellow
        }
        elseif (-not $localDns.Resolved -and $publicDns.Resolved) {
            $lastFailure = "DNS local: $($localDns.Error)"
            Write-Host "Hostname publicado. Esperando que el DNS local se actualice." -ForegroundColor Cyan
        }
        else {
            Write-Host "DNS local disponible. Verificando HTTP..." -ForegroundColor Cyan
            try {
                $rootResponse = Invoke-WebRequest -Uri "$PublicUrl/" -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 5
                if ($rootResponse.StatusCode -lt 200 -or $rootResponse.StatusCode -ge 400) {
                    throw "HTTP $($rootResponse.StatusCode) en /"
                }
                $rootStatus = $rootResponse.StatusCode

                $loginResponse = Invoke-WebRequest -Uri "$PublicUrl/login" -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 5
                if ($loginResponse.StatusCode -eq 200) {
                    $loginStatus = $loginResponse.StatusCode
                    if (-not $registrationObserved -and (Test-TunnelRegistration)) {
                        $registrationObserved = $true
                        Write-Host "Cloudflare Tunnel conectado." -ForegroundColor Green
                    }
                    Write-Host "HTTP respondio correctamente." -ForegroundColor Green
                    return [pscustomobject]@{
                        Success = $true
                        Published = $true
                        FailureType = $null
                        LastError = $null
                        RootStatus = $rootStatus
                        LoginStatus = $loginStatus
                        Registered = $registrationObserved
                        LocalDnsResolved = $localDns.Resolved
                        PublicDnsResolved = $publicDns.Resolved
                    }
                }
                $lastFailure = "HTTP $($loginResponse.StatusCode) en /login"
            }
            catch {
                $lastFailure = Get-HttpFailureMessage -ErrorRecord $_ -Target $PublicUrl
                Write-Host ("HTTP aun no disponible: {0}" -f $lastFailure) -ForegroundColor DarkYellow
            }
        }

        if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds $DelaySeconds }
    }

    if (-not $registrationObserved -and (Test-TunnelRegistration)) {
        $registrationObserved = $true
    }
    $localDns = Resolve-TunnelHostname -Hostname $Hostname
    $publicDns = Resolve-TunnelHostname -Hostname $Hostname -Server "1.1.1.1"

    if (-not $registrationObserved) {
        $failureType = "Registro cloudflared"
        $lastFailure = "Nunca aparecio una conexion de tunel registrada."
    }
    elseif (-not $publicDns.Resolved) {
        $failureType = "DNS publico"
        $lastFailure = "1.1.1.1 no pudo resolver el hostname despues de $MaxAttempts intentos. Ultimo error: $($publicDns.Error)"
    }
    else {
        return [pscustomobject]@{
            Success = $false
            Published = $true
            FailureType = if ($localDns.Resolved) { "HTTP pendiente" } else { "DNS local pendiente" }
            LastError = $lastFailure
            RootStatus = $rootStatus
            LoginStatus = $loginStatus
            Registered = $registrationObserved
            LocalDnsResolved = $localDns.Resolved
            PublicDnsResolved = $publicDns.Resolved
        }
    }

    return [pscustomobject]@{
        Success = $false
        Published = $false
        FailureType = $failureType
        LastError = $lastFailure
        RootStatus = $rootStatus
        LoginStatus = $loginStatus
        Registered = $registrationObserved
        LocalDnsResolved = $localDns.Resolved
        PublicDnsResolved = $publicDns.Resolved
    }
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
    $cloudflaredVersion = @(& $cloudflaredPath --version 2>&1 | Select-Object -First 1)
    Write-Host ("- version: {0}" -f ($cloudflaredVersion -join " "))

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
    Write-Host "Local:" -ForegroundColor Cyan
    Write-Host "$localUrl/login" -ForegroundColor Cyan

    Write-Host "Creando Quick Tunnel..." -ForegroundColor Cyan
    $tunnelProcess = Start-Process -FilePath $cloudflaredPath -ArgumentList @("tunnel", "--url", $localUrl, "--no-autoupdate") -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $tunnelOutput -RedirectStandardError $tunnelError -PassThru
    $publicUrl = Read-TunnelUrl -Process $tunnelProcess
    $hostname = ([uri]$publicUrl).Host
    Write-Host "Quick Tunnel: $publicUrl" -ForegroundColor Cyan
    $publicStatus = Wait-ForPublicTunnel -PublicUrl $publicUrl -Hostname $hostname -Process $tunnelProcess

    if (-not $publicStatus.Published) {
        Write-Warning ("Quick Tunnel fallido. Tipo: {0}. Ultimo error: {1}" -f $publicStatus.FailureType, $publicStatus.LastError)
        Write-Host "Ultimas lineas de cloudflared:"
        Write-Host (Get-TunnelLogTail)
        throw "El unico Quick Tunnel no llego a publicarse."
    }

    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host $(if ($publicStatus.Success) { "LINK TEMPORAL INVENTARIO AZ" } else { "TUNEL PUBLICADO POR CLOUDFLARE" }) -ForegroundColor Green
    Write-Host $publicUrl -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    if (-not $publicStatus.Success) {
        if (-not $publicStatus.LocalDnsResolved) {
            Write-Warning "El tunel esta publicado, pero el DNS local de este equipo todavia no ha actualizado el hostname."
        }
        else {
            Write-Warning "El tunel esta publicado, pero HTTP todavia no respondio correctamente. Ultimo error: $($publicStatus.LastError)"
        }
        Write-Host "Puedes comprobarlo despues con: Resolve-DnsName $hostname" -ForegroundColor Yellow
    }
    Write-Host "Local:" -ForegroundColor Cyan
    Write-Host "$localUrl/login" -ForegroundColor Cyan
    Write-Host "Firebase Authorized Domain: $hostname" -ForegroundColor Yellow
    Write-Host "Agrega este hostname en Firebase Console > Authentication > Settings > Authorized domains si aun no esta autorizado." -ForegroundColor Yellow
    Write-Host ("Registered tunnel connection: {0}" -f $publicStatus.Registered)
    Write-Host ("DNS 1.1.1.1: {0}" -f $(if ($publicStatus.PublicDnsResolved) { "resuelto" } else { "no resuelto" }))
    Write-Host ("DNS local: {0}" -f $(if ($publicStatus.LocalDnsResolved) { "resuelto" } else { "pendiente" }))
    Write-Host ("Smoke test /: {0}" -f $(if ($null -ne $publicStatus.RootStatus) { "HTTP $($publicStatus.RootStatus)" } else { "pendiente" }))
    Write-Host ("Smoke test /login: {0}" -f $(if ($null -ne $publicStatus.LoginStatus) { "HTTP $($publicStatus.LoginStatus)" } else { "pendiente" }))
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
