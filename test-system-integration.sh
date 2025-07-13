#!/bin/bash

# =============================================================================
# 🧪 統合システムテストスクリプト
# OpenAI Embedding + pgvector + Meilisearch + n8n
# =============================================================================

set -e  # エラー時に停止

# 色付きログ用
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "\n${BLUE}🔧 $1${NC}"
    echo "=================================="
}

# 設定変数
TEST_FIGMA_URL="https://www.figma.com/design/test-ui-component"
TEST_TIMEOUT=30
SERVICES=(postgres meilisearch n8n redis nginx)

# 環境変数チェック
check_env_vars() {
    log_header "環境変数チェック"
    
    REQUIRED_VARS=(
        "POSTGRES_PASSWORD"
        "CLAUDE_API_KEY"
        "OPENAI_API_KEY"
        "MEILI_MASTER_KEY"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "$var が設定されていません"
            echo "  .env ファイルを確認してください"
            exit 1
        else
            log_success "$var 設定済み"
        fi
    done
}

# Dockerサービス状態チェック
check_docker_services() {
    log_header "Dockerサービス状態チェック"
    
    # Docker Compose起動確認
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose がインストールされていません"
        exit 1
    fi
    
    # 各サービスの状態確認
    for service in "${SERVICES[@]}"; do
        if docker-compose ps | grep -q "$service.*Up"; then
            log_success "$service サービス稼働中"
        else
            log_warning "$service サービス停止中 - 起動を試行します"
            docker-compose up -d "$service"
            
            # 起動待機
            sleep 5
            
            if docker-compose ps | grep -q "$service.*Up"; then
                log_success "$service サービス起動成功"
            else
                log_error "$service サービス起動失敗"
                docker-compose logs "$service"
                exit 1
            fi
        fi
    done
}

# ヘルスチェック
health_check() {
    log_header "サービスヘルスチェック"
    
    # PostgreSQL
    log_info "PostgreSQL接続テスト..."
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_success "PostgreSQL 接続OK"
    else
        log_error "PostgreSQL 接続NG"
        return 1
    fi
    
    # pgvector拡張確認
    log_info "pgvector拡張確認..."
    VECTOR_CHECK=$(docker-compose exec -T postgres psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM pg_extension WHERE extname='vector';" 2>/dev/null | tr -d ' ')
    if [ "$VECTOR_CHECK" = "1" ]; then
        log_success "pgvector拡張 有効"
    else
        log_error "pgvector拡張 無効"
        return 1
    fi
    
    # Meilisearch
    log_info "Meilisearchヘルスチェック..."
    if curl -s -f "http://localhost:7700/health" > /dev/null; then
        log_success "Meilisearch 稼働中"
    else
        log_error "Meilisearch 応答なし"
        return 1
    fi
    
    # n8n
    log_info "n8nヘルスチェック..."
    if curl -s -f "http://localhost:5678/healthz" > /dev/null; then
        log_success "n8n 稼働中"
    else
        log_warning "n8n ヘルスチェック失敗（起動中の可能性）"
    fi
    
    # Redis
    log_info "Redisヘルスチェック..."
    if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        log_success "Redis 稼働中"
    else
        log_warning "Redis 応答なし"
    fi
}

# データベーステーブル確認
check_database_tables() {
    log_header "データベーステーブル確認"
    
    # training_examples テーブル
    log_info "training_examples テーブル確認..."
    if docker-compose exec -T postgres psql -U postgres -d postgres -c "\d training_examples" > /dev/null 2>&1; then
        log_success "training_examples テーブル存在"
    else
        log_error "training_examples テーブル不存在"
        return 1
    fi
    
    # design_embeddings テーブル
    log_info "design_embeddings テーブル確認..."
    if docker-compose exec -T postgres psql -U postgres -d postgres -c "\d design_embeddings" > /dev/null 2>&1; then
        log_success "design_embeddings テーブル存在"
    else
        log_error "design_embeddings テーブル不存在"
        return 1
    fi
    
    # ベクトル次元数確認
    log_info "ベクトル次元数確認..."
    EMBEDDING_DIMS=$(docker-compose exec -T postgres psql -U postgres -d postgres -t -c "SELECT typlen FROM pg_type WHERE typname='vector'" 2>/dev/null | tr -d ' ')
    if [ ! -z "$EMBEDDING_DIMS" ]; then
        log_success "vector型 使用可能"
    else
        log_error "vector型 使用不可"
        return 1
    fi
}

# Meilisearchインデックス確認
check_meilisearch_index() {
    log_header "Meilisearchインデックス確認"
    
    # design-embeddingsインデックス確認
    log_info "design-embeddingsインデックス確認..."
    INDEX_RESPONSE=$(curl -s -H "Authorization: Bearer ${MEILI_MASTER_KEY}" "http://localhost:7700/indexes/design-embeddings" 2>/dev/null)
    
    if echo "$INDEX_RESPONSE" | grep -q "design-embeddings"; then
        log_success "design-embeddingsインデックス存在"
        
        # インデックス統計取得
        STATS=$(curl -s -H "Authorization: Bearer ${MEILI_MASTER_KEY}" "http://localhost:7700/indexes/design-embeddings/stats" 2>/dev/null)
        DOC_COUNT=$(echo "$STATS" | grep -o '"numberOfDocuments":[0-9]*' | cut -d':' -f2)
        log_info "インデックス内ドキュメント数: $DOC_COUNT"
        
    else
        log_warning "design-embeddingsインデックス不存在 - 作成します"
        
        # インデックス作成
        curl -s -X POST "http://localhost:7700/indexes" \
             -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
             -H "Content-Type: application/json" \
             -d '{"uid":"design-embeddings","primaryKey":"id"}' > /dev/null
        
        log_success "design-embeddingsインデックス作成完了"
    fi
}

# API エンドポイントテスト
test_api_endpoints() {
    log_header "APIエンドポイントテスト"
    
    # Claude分析APIテスト (モックデータ)
    log_info "Claude分析API テスト..."
    if command -v curl &> /dev/null; then
        API_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/claude_test.json \
                           -X POST "http://localhost:3000/api/claude/analyze-design" \
                           -H "Content-Type: application/json" \
                           -d "{\"figma_url\":\"$TEST_FIGMA_URL\",\"analysis_mode\":\"quick\"}" \
                           2>/dev/null)
        
        if [ "$API_RESPONSE" = "200" ]; then
            log_success "Claude分析API 応答OK"
        else
            log_warning "Claude分析API 応答コード: $API_RESPONSE（APIキーを確認してください）"
        fi
    else
        log_warning "curl コマンドが見つかりません"
    fi
    
    # 埋め込み生成APIテスト (モックデータ)
    log_info "埋め込み生成API テスト..."
    EMBEDDING_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/embedding_test.json \
                             -X POST "http://localhost:3000/api/embeddings/generate" \
                             -H "Content-Type: application/json" \
                             -d '{"text_content":"テスト用UIコンポーネント","genre":"テスト"}' \
                             2>/dev/null)
    
    if [ "$EMBEDDING_RESPONSE" = "200" ]; then
        log_success "埋め込み生成API 応答OK"
    else
        log_warning "埋め込み生成API 応答コード: $EMBEDDING_RESPONSE（APIキーを確認してください）"
    fi
}

# n8nワークフロー確認
check_n8n_workflows() {
    log_header "n8nワークフロー確認"
    
    # n8n管理画面アクセス確認
    log_info "n8n管理画面アクセステスト..."
    if curl -s -f "http://localhost:5678" > /dev/null; then
        log_success "n8n管理画面 アクセス可能"
        log_info "  URL: http://localhost:5678"
        log_info "  ユーザー: ${N8N_BASIC_AUTH_USER:-admin}"
    else
        log_warning "n8n管理画面 アクセス不可（起動中の可能性）"
    fi
    
    # Webhook URLテスト
    log_info "Webhookエンドポイントテスト..."
    WEBHOOK_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/webhook_test.json \
                           -X POST "http://localhost:5678/webhook/figma-analysis" \
                           -H "Content-Type: application/json" \
                           -d "{\"figma_url\":\"$TEST_FIGMA_URL\"}" \
                           2>/dev/null)
    
    if [ "$WEBHOOK_RESPONSE" = "200" ] || [ "$WEBHOOK_RESPONSE" = "404" ]; then
        log_success "Webhookエンドポイント 到達可能"
    else
        log_warning "Webhookエンドポイント 応答コード: $WEBHOOK_RESPONSE"
    fi
}

# パフォーマンステスト
performance_test() {
    log_header "パフォーマンステスト"
    
    # PostgreSQL パフォーマンス
    log_info "PostgreSQL クエリパフォーマンステスト..."
    QUERY_TIME=$(docker-compose exec -T postgres psql -U postgres -d postgres -c "\timing on" -c "SELECT COUNT(*) FROM pg_tables;" 2>/dev/null | grep "Time:" | awk '{print $2}' | tr -d 'ms')
    
    if [ ! -z "$QUERY_TIME" ]; then
        log_success "PostgreSQL クエリ時間: ${QUERY_TIME}ms"
    else
        log_info "PostgreSQL パフォーマンス測定スキップ"
    fi
    
    # Meilisearch 検索パフォーマンス
    log_info "Meilisearch 検索パフォーマンステスト..."
    START_TIME=$(date +%s%3N)
    curl -s -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
         "http://localhost:7700/indexes/design-embeddings/search?q=test&limit=10" > /dev/null 2>&1
    END_TIME=$(date +%s%3N)
    SEARCH_TIME=$((END_TIME - START_TIME))
    
    log_success "Meilisearch 検索時間: ${SEARCH_TIME}ms"
}

# 接続情報表示
show_connection_info() {
    log_header "接続情報"
    
    echo "🌐 アクセス可能なサービス:"
    echo "  📊 n8n管理画面:        http://localhost:5678"
    echo "  🔍 Meilisearch:       http://localhost:7700"
    echo "  🗄️  pgAdmin:           http://localhost:5050"
    echo "  🌐 Nginx Gateway:     http://localhost:80"
    echo ""
    echo "🔑 認証情報:"
    echo "  n8n:     ${N8N_BASIC_AUTH_USER:-admin} / ${N8N_BASIC_AUTH_PASSWORD:-check .env}"
    echo "  pgAdmin: ${PGADMIN_EMAIL:-admin@example.com} / ${PGADMIN_PASSWORD:-check .env}"
    echo ""
    echo "🐳 Dockerコマンド:"
    echo "  ログ確認:      docker-compose logs -f [service]"
    echo "  再起動:        docker-compose restart [service]"
    echo "  停止:          docker-compose down"
    echo "  完全削除:      docker-compose down -v"
}

# クリーンアップ
cleanup() {
    log_header "テスト後クリーンアップ"
    
    # 一時ファイル削除
    rm -f /tmp/claude_test.json /tmp/embedding_test.json /tmp/webhook_test.json
    log_success "一時ファイル削除完了"
}

# メイン実行
main() {
    echo "🚀 統合システムテスト開始"
    echo "====================================="
    
    # .env ファイル読み込み
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
        log_success ".env ファイル読み込み完了"
    else
        log_warning ".env ファイルが見つかりません"
        echo "  .env.example をコピーして設定してください:"
        echo "  cp .env.example .env"
    fi
    
    # テスト実行
    check_env_vars
    check_docker_services
    health_check
    check_database_tables
    check_meilisearch_index
    test_api_endpoints
    check_n8n_workflows
    performance_test
    show_connection_info
    cleanup
    
    echo ""
    log_success "🎉 統合システムテスト完了!"
    echo ""
    echo "次のステップ:"
    echo "1. 各サービスの管理画面にアクセスして動作確認"
    echo "2. n8nでワークフローをインポート"
    echo "3. UploadForm.tsxでFigma URLをテスト"
    echo "4. 本番環境用の設定調整"
}

# スクリプト実行
main "$@"