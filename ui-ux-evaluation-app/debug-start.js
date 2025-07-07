// デバッグ用の起動スクリプト
const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 デバッグモードで起動中...\n');
console.log('現在のディレクトリ:', process.cwd());
console.log('Node.js バージョン:', process.version);
console.log('プラットフォーム:', process.platform);
console.log('\n');

// 環境変数の確認
console.log('環境変数チェック:');
console.log('- NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ 設定済み' : '✗ 未設定');
console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓ 設定済み' : '✗ 未設定');
console.log('\n');

// Next.js開発サーバーを起動
console.log('📦 Next.js開発サーバーを起動中...\n');

const nextDev = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

nextDev.on('error', (error) => {
  console.error('❌ エラーが発生しました:', error);
});

nextDev.on('exit', (code) => {
  console.log(`\n開発サーバーが終了しました (コード: ${code})`);
});