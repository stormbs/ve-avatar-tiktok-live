@echo off
echo [%date% %time%] BAT DA CHAY > "%~dp0khoi-dong.log"
chcp 65001 > nul
title VE AVATAR TIKTOK LIVE - DEMO SERVER
echo %~dp0 | find /i "wsl.localhost" >nul
if %errorlevel% equ 0 (
    echo [CHU Y] Day la ban trong WSL, Windows chay khong on dinh.
    echo Hay mo thu muc Desktop\ve-avatar tren Windows va chay file .bat o do.
    echo THAY-BAN-WSL-DUNG-LAI >> "%~dp0khoi-dong.log"
    pause
    exit /b 0
)
cd /d "%~dp0"
echo THU-MUC=%CD% >> "%~dp0khoi-dong.log"
if not exist server.js (
    echo [LOI] Khong thay server.js trong: %CD%
    echo File .bat phai nam cung thu muc voi server.js.
    echo THIEU-SERVER-JS >> "%~dp0khoi-dong.log"
    pause
    exit /b 1
)

echo ======================================================
echo  DANG KHOI DONG GAME VE AVATAR...
echo  Thu muc: %CD%
echo ======================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] May tinh chua cai dat Node.js! Tai tu: https://nodejs.org/
    echo NODE-THIEU >> "%~dp0khoi-dong.log"
    pause
    exit /b 1
)
echo NODE-OK >> "%~dp0khoi-dong.log"

netstat -ano 2>nul | find "LISTENING" | findstr /R /C:":3005[^0-9]" >nul
if %errorlevel% neq 0 goto portfree
echo [CHU Y] Cong 3005 dang bi chuong trinh khac giu (khong co cua so):
for /f "tokens=5" %%a in ('netstat -ano ^| find "LISTENING" ^| findstr /R /C:":3005[^0-9]"') do (
    echo   - PID %%a :
    tasklist /FI "PID eq %%a" /FO TABLE /NH 2>nul
)
echo.
echo Nhan phim bat ky de TAT chuong trinh do va chay server moi.
echo (Neu khong muon, hay dong cua so nay lai.)
pause
for /f "tokens=5" %%a in ('netstat -ano ^| find "LISTENING" ^| findstr /R /C:":3005[^0-9]"') do (
    taskkill /F /PID %%a >nul 2>nul
)
timeout /t 2 /nobreak >nul
netstat -ano 2>nul | find "LISTENING" | findstr /R /C:":3005[^0-9]" >nul
if %errorlevel% equ 0 (
    echo [LOI] Khong tat duoc chuong trinh giu cong 3005.
    echo Hay khoi dong lai may tinh roi chay lai file nay.
    echo CONG-3005-BAN >> "%~dp0khoi-dong.log"
    pause
    exit /b 1
)
echo DA-TAT-SERVER-CU >> "%~dp0khoi-dong.log"
:portfree
echo CONG-3005-RANH >> "%~dp0khoi-dong.log"

if not exist node_modules (
    echo [1/2] Cai dat thu vien lan dau - cho 1-2 phut, dung tat cua so...
    echo DANG-NPM-INSTALL >> "%~dp0khoi-dong.log"
    call npm install
    echo NPM-XONG-MA=%errorlevel% >> "%~dp0khoi-dong.log"
    echo.
)
echo CHUAN-BI-CHAY-SERVER >> "%~dp0khoi-dong.log"

echo [2/2] Dang khoi dong Server Ve Avatar...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3005"
start "" "http://localhost:3005/overlay.html"

echo.
echo ======================================================
echo  ^> Dashboard : http://localhost:3005
echo  ^> Overlay   : http://localhost:3005/overlay.html (1080x1920)
echo ======================================================
echo Server dang chay... Nhan Ctrl + C de dung.
echo.

node server.js
echo SERVER-DUNG-MA=%errorlevel% >> "%~dp0khoi-dong.log"
pause
