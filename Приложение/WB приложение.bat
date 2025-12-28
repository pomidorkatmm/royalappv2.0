@echo off
chcp 65001 >nul
title WB Reviews - запуск

echo Проверяем Node.js...
node -v >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Node.js не установлен.
  echo Откройте https://nodejs.org, установите LTS и перезагрузите ПК.
  pause
  exit /b 1
)

echo Устанавливаем зависимости (если нужно)...
call npm install
if errorlevel 1 (
  echo [ОШИБКА] npm install не удался.
  pause
  exit /b 1
)

echo Запускаем приложение...
echo Откроется отдельное окно приложения.
echo.
call npm run desktop:dev
pause
