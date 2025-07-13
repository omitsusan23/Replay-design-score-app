# 🚀 OpenAI Embedding + pgvector + Meilisearch + n8n 統合システム

OpenAI text-embedding-3-large（3072次元）による高精度ベクトル検索システムとClaude API自動化の完全統合環境です。

## 📋 システム概要

### 🎯 目的
FigmaのUIデザインを **Claude API** で自動分析し、**OpenAI text-embedding-3-large** でベクトル化、**pgvector** と **Meilisearch** で高速検索可能にする統合システム。

### 🔧 技術スタック
- **Claude API**: デザイン分析・ジャンル分類・スコア付け
- **OpenAI API**: text-embedding-3-large（3072次元）ベクトル化
- **PostgreSQL + pgvector**: ベクトル保存・類似度検索
- **Meilisearch**: 日本語対応高速テキスト検索
- **n8n**: ワークフロー自動化・API連携
- **Next.js + TypeScript**: フロントエンド・API
- **Docker**: 統合環境管理

## 📁 プロジェクト構成

```
Replay-design-score-app/
├── 🐳 Docker統合環境
│   ├── docker-compose.yml              # 統合サービス構成
│   ├── .env.example                     # 環境変数テンプレート
│   └── nginx-config/                    # リバースプロキシ設定
│
├── 🗄️ データベース
│   ├── migration_design_embeddings_3072.sql  # PostgreSQL + pgvector
│   └── meilisearch-config/              # 日本語対応設定
│
├── 🤖 AI・埋め込み処理
│   ├── openai_embedding_3072.py        # OpenAI埋め込み（Python）
│   ├── api/claude/analyze-design.ts    # Claude分析API
│   ├── api/embeddings/generate.ts      # OpenAI埋め込みAPI
│   └── api/data/save-complete.ts       # 統合保存API
│
├── 🔄 ワークフロー自動化
│   ├── n8n-workflows/                  # n8n自動化設定
│   └── claude-to-supabase-meilisearch.json
│
├── 📱 フロントエンド
│   └── components/UploadForm.tsx       # Figmaアップロードフォーム
│
└── 📚 ドキュメント
    ├── README_SYSTEM_INTEGRATION.md    # このファイル
    └── test-scripts/                   # テストスクリプト
```

## 🚀 クイックスタート

### 1. 環境設定

```bash
# リポジトリクローン
git clone <repository>
cd Replay-design-score-app

# 環境変数設定
cp .env.example .env
# .env ファイルを編集（APIキー設定）
```

**必須API キー:**
```bash
# Claude API
CLAUDE_API_KEY=sk-ant-api03-your-claude-api-key

# OpenAI API  
OPENAI_API_KEY=sk-your-openai-api-key

# その他のパスワード
POSTGRES_PASSWORD=your_secure_password
MEILI_MASTER_KEY=your_meili_master_key_32_chars_min
```

### 2. Docker統合環境起動

```bash
# すべてのサービスを起動
docker-compose up -d

# ログ確認
docker-compose logs -f

# 個別サービス起動/停止
docker-compose up -d postgres meilisearch n8n
```

### 3. データベース初期化

```bash
# PostgreSQL + pgvector セットアップ
docker-compose exec postgres psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/01-migration.sql

# 接続確認
docker-compose exec postgres psql -U postgres -d postgres -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

### 4. サービス確認

| サービス | URL | 用途 |
|---------|-----|------|
| **n8n** | http://localhost:5678 | ワークフロー管理 |
| **Meilisearch** | http://localhost:7700 | 検索エンジン |
| **pgAdmin** | http://localhost:5050 | DB管理 |
| **Nginx Gateway** | http://localhost:80 | サービス一覧 |

## 🧩 システムアーキテクチャ

### データフロー

```mermaid
graph TD
    A[Figma URL入力] --> B[UploadForm.tsx]
    B --> C[Claude API分析]
    C --> D[OpenAI埋め込み生成]
    D --> E[PostgreSQL保存]
    D --> F[Meilisearch保存]
    
    G[n8n Webhook] --> C
    C --> H[自動ワークフロー]
    H --> E
    H --> F
    
    I[検索クエリ] --> J[ベクトル検索]
    I --> K[テキスト検索]
    J --> L[類似度結果]
    K --> M[キーワード結果]
```

### テーブル設計

**training_examples** (Claude分析結果)
```sql
- id (UUID, PK)
- figma_url (TEXT)
- genre (TEXT) -- チャットUI、予約画面など
- ui_component_type (TEXT)
- score_aesthetic (NUMERIC 0-1)
- score_consistency (NUMERIC 0-1)
- score_hierarchy (NUMERIC 0-1)
- score_usability (NUMERIC 0-1)
- score_responsive (NUMERIC 0-1)
- score_accessibility (NUMERIC 0-1)
- total_score (GENERATED COLUMN)
- claude_raw_response (TEXT)
- claude_summary (TEXT)
```

**design_embeddings** (OpenAI埋め込み)
```sql
- id (UUID, PK)
- example_id (UUID, FK)
- embedding (VECTOR(3072)) -- text-embedding-3-large
- text_content (TEXT)
- embedding_type (TEXT) -- main, genre, scores
- model_name (TEXT) -- text-embedding-3-large
- embedding_dimensions (INTEGER) -- 3072
```

## 📱 使用方法

### 1. 手動アップロード（UploadForm.tsx）

```typescript
// 単一URL分析
const result = await fetch('/api/claude/analyze-design', {
  method: 'POST',
  body: JSON.stringify({
    figma_url: 'https://figma.com/design/...',
    analysis_mode: 'comprehensive'
  })
})

// バッチアップロード
const urls = [
  'https://figma.com/design/ui1...',
  'https://figma.com/design/ui2...',
  'https://figma.com/design/ui3...'
]
```

### 2. n8n自動ワークフロー

```bash
# Webhook経由でトリガー
curl -X POST http://localhost:5678/webhook/figma-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "figma_url": "https://figma.com/design/example",
    "analysis_mode": "comprehensive"
  }'
```

### 3. 検索・クエリ

**ベクトル類似度検索:**
```sql
SELECT * FROM search_similar_embeddings_cosine(
  query_embedding := (OpenAI埋め込みベクトル),
  search_limit := 10,
  min_similarity := 0.7
);
```

**Meilisearch検索:**
```bash
curl -X POST 'http://localhost:7700/indexes/design-embeddings/search' \
  -H 'Content-Type: application/json' \
  -d '{
    "q": "チャットUI レスポンシブ",
    "filter": "genre = チャットUI AND total_score > 0.8",
    "limit": 10
  }'
```

## 🧪 テストとデバッグ

### 統合テストスクリプト

```bash
# Python環境テスト
python openai_embedding_3072.py

# API エンドポイントテスト
curl -X POST http://localhost:3000/api/claude/analyze-design \
  -H "Content-Type: application/json" \
  -d '{"figma_url":"https://figma.com/design/test"}'

# データベース接続テスト
docker-compose exec postgres psql -U postgres -c "\l"

# Meilisearch テスト
curl http://localhost:7700/health
```

### デバッグ用ログ

```bash
# 全サービスログ
docker-compose logs -f

# 個別サービスログ
docker-compose logs -f postgres
docker-compose logs -f meilisearch  
docker-compose logs -f n8n

# PostgreSQL クエリログ
docker-compose exec postgres tail -f /var/lib/postgresql/data/log/postgresql.log
```

## ⚡ パフォーマンス最適化

### pgvector チューニング

```sql
-- インデックス最適化
CREATE INDEX CONCURRENTLY idx_embeddings_cosine_optimized 
ON design_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 200); -- データ量に応じて調整

-- プリウォーム
SELECT pg_prewarm('design_embeddings');
```

### Meilisearch チューニング

```json
{
  "searchCutoffMs": 150,
  "pagination": {
    "maxTotalHits": 1000
  },
  "faceting": {
    "maxValuesPerFacet": 100
  }
}
```

### OpenAI API最適化

```python
# バッチサイズ最適化
BATCH_SIZE = 100  # APIレート制限内で最大化

# 並列処理
import asyncio
embeddings = await asyncio.gather(*embedding_tasks)
```

## 🔧 設定カスタマイズ

### Claude分析プロンプトカスタマイズ

`api/claude/analyze-design.ts`:
```typescript
const customPrompt = `
特定の業界や用途に特化した分析指示:
- ECサイト特化分析
- モバイルアプリ特化分析
- SaaS管理画面特化分析
`
```

### 埋め込み次元数変更

次元数を変更する場合:
```sql
-- 1. テーブル変更
ALTER TABLE design_embeddings 
ALTER COLUMN embedding TYPE VECTOR(新次元数);

-- 2. インデックス再作成
DROP INDEX IF EXISTS idx_design_embeddings_vector_cosine;
CREATE INDEX idx_design_embeddings_vector_cosine 
ON design_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

### Meilisearch日本語設定調整

`meilisearch-config/settings.json`:
```json
{
  "stopWords": ["の", "に", "は", "を", "が", ...],
  "synonyms": {
    "UI": ["ユーザーインターフェース", "interface"],
    "UX": ["ユーザーエクスペリエンス", "experience"]
  }
}
```

## 🚨 トラブルシューティング

### よくある問題

**1. PostgreSQL接続エラー**
```bash
# 接続確認
docker-compose exec postgres pg_isready

# パスワード確認  
echo $POSTGRES_PASSWORD

# ログ確認
docker-compose logs postgres
```

**2. OpenAI API制限エラー**
```python
# レート制限対策
import time
time.sleep(1)  # リクエスト間隔調整

# バッチサイズ削減
BATCH_SIZE = 50
```

**3. Meilisearch検索結果なし**
```bash
# インデックス確認
curl http://localhost:7700/indexes/design-embeddings/stats

# ドキュメント確認
curl http://localhost:7700/indexes/design-embeddings/documents?limit=5
```

**4. n8nワークフロー失敗**
```bash
# n8n ログ確認
docker-compose logs n8n

# ワークフロー実行履歴確認
# n8n管理画面 > Executions
```

### パフォーマンス問題

**遅い類似度検索:**
```sql
-- EXPLAIN ANALYZEで実行計画確認
EXPLAIN ANALYZE 
SELECT * FROM search_similar_embeddings_cosine(...);

-- インデックススキャン使用確認
-- Seq Scan が出る場合はインデックス調整
```

**メモリ不足:**
```yaml
# docker-compose.yml でメモリ制限調整
services:
  postgres:
    deploy:
      resources:
        limits:
          memory: 2G
  meilisearch:
    deploy:
      resources:
        limits:
          memory: 1G
```

## 📊 監視・メトリクス

### ヘルスチェック

```bash
# 全サービス状態確認
curl http://localhost/health

# 個別サービス確認
curl http://localhost:5432  # PostgreSQL
curl http://localhost:7700/health  # Meilisearch
curl http://localhost:5678/healthz  # n8n
```

### メトリクス収集

Grafana + Prometheus（オプション）:
```bash
# 監視サービス起動
docker-compose --profile monitoring up -d grafana prometheus

# Grafana アクセス
open http://localhost:3000
```

## 🔄 アップグレード・メンテナンス

### データベースマイグレーション

```bash
# バックアップ
docker-compose exec postgres pg_dump -U postgres postgres > backup.sql

# マイグレーション適用
docker-compose exec postgres psql -U postgres -f /path/to/migration.sql
```

### インデックス再構築

```sql
-- pgvector インデックス
REINDEX INDEX CONCURRENTLY idx_design_embeddings_vector_cosine;

-- Meilisearch インデックス
DELETE /indexes/design-embeddings  -- API経由
```

## 📈 拡張・カスタマイズ

### 新しいAIモデル対応

1. **埋め込みモデル変更**:
   - `EMBEDDING_MODEL = 'text-embedding-3-large'`
   - 次元数: `EMBEDDING_DIMENSIONS = 3072`

2. **分析モデル追加**:
   - GPT-4V for 画像分析
   - Gemini for 多言語対応

### 新しい検索機能

```typescript
// セマンティック検索 + フィルタ
const results = await hybridSearch({
  query: "レスポンシブなダッシュボード",
  filters: {
    genre: "ダッシュボード",
    minScore: 0.8,
    dateRange: "last_30_days"
  }
})
```

### API拡張

```typescript
// 新しい分析API
POST /api/analysis/batch
POST /api/analysis/compare
GET /api/analysis/trends
GET /api/analysis/recommendations
```

---

## 🎉 完成！

このシステムにより、FigmaデザインのClaude自動分析からベクトル検索まで、完全自動化された高精度なデザイン分析・検索システムが完成しました。

**主な成果:**
- ✅ OpenAI text-embedding-3-large（3072次元）完全対応
- ✅ Claude API自動分析ワークフロー
- ✅ PostgreSQL + pgvector 高速ベクトル検索
- ✅ Meilisearch 日本語対応テキスト検索  
- ✅ n8n 自動化ワークフロー
- ✅ Docker統合環境管理

**次のステップ:**
- 本番環境デプロイ設定
- SSL証明書設定
- スケーリング対応
- 監視・アラート設定
- APIドキュメント整備