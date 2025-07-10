# Supabase Service Key取得手順

## 現在の接続状態

✅ **基本接続**: 成功
- URL: https://hqegdcdbyflrmufzbsga.supabase.co
- Anonymous Key: 有効（2035年まで有効）
- Storage接続: 成功

❌ **Service Key**: 未設定

## Service Key取得手順

### 1. Supabaseダッシュボードにアクセス
```
https://supabase.com/dashboard
```

### 2. プロジェクトを選択
- プロジェクト名: `hqegdcdbyflrmufzbsga` のプロジェクトを選択

### 3. Settings → API に移動
- 左側メニューから「Settings」をクリック
- 「API」タブを選択

### 4. Service Role Keyを取得
- 「Project API keys」セクションで以下を確認:
  - `anon public`: 現在使用中の Anonymous Key
  - `service_role secret`: **これが必要なService Key**

### 5. Service Keyをコピー
- `service_role` キーの「Copy」ボタンをクリック
- キーは `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI...` のような形式

### 6. .env.localファイルを更新
```bash
# 現在
SUPABASE_SERVICE_KEY=your-service-role-key

# 更新後
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI...
```

## Service Key設定後のテスト

Service Keyを設定後、以下のコマンドで完全なテストを実行:

```bash
npx tsx test-supabase-config.ts
```

## 注意事項

⚠️ **Service Keyは機密情報です**
- Service Keyは管理者権限を持つため、絶対に公開しないでください
- GitHubなどにコミットしないよう注意してください
- .env.localファイルは.gitignoreに含まれていることを確認してください

⚠️ **権限について**
- Service Key: 管理者権限（すべてのテーブル・機能にアクセス可能）
- Anonymous Key: 制限された権限（RLS（Row Level Security）ポリシーに従う）

## 現在のプロジェクト設定状況

### データベース
- ❌ テーブルアクセス: Anonymous keyでは制限されている
- ✅ 基本接続: 成功

### Storage
- ✅ 接続: 成功
- ❌ バケット: 現在0個（training-imagesバケットが必要）

### 認証
- ✅ Anonymous Key: 有効
- ❌ Service Key: 未設定

## 次のステップ

1. **Service Keyを取得・設定**
2. **必要なテーブルの作成確認**
3. **training-imagesバケットの作成**
4. **RLS（Row Level Security）ポリシーの設定**

Service Keyを設定後、完全なテストを実行してプロジェクトの完全な設定を確認できます。