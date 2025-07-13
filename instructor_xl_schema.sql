-- Instructor-XL（4096次元）対応 RAGスキーマ
-- 旧OpenAI embedding（1536次元）から移行

-- 1. pgvector拡張の確認・インストール
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 新しいRAGドキュメントテーブル（Instructor-XL用）
CREATE TABLE IF NOT EXISTS rag_documents_instructor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 基本情報
    title TEXT NOT NULL,
    ui_type TEXT NOT NULL,
    description TEXT,
    copied_content TEXT NOT NULL,
    
    -- Instructor-XL 埋め込み（4096次元）
    embedding VECTOR(4096) NOT NULL,           -- メイン埋め込み
    content_embedding VECTOR(4096),            -- コンテンツ埋め込み
    title_embedding VECTOR(4096),              -- タイトル埋め込み
    
    -- メタデータ
    paste_context JSONB,
    keywords TEXT[],
    source_url TEXT,
    
    -- Claude評価結果
    claude_evaluation JSONB,
    evaluation_score NUMERIC(3,2) DEFAULT 0.5,
    improvement_notes TEXT[],
    
    -- 埋め込みモデル情報
    embedding_model TEXT DEFAULT 'instructor-xl' NOT NULL,
    embedding_generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 承認・レビュー
    is_approved BOOLEAN DEFAULT FALSE,
    review_count INTEGER DEFAULT 0,
    
    -- タイムスタンプ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. インデックス作成
CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_ui_type 
ON rag_documents_instructor(ui_type);

CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_approved 
ON rag_documents_instructor(is_approved) WHERE is_approved = TRUE;

CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_score 
ON rag_documents_instructor(evaluation_score DESC);

CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_keywords 
ON rag_documents_instructor USING GIN(keywords);

-- 4. pgvector インデックス（4096次元対応）
CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_embedding 
ON rag_documents_instructor USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_content_embedding 
ON rag_documents_instructor USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_rag_docs_instructor_title_embedding 
ON rag_documents_instructor USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);

-- 5. cosine類似度検索関数
CREATE OR REPLACE FUNCTION search_rag_instructor(
    query_embedding VECTOR(4096),
    search_limit INTEGER DEFAULT 10,
    min_score NUMERIC DEFAULT 0.0
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    ui_type TEXT,
    description TEXT,
    similarity NUMERIC,
    evaluation_score NUMERIC,
    claude_evaluation JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.ui_type,
        r.description,
        (1 - (r.embedding <=> query_embedding))::NUMERIC AS similarity,
        r.evaluation_score,
        r.claude_evaluation
    FROM rag_documents_instructor r
    WHERE r.is_approved = TRUE
    AND (1 - (r.embedding <=> query_embedding)) > min_score
    ORDER BY r.embedding <=> query_embedding
    LIMIT search_limit;
END;
$$ LANGUAGE plpgsql;

-- 6. ハイブリッド検索関数（ベクトル + キーワード）
CREATE OR REPLACE FUNCTION hybrid_search_instructor(
    query_text TEXT,
    query_embedding VECTOR(4096),
    search_limit INTEGER DEFAULT 10,
    vector_weight NUMERIC DEFAULT 0.7,
    text_weight NUMERIC DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    ui_type TEXT,
    description TEXT,
    vector_similarity NUMERIC,
    text_rank NUMERIC,
    combined_score NUMERIC,
    evaluation_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.ui_type,
        r.description,
        (1 - (r.embedding <=> query_embedding))::NUMERIC AS vector_similarity,
        ts_rank(
            to_tsvector('simple', r.title || ' ' || COALESCE(r.description, '') || ' ' || array_to_string(r.keywords, ' ')),
            plainto_tsquery('simple', query_text)
        )::NUMERIC AS text_rank,
        (
            vector_weight * (1 - (r.embedding <=> query_embedding)) +
            text_weight * ts_rank(
                to_tsvector('simple', r.title || ' ' || COALESCE(r.description, '') || ' ' || array_to_string(r.keywords, ' ')),
                plainto_tsquery('simple', query_text)
            )
        )::NUMERIC AS combined_score,
        r.evaluation_score
    FROM rag_documents_instructor r
    WHERE r.is_approved = TRUE
    ORDER BY combined_score DESC
    LIMIT search_limit;
END;
$$ LANGUAGE plpgsql;

-- 7. 統計情報取得関数
CREATE OR REPLACE FUNCTION get_rag_instructor_stats()
RETURNS TABLE (
    total_documents INTEGER,
    approved_documents INTEGER,
    avg_evaluation_score NUMERIC,
    ui_types_count JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER AS total_documents,
        COUNT(*) FILTER (WHERE is_approved = TRUE)::INTEGER AS approved_documents,
        AVG(evaluation_score)::NUMERIC(3,2) AS avg_evaluation_score,
        json_object_agg(ui_type, cnt)::JSONB AS ui_types_count
    FROM (
        SELECT ui_type, COUNT(*) as cnt
        FROM rag_documents_instructor
        WHERE is_approved = TRUE
        GROUP BY ui_type
    ) ui_counts;
END;
$$ LANGUAGE plpgsql;

-- 8. データマイグレーション用のビュー（既存データを確認する場合）
CREATE OR REPLACE VIEW migration_check AS
SELECT 
    'rag_documents' AS source_table,
    COUNT(*) AS record_count,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS with_embedding,
    array_length(embedding, 1) AS embedding_dimension
FROM rag_documents
WHERE embedding IS NOT NULL
UNION ALL
SELECT 
    'rag_documents_instructor' AS source_table,
    COUNT(*) AS record_count,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS with_embedding,
    array_length(embedding, 1) AS embedding_dimension
FROM rag_documents_instructor
WHERE embedding IS NOT NULL;

-- コメント追加
COMMENT ON TABLE rag_documents_instructor IS 'Instructor-XL（4096次元）埋め込み対応のRAGドキュメントテーブル';
COMMENT ON COLUMN rag_documents_instructor.embedding IS 'Instructor-XLメイン埋め込み（4096次元）';
COMMENT ON COLUMN rag_documents_instructor.content_embedding IS 'コンテンツ専用埋め込み（4096次元）';
COMMENT ON COLUMN rag_documents_instructor.title_embedding IS 'タイトル専用埋め込み（4096次元）';
COMMENT ON FUNCTION search_rag_instructor IS 'Instructor-XL埋め込みによるコサイン類似度検索';
COMMENT ON FUNCTION hybrid_search_instructor IS 'ベクトル検索とテキスト検索を組み合わせたハイブリッド検索';