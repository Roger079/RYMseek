<#
.SYNOPSIS
    RYMseek / slskd Remote Batch Webhook Listener for Windows (Pure Socket Engine)
.DESCRIPTION
    Runs as a lightweight HTTP listener on your remote Windows server.
    Uses pure .NET Sockets (TcpListener) to avoid Windows HTTP.sys "400 Bad Request - Invalid Hostname"
    errors when called by Docker containers (via host.docker.internal).
    
    Features:
    - Binds to 0.0.0.0 (all interfaces: localhost, Docker vEthernet, Tailscale, LAN).
    - Accepts any Host header (host.docker.internal, localhost, 100.x.y.z, IPs).
    - Smart 15-second debouncer: groups per-track download events into a single .bat run.
    - Non-blocking: returns HTTP/1.1 200 OK immediately to slskd.
#>

param(
    [int]$Port = 8888,
    [string]$BatchScript = "C:\path\to\your_beets_script.bat",
    [int]$DebounceSeconds = 15
)

$Host.UI.RawUI.WindowTitle = "RYMseek Webhook Listener (Port $Port)"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   RYMseek & slskd Remote Webhook Listener for Windows    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Port:             $Port" -ForegroundColor White
Write-Host " Batch Script:     $BatchScript" -ForegroundColor White
Write-Host " Debounce Window:  $DebounceSeconds seconds" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

# Auto-detect batch script in the same directory if default path does not exist
if (-not (Test-Path $BatchScript)) {
    $found = Get-ChildItem -Path $PSScriptRoot -Filter "*.bat" -ErrorAction SilentlyContinue | Where-Object { 
        $_.Name -notmatch "^(start-listener|autostart|setup-autostart)\.bat$" 
    } | Select-Object -First 1

    if ($found) {
        $BatchScript = $found.FullName
        Write-Host "[AUTO-DETECT] Using batch script found in folder: $BatchScript" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Batch script not found: $BatchScript" -ForegroundColor Yellow
        Write-Host "Place your .bat file in this folder ($PSScriptRoot) or pass -BatchScript 'C:\path.bat'" -ForegroundColor Yellow
    }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

try {
    $listener.Start()
    Write-Host "`n[OK] Listening on 0.0.0.0:$Port (accepts localhost, host.docker.internal, Tailscale, etc.)" -ForegroundColor Green
    Write-Host "Ready and waiting for download completion events..." -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor DarkGray
} catch {
    Write-Host "[FATAL] Failed to bind to port $Port : $_" -ForegroundColor Red
    Write-Host "Make sure no other program (or previous listener instance) is using port $Port." -ForegroundColor Yellow
    exit 1
}

$pendingExecution = $false
$lastRequestTime = [DateTime]::MinValue

try {
    while ($listener.Server.IsBound) {
        if ($listener.Pending()) {
            $client = $listener.AcceptTcpClient()
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, $utf8NoBom)
            $writer = [System.IO.StreamWriter]::new($stream, $utf8NoBom)
            $writer.NewLine = "`r`n"

            try {
                $requestLine = $reader.ReadLine()
                if ($requestLine) {
                    $parts = $requestLine -split ' '
                    $method = $parts[0]
                    $path = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

                    # Read all HTTP headers
                    $contentLength = 0
                    while ($line = $reader.ReadLine()) {
                        if ($line -eq "") { break }
                        if ($line -match "^Content-Length:\s*(\d+)") {
                            $contentLength = [int]$matches[1]
                        }
                    }

                    # Read HTTP Body if present
                    $body = ""
                    if ($contentLength -gt 0) {
                        $charBuf = New-Object char[] $contentLength
                        $totalRead = 0
                        while ($totalRead -lt $contentLength) {
                            $read = $reader.ReadBlock($charBuf, $totalRead, $contentLength - $totalRead)
                            if ($read -le 0) { break }
                            $totalRead += $read
                        }
                        $body = [string]::new($charBuf, 0, $totalRead)
                    }

                    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    Write-Host "[$timestamp] Incoming $method $path" -ForegroundColor Green

                    # Parse JSON event details
                    if ($body) {
                        try {
                            $json = $body | ConvertFrom-Json
                            if ($json.type) {
                                Write-Host "  Event:     $($json.type)" -ForegroundColor Yellow
                            }
                            if ($json.localDirectoryName) {
                                Write-Host "  Directory: $($json.localDirectoryName)" -ForegroundColor White
                            } elseif ($json.localFilename) {
                                Write-Host "  File:      $($json.localFilename)" -ForegroundColor White
                            } elseif ($json.filename) {
                                Write-Host "  File:      $($json.filename)" -ForegroundColor White
                            }
                            if ($json.username) {
                                Write-Host "  User:      $($json.username)" -ForegroundColor DarkGray
                            }
                        } catch {}
                    }

                    # Immediate HTTP 200 response
                    $responseJson = '{"status":"ok","action":"queued","debounce_seconds":' + $DebounceSeconds + '}'
                    $writer.WriteLine("HTTP/1.1 200 OK")
                    $writer.WriteLine("Content-Type: application/json")
                    $writer.WriteLine("Content-Length: $($responseJson.Length)")
                    $writer.WriteLine("Access-Control-Allow-Origin: *")
                    $writer.WriteLine("Access-Control-Allow-Methods: POST, GET, OPTIONS")
                    $writer.WriteLine("Access-Control-Allow-Headers: Content-Type")
                    $writer.WriteLine("Connection: close")
                    $writer.WriteLine()
                    $writer.Write($responseJson)
                    $writer.Flush()

                    # Mark pending execution and reset debounce timer
                    $pendingExecution = $true
                    $lastRequestTime = [DateTime]::UtcNow
                }
            } catch {
                Write-Host "[WARN] Connection processing error: $_" -ForegroundColor DarkGray
            } finally {
                $client.Close()
            }
        }

        # Check debounce timer for batch script execution
        if ($pendingExecution) {
            $elapsedSeconds = ([DateTime]::UtcNow - $lastRequestTime).TotalSeconds
            if ($elapsedSeconds -ge $DebounceSeconds) {
                $pendingExecution = $false
                $execTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

                Write-Host "`n[$execTime] >>> Cooldown complete ($DebounceSeconds`s). Executing batch script! <<<" -ForegroundColor Magenta
                Write-Host "Running: $BatchScript" -ForegroundColor White

                if (Test-Path $BatchScript) {
                    try {
                        $proc = Start-Process -FilePath $BatchScript -Wait -PassThru -NoNewWindow
                        $doneTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                        Write-Host "[$doneTime] Batch script finished with exit code $($proc.ExitCode).`n" -ForegroundColor Green
                    } catch {
                        Write-Host "[ERROR] Failed to run batch script: $_" -ForegroundColor Red
                    }
                } else {
                    Write-Host "[ERROR] Cannot run script: '$BatchScript' does not exist." -ForegroundColor Red
                }

                Write-Host "Listening for next download events...`n" -ForegroundColor Cyan
            }
        }

        Start-Sleep -Milliseconds 100
    }
} finally {
    $listener.Stop()
    Write-Host "Webhook listener stopped." -ForegroundColor DarkGray
}
