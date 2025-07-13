#!/bin/bash

# Claude RAG統合ワークフローテストスクリプト

echo "🚀 Claude RAG統合ワークフローのテストを開始します..."

# Webhook URLの推定 (パスが "claude-rag-api" で設定されている)
WEBHOOK_URL="http://localhost:5678/webhook/claude-rag-api"

echo "📡 Webhook URL: $WEBHOOK_URL"

# テストケース1: 基本的なRAG検索
echo ""
echo "🧪 テストケース1: ランディングページのデザイン相談"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "効果的なランディングページのデザイン要素は何ですか？",
    "search_query": "ランディングページ デザイン 要素",
    "search_type": "comprehensive",
    "max_results": 5,
    "session_id": "test_session_1"
  }' \
  --max-time 120 \
  --silent \
  --write-out "\n⏱️  処理時間: %{time_total}秒\n📊 ステータス: %{http_code}\n" \
  > test_result_1.json

if [ $? -eq 0 ]; then
  echo "✅ テストケース1: 成功"
  echo "📄 結果: $(head -c 200 test_result_1.json)..."
else
  echo "❌ テストケース1: 失敗"
fi

echo ""
echo "🧪 テストケース2: モバイルUI最適化"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "モバイルUIの最適化で最も重要なポイントは？",
    "search_query": "モバイル UI 最適化",
    "search_type": "focused",
    "max_results": 3,
    "session_id": "test_session_2"
  }' \
  --max-time 120 \
  --silent \
  --write-out "\n⏱️  処理時間: %{time_total}秒\n📊 ステータス: %{http_code}\n" \
  > test_result_2.json

if [ $? -eq 0 ]; then
  echo "✅ テストケース2: 成功"
  echo "📄 結果: $(head -c 200 test_result_2.json)..."
else
  echo "❌ テストケース2: 失敗"
fi

echo ""
echo "🧪 テストケース3: エラーハンドリング（無効な入力）"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "invalid_field": "テストデータ",
    "session_id": "test_session_error"
  }' \
  --max-time 60 \
  --silent \
  --write-out "\n⏱️  処理時間: %{time_total}秒\n📊 ステータス: %{http_code}\n" \
  > test_result_error.json

if [ $? -eq 0 ]; then
  echo "✅ テストケース3: レスポンス受信（エラーハンドリング確認）"
  echo "📄 結果: $(head -c 200 test_result_error.json)..."
else
  echo "❌ テストケース3: 通信エラー"
fi

echo ""
echo "📊 テスト結果サマリー:"
echo "📁 結果ファイル:"
echo "  - test_result_1.json (ランディングページテスト)"
echo "  - test_result_2.json (モバイルUIテスト)"
echo "  - test_result_error.json (エラーハンドリング)"

echo ""
echo "🔍 詳細結果確認方法:"
echo "  cat test_result_1.json | jq ."
echo "  cat test_result_2.json | jq ."

echo ""
echo "🎯 ワークフローアクセス:"
echo "  N8N UI: http://localhost:5678"
echo "  ワークフローID: CugsOGbxFujanvi8"

echo ""
echo "📋 次のステップ:"
echo "1. N8N UIでワークフローをアクティブ化"
echo "2. 環境変数設定 (CLAUDE_API_KEY, MEILI_MASTER_KEY)"
echo "3. 再テスト実行"