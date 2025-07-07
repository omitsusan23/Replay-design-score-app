@echo off
echo ========================================
echo UI/UX評価アプリ 開発サーバー起動
echo ========================================
echo.

echo 環境をチェック中...
node --version
npm --version
echo.

echo 依存関係を確認中...
call npm install
echo.

echo 開発サーバーを起動中...
echo URL: http://localhost:3000
echo 終了するには Ctrl+C を押してください
echo.

call npm run dev
pause