# Replay Design Score App v1.0 マイグレーションガイド

## 🚀 概要

v1.0では以下の主要な変更が実装されています：

1. **評価システムの刷新**
   - 10項目の詳細評価軸（小数スコア対応）
   - UIタイプ自動分類
   - 辛口フィードバック機能
   - 構造メモ（設計意図）の追加

2. **n8n連携アーキテクチャ**
   - Slack通知はn8n側で処理
   - Webhook経由でのイベント通知

3. **再評価機能**
   - 同一FigmaURLの履歴管理
   - バージョン間の比較分析

## 📋 マイグレーション手順

### 1. データベーススキーマの更新

```bash
# Supabase CLIまたはダッシュボードから実行
psql -h YOUR_SUPABASE_HOST -U postgres -d postgres -f lib/database-v1.sql
```

### 2. 環境変数の追加

`.env.local`に以下を追加：

```env
# n8n Webhook URL
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/evaluation-completed

# Claude API (最新モデル推奨)
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. n8n ワークフローの設定

n8n側で以下のWebhookを受信できるように設定：

```json
{
  "event": "evaluation_completed",
  "data": {
    "evaluationId": "uuid",
    "userId": "uuid",
    "userName": "string",
    "title": "string",
    "figmaLink": "string",
    "uiType": "string",
    "totalScore": "number",
    "scores": {},
    "shortReview": "string",
    "timestamp": "string",
    "version": "number",
    "isReevaluation": "boolean"
  }
}
```

### 4. コンポーネントの更新

既存のコンポーネントをv1.0版に置き換え：

```tsx
// pages/index.tsx または app/page.tsx
import UISubmissionFormV1 from '@/components/ui-submission-form-v1';

// 評価結果ページ
import EvaluationResultV1 from '@/components/evaluation-result-v1';
```

### 5. APIルートの更新

```tsx
// 既存の /api/evaluate を /api/evaluate-v1 に移行
// または、既存のエンドポイントを更新
```

## 🔄 データ移行（オプション）

既存の評価データをv1.0形式に移行する場合：

```sql
-- 既存データの移行スクリプト例
INSERT INTO ui_evaluations_v1 (
  user_id, title, description, figma_link, 
  ui_type, total_score, created_at
)
SELECT 
  user_id, 
  project_name as title, 
  description, 
  figma_link,
  'その他' as ui_type,
  total_score,
  created_at
FROM ui_submissions;
```

## ⚠️ 注意事項

1. **後方互換性**
   - 既存のAPIは維持可能
   - 段階的な移行を推奨

2. **n8n連携**
   - Webhook URLが正しく設定されているか確認
   - n8n側のワークフローが正常に動作するかテスト

3. **認証**
   - Supabase認証トークンが必須
   - APIリクエストにAuthorizationヘッダーを含める

## 🧪 動作確認

1. 新規評価の投稿
2. n8n経由でのSlack通知受信
3. 同一FigmaURLでの再評価
4. 評価履歴の表示

## 📞 サポート

問題が発生した場合は、以下を確認：
- Supabaseログ
- n8nワークフローログ
- ブラウザコンソール