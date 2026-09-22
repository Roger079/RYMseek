@echo off
title RYMseek Remote Webhook Listener
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0remote-batch-listener.ps1"
pause
