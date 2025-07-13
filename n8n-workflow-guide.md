# N8N ワークフロー構築ガイド

## 🎯 **アクセス方法**
```
http://localhost:5678
```

## 🔧 **Claude RAG統合ワークフロー構築手順**

### **1. 新しいワークフローを作成**
1. N8N UIにアクセス
2. 「+ New Workflow」をクリック
3. ワークフロー名: "Claude RAG Integration"

### **2. ノード構成**

#### **🌐 Webhook Trigger**
- ノードタイプ: `Webhook`
- 設定:
  - HTTP Method: `POST`
  - Path: `claude-rag`
  - Response Mode: `Using 'Respond to Webhook' Node`

#### **🔍 RAG Vector Search**
- ノードタイプ: `HTTP Request`
- 設定:
  - Method: `POST`
  - URL: `http://replay-postgres-pgvector:5432/search`
  - Headers:
    - `Content-Type`: `application/json`
  - Body (JSON):
    ```json
    {
      "query": "{{ $json.body.search_query }}",
      "table": "design_embeddings",
      "limit": 3
    }
    ```

#### **🔍 Meilisearch Query**
- ノードタイプ: `HTTP Request`
- 設定:
  - Method: `POST`
  - URL: `http://replay-meilisearch:7700/indexes/ui_designs/search`
  - Headers:
    - `Authorization`: `Bearer {{ $env.MEILI_MASTER_KEY }}`
    - `Content-Type`: `application/json`
  - Body (JSON):
    ```json
    {
      "q": "{{ $json.body.search_query }}",
      "limit": 5,
      "attributesToHighlight": ["title", "description", "tags"]
    }
    ```

#### **🤖 Claude API**
- ノードタイプ: `HTTP Request`
- 設定:
  - Method: `POST`
  - URL: `https://api.anthropic.com/v1/messages`
  - Headers:
    - `x-api-key`: `{{ $env.CLAUDE_API_KEY }}`
    - `anthropic-version`: `2023-06-01`
    - `Content-Type`: `application/json`
  - Body (JSON):
    ```json
    {
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 2048,
      "messages": [
        {
          "role": "user",
          "content": "以下の検索結果を参考にして、UIデザインについて回答してください:\n\nRAG検索結果:\n{{ JSON.stringify($('RAG Vector Search').first().json) }}\n\nMeilisearch結果:\n{{ JSON.stringify($('Meilisearch Query').first().json) }}\n\n質問: {{ $('Webhook').first().json.body.question }}"
        }
      ]
    }
    ```

#### **⚙️ Integration Processor**
- ノードタイプ: `Code`
- JavaScript Code:
    ```javascript
    // RAGシステム統合処理
    const webhookData = $('Webhook').first().json.body;
    const ragResults = $('RAG Vector Search').first().json;
    const meilisearchResults = $('Meilisearch Query').first().json;
    const claudeResponse = $('Claude API').first().json;

    // 結果を統合
    const integratedResponse = {
      timestamp: new Date().toISOString(),
      query: webhookData.question || webhookData.search_query,
      rag_results: {
        vector_search: ragResults,
        text_search: meilisearchResults.hits || []
      },
      claude_analysis: {
        response: claudeResponse.content?.[0]?.text || claudeResponse.message,
        model: 'claude-3-5-sonnet-20241022',
        confidence: 0.85
      },
      metadata: {
        processing_time_ms: Date.now() - new Date(webhookData.timestamp || Date.now()).getTime(),
        sources_count: (ragResults?.length || 0) + (meilisearchResults?.hits?.length || 0)
      }
    };

    return integratedResponse;
    ```

#### **📤 Webhook Response**
- ノードタイプ: `Respond to Webhook`
- 設定:
  - Respond With: `JSON`
  - Response Body: `{{ JSON.stringify($json, null, 2) }}`

### **3. ノード接続**
```
Webhook → RAG Vector Search → Claude API → Integration Processor → Webhook Response
       → Meilisearch Query ↗
```

### **4. 環境変数設定**
Settings → Environment Variables:
- `CLAUDE_API_KEY`: Claude APIキー
- `MEILI_MASTER_KEY`: Meilisearch APIキー

## 🧪 **テスト方法**

### **Webhook URLの取得**
1. Webhookノードをクリック
2. 「Copy Production URL」をクリック
3. URL例: `http://localhost:5678/webhook/claude-rag`

### **テストリクエスト**
```bash
curl -X POST http://localhost:5678/webhook/claude-rag \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "ランディングページ デザイン",
    "question": "効果的なランディングページのデザイン要素は何ですか？"
  }'
```

### **期待レスポンス**
```json
{
  "timestamp": "2025-07-13T07:20:00.000Z",
  "query": "効果的なランディングページのデザイン要素は何ですか？",
  "rag_results": {
    "vector_search": [...],
    "text_search": [...]
  },
  "claude_analysis": {
    "response": "効果的なランディングページのデザイン要素について...",
    "model": "claude-3-5-sonnet-20241022",
    "confidence": 0.85
  },
  "metadata": {
    "processing_time_ms": 1250,
    "sources_count": 8
  }
}
```

## 🔧 **高度な設定**

### **エラーハンドリング**
各HTTPリクエストノードに以下を追加:
- **Continue on Fail**: `true`
- **Error Node**: エラー処理用のノードを追加

### **ログ記録**
結果をPostgreSQLに保存するノードを追加:
```json
{
  "table": "rag_query_logs",
  "data": "{{ JSON.stringify($json) }}"
}
```

### **キャッシュ機能**
Redisを使用したキャッシュノードを追加:
```json
{
  "operation": "get",
  "key": "rag_{{ hashCode($json.body.search_query) }}",
  "ttl": 3600
}
```

## 📊 **監視とデバッグ**

### **実行履歴の確認**
1. N8N UI → Executions
2. 実行ログの詳細確認
3. エラー分析とデバッグ

### **パフォーマンス最適化**
- 並列実行の活用
- タイムアウト設定の調整
- リトライ機能の実装