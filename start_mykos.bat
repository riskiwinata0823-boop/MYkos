@echo off
title MYkos - Server API P10
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0jalankan_server.ps1"
if errorlevel 1 pause
