@echo off
setlocal
cd /d %~dp0

echo =============================================
echo WB Reviews + Auto Replies + AB Tests
echo =============================================

echo.
echo 1) Проверяем npm...
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ОШИБКА] npm не найден.
  echo Установите Node.js (LTS) с официального сайта, затем запустите этот файл снова.
  echo.
  pause
  exit /b 1
)

echo.
echo 2) Устанавливаем зависимости (первый раз может быть 5-15 минут)...
if not exist node_modules (
  npm install
  if errorlevel 1 (
    echo.
    echo [ОШИБКА] npm install завершился с ошибкой.
    pause
    exit /b 1
  )
) else (
  echo node_modules уже есть, пропускаем npm install.
)

echo.
echo 3) Запускаем приложение...
echo Откройте в браузере: http://localhost:5173/

echo.
npm run dev

pause
