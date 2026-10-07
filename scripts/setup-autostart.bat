@echo off
echo Setting up RYMseek Webhook Listener to autostart on Windows login...
schtasks /create /tn "RYMseekWebhookListener" /tr "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\Users\rogel\OneDrive\Desktop\hooks\remote-batch-listener.ps1\"" /sc onlogon /f
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Scheduled task 'RYMseekWebhookListener' created!
    echo Starting the task now...
    schtasks /run /tn "RYMseekWebhookListener"
) else (
    echo.
    echo [FALLBACK] Creating shortcut in Windows Startup folder instead...
    powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\RYMseekListener.lnk'); $s.TargetPath='powershell.exe'; $s.Arguments='-ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\Users\rogel\OneDrive\Desktop\hooks\remote-batch-listener.ps1\"'; $s.WorkingDirectory='C:\Users\rogel\OneDrive\Desktop\hooks'; $s.Save()"
    echo [SUCCESS] Autostart shortcut added to Startup folder!
)
pause
