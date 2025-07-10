# Vercel環境変数設定ガイド

## 🔧 必要な環境変数

Vercel Dashboard → Settings → Environment Variables で以下を設定：

### 1. Supabase設定
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Claude API設定
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxx...
```

## 📍 環境変数の取得場所

### Supabase
1. Supabase Dashboard → Settings → API
2. `Project URL` = NEXT_PUBLIC_SUPABASE_URL
3. `anon public` = NEXT_PUBLIC_SUPABASE_ANON_KEY
4. `service_role` = SUPABASE_SERVICE_KEY（秘密！）

### Anthropic
1. https://console.anthropic.com/
2. API Keys → Create Key

## ⚠️ 重要な注意事項

- `NEXT_PUBLIC_`で始まる変数はクライアント側で使用
- `SUPABASE_SERVICE_KEY`は絶対に公開しない（サーバー側のみ）
- すべての環境（Production, Preview, Development）に設定

## 🔄 設定後の確認

1. Vercelで再デプロイ
2. ログを確認して環境変数が読み込まれているか確認
3. Storage bucketが`training-images`で作成済みか確認