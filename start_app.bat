@echo off
cd /d "%~dp0"
start "Photo Renamer - Serveur" "C:\Users\TeddyGARREAU\AppData\Local\Programs\Python\Python312\python.exe" app.py
timeout /t 2 /nobreak >nul
start "" "http://localhost:5000"
