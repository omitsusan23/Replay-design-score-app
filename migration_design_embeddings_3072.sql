-- =============================================================================
-- design_embeddings テーブル マイグレーション
-- OpenAI text-embedding-3-large (3072次元) 対応
-- =============================================================================

-- pgvector 拡張の確認・インストール
CREATE EXTENSION IF NOT EXISTS vector;

-- training_examples テーブルの確認・作成（参照整合性用）
CREATE TABLE IF NOT EXISTS training_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    figma_url TEXT,
    image_url TEXT,
    genre TEXT NOT NULL,                    -- Claude分類結果
    ui_component_type TEXT,                 -- UIコンポーネント種別
    
    -- Claude評価スコア群（0.0-1.0スケール）
    score_aesthetic NUMERIC(3,2) CHECK (score_aesthetic >= 0 AND score_aesthetic <= 1),
    score_consistency NUMERIC(3,2) CHECK (score_consistency >= 0 AND score_consistency <= 1),
    score_hierarchy NUMERIC(3,2) CHECK (score_hierarchy >= 0 AND score_hierarchy <= 1),
    score_usability NUMERIC(3,2) CHECK (score_usability >= 0 AND score_usability <= 1),
    score_responsive NUMERIC(3,2) CHECK (score_responsive >= 0 AND score_responsive <= 1),
    score_accessibility NUMERIC(3,2) CHECK (score_accessibility >= 0 AND score_accessibility <= 1),
    
    -- 総合スコア（自動計算）
    total_score NUMERIC(3,2) GENERATED ALWAYS AS (
        COALESCE(
            (COALESCE(score_aesthetic, 0) + 
             COALESCE(score_consistency, 0) + 
             COALESCE(score_hierarchy, 0) + 
             COALESCE(score_usability, 0) + 
             COALESCE(score_responsive, 0) + 
             COALESCE(score_accessibility, 0)) / 
            GREATEST(1, 
                (CASE WHEN score_aesthetic IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN score_consistency IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN score_hierarchy IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN score_usability IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN score_responsive IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN score_accessibility IS NOT NULL THEN 1 ELSE 0 END)
            ), 0
        )
    ) STORED,
    
    -- Claude生出力テキスト
    claude_raw_response TEXT,
    claude_summary TEXT,
    
    -- メタデータ
    upload_source TEXT DEFAULT 'upload_form',   -- アップロード元
    processing_status TEXT DEFAULT 'pending',   -- pending, processing, completed, failed
    tags TEXT[],                                -- タグ配列
    
    -- タイムスタンプ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT training_examples_has_url CHECK (
        (figma_url IS NOT NULL AND figma_url != '') OR 
        (image_url IS NOT NULL AND image_url != '')
    )
);

-- design_embeddings メインテーブル作成
CREATE TABLE IF NOT EXISTS design_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 外部キー (training_examples)
    example_id UUID NOT NULL REFERENCES training_examples(id) ON DELETE CASCADE,
    
    -- ベクトル埋め込み (OpenAI text-embedding-3-large: 3072次元)
    embedding VECTOR(3072) NOT NULL,
    
    -- 埋め込み対象テキスト
    text_content TEXT NOT NULL,
    
    -- 埋め込みタイプ分類
    embedding_type TEXT NOT NULL DEFAULT 'claude_output',
    -- 値例: 'claude_output', 'genre_classification', 'design_scores', 'summary', 'figma_description'
    
    -- OpenAI API情報
    model_name TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    embedding_dimensions INTEGER NOT NULL DEFAULT 3072,
    api_version TEXT DEFAULT '2023-12-01',
    
    -- 処理情報
    processing_time_ms INTEGER,            -- 処理時間（ミリ秒）
    token_count INTEGER,                   -- 使用トークン数
    
    -- メタデータ（JSONB形式）
    metadata JSONB DEFAULT '{}',
    -- 例: {"figma_url": "...", "genre": "チャットUI", "scores": {...}, "ui_elements": [...]}
    
    -- 品質管理
    confidence_score NUMERIC(3,2),         -- 埋め込み信頼度
    is_validated BOOLEAN DEFAULT FALSE,    -- 人手検証済み
    validation_notes TEXT,                 -- 検証メモ
    
    -- タイムスタンプ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
-- 基本インデックス
CREATE INDEX IF NOT EXISTS idx_design_embeddings_example_id 
ON design_embeddings(example_id);

CREATE INDEX IF NOT EXISTS idx_design_embeddings_type 
ON design_embeddings(embedding_type);

CREATE INDEX IF NOT EXISTS idx_design_embeddings_model 
ON design_embeddings(model_name);

CREATE INDEX IF NOT EXISTS idx_design_embeddings_created_at 
ON design_embeddings(created_at DESC);

-- pgvector インデックス（コサイン類似度最適化）
CREATE INDEX IF NOT EXISTS idx_design_embeddings_vector_cosine 
ON design_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- pgvector インデックス（L2距離最適化）
CREATE INDEX IF NOT EXISTS idx_design_embeddings_vector_l2 
ON design_embeddings USING ivfflat (embedding vector_l2_ops) 
WITH (lists = 100);

-- JSONB メタデータインデックス
CREATE INDEX IF NOT EXISTS idx_design_embeddings_metadata_gin 
ON design_embeddings USING GIN(metadata);

-- 複合インデックス
CREATE INDEX IF NOT EXISTS idx_design_embeddings_type_created 
ON design_embeddings(embedding_type, created_at DESC);

-- training_examples のインデックス
CREATE INDEX IF NOT EXISTS idx_training_examples_genre 
ON training_examples(genre);

CREATE INDEX IF NOT EXISTS idx_training_examples_total_score 
ON training_examples(total_score DESC) WHERE total_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_examples_processing_status 
ON training_examples(processing_status);

CREATE INDEX IF NOT EXISTS idx_training_examples_tags_gin 
ON training_examples USING GIN(tags);

-- =============================================================================
-- 類似度検索関数
-- =============================================================================

-- コサイン類似度検索関数
CREATE OR REPLACE FUNCTION search_similar_embeddings_cosine(
    query_embedding VECTOR(3072),
    embedding_type_filter TEXT DEFAULT NULL,
    search_limit INTEGER DEFAULT 10,
    min_similarity NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    example_id UUID,
    embedding_type TEXT,
    text_content TEXT,
    similarity NUMERIC,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.id,
        de.example_id,
        de.embedding_type,
        de.text_content,
        (1 - (de.embedding <=> query_embedding))::NUMERIC AS similarity,
        de.metadata,
        de.created_at
    FROM design_embeddings de
    WHERE 
        (embedding_type_filter IS NULL OR de.embedding_type = embedding_type_filter)
        AND (1 - (de.embedding <=> query_embedding)) > min_similarity
    ORDER BY de.embedding <=> query_embedding
    LIMIT search_limit;
END;
$$ LANGUAGE plpgsql;

-- ハイブリッド検索関数（ベクトル類似度 + メタデータフィルタ）
CREATE OR REPLACE FUNCTION search_embeddings_hybrid(
    query_embedding VECTOR(3072),
    genre_filter TEXT DEFAULT NULL,
    min_total_score NUMERIC DEFAULT NULL,
    embedding_type_filter TEXT DEFAULT NULL,
    search_limit INTEGER DEFAULT 10,
    min_similarity NUMERIC DEFAULT 0.6
)
RETURNS TABLE (
    id UUID,
    example_id UUID,
    embedding_type TEXT,
    text_content TEXT,
    similarity NUMERIC,
    genre TEXT,
    total_score NUMERIC,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.id,
        de.example_id,
        de.embedding_type,
        de.text_content,
        (1 - (de.embedding <=> query_embedding))::NUMERIC AS similarity,
        te.genre,
        te.total_score,
        de.metadata,
        de.created_at
    FROM design_embeddings de
    JOIN training_examples te ON de.example_id = te.id
    WHERE 
        (1 - (de.embedding <=> query_embedding)) > min_similarity
        AND (embedding_type_filter IS NULL OR de.embedding_type = embedding_type_filter)
        AND (genre_filter IS NULL OR te.genre = genre_filter)
        AND (min_total_score IS NULL OR te.total_score >= min_total_score)
    ORDER BY de.embedding <=> query_embedding
    LIMIT search_limit;
END;
$$ LANGUAGE plpgsql;

-- ジャンル別統計関数
CREATE OR REPLACE FUNCTION get_embeddings_stats_by_genre()
RETURNS TABLE (
    genre TEXT,
    embedding_count BIGINT,
    avg_total_score NUMERIC,
    most_common_type TEXT,
    latest_created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        te.genre,
        COUNT(de.id) AS embedding_count,
        AVG(te.total_score)::NUMERIC(3,2) AS avg_total_score,
        MODE() WITHIN GROUP (ORDER BY de.embedding_type) AS most_common_type,
        MAX(de.created_at) AS latest_created_at
    FROM training_examples te
    LEFT JOIN design_embeddings de ON te.id = de.example_id
    WHERE te.genre IS NOT NULL
    GROUP BY te.genre
    ORDER BY embedding_count DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- トリガー関数（updated_at自動更新）
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガー作成
CREATE TRIGGER update_training_examples_updated_at 
    BEFORE UPDATE ON training_examples 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_design_embeddings_updated_at 
    BEFORE UPDATE ON design_embeddings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- サンプルデータ投入（テスト用）
-- =============================================================================

-- サンプル training_examples
INSERT INTO training_examples (
    figma_url, genre, score_aesthetic, score_consistency, score_hierarchy, 
    score_usability, score_accessibility, claude_raw_response, claude_summary
) VALUES 
(
    'https://figma.com/sample-chat-ui',
    'チャットUI',
    0.85, 0.90, 0.75, 0.80, 0.65,
    'このFigmaデザインは【チャットUI】として分類されます。配色: 8.5、一貫性: 9.0...',
    'モダンなチャットインターフェース。メッセージ階層が明確で統一されたデザイン。'
),
(
    'https://figma.com/sample-booking-form',
    '予約画面',
    0.78, 0.82, 0.88, 0.85, 0.70,
    'このFigmaデザインは【予約画面】として分類されます。フォーム設計が優秀...',
    '直感的な予約フォーム。ステップが明確で入力しやすいレイアウト。'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 権限設定（Supabase RLS対応）
-- =============================================================================

-- RLS有効化
ALTER TABLE training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_embeddings ENABLE ROW LEVEL SECURITY;

-- 基本的なポリシー（認証ユーザーのみアクセス可能）
CREATE POLICY "Authenticated users can view training examples" 
ON training_examples FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert training examples" 
ON training_examples FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view design embeddings" 
ON design_embeddings FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert design embeddings" 
ON design_embeddings FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================================================
-- ビュー作成
-- =============================================================================

-- 統合ビュー（training_examples + design_embeddings）
CREATE OR REPLACE VIEW embeddings_with_examples AS
SELECT 
    de.id as embedding_id,
    de.example_id,
    de.embedding_type,
    de.text_content,
    de.model_name,
    de.metadata as embedding_metadata,
    de.created_at as embedding_created_at,
    te.figma_url,
    te.genre,
    te.score_aesthetic,
    te.score_consistency,
    te.score_hierarchy,
    te.score_usability,
    te.score_responsive,
    te.score_accessibility,
    te.total_score,
    te.claude_summary,
    te.processing_status,
    te.tags,
    te.created_at as example_created_at
FROM design_embeddings de
JOIN training_examples te ON de.example_id = te.id;

-- 統計ビュー
CREATE OR REPLACE VIEW embedding_statistics AS
SELECT 
    COUNT(*) as total_embeddings,
    COUNT(DISTINCT example_id) as unique_examples,
    COUNT(DISTINCT embedding_type) as embedding_types_count,
    AVG(embedding_dimensions) as avg_dimensions,
    MIN(created_at) as earliest_embedding,
    MAX(created_at) as latest_embedding
FROM design_embeddings;

-- =============================================================================
-- コメント追加
-- =============================================================================

COMMENT ON TABLE training_examples IS 'Claude API による UI デザイン分析結果';
COMMENT ON TABLE design_embeddings IS 'OpenAI text-embedding-3-large による 3072次元ベクトル埋め込み';

COMMENT ON COLUMN design_embeddings.embedding IS 'OpenAI text-embedding-3-large 3072次元ベクトル';
COMMENT ON COLUMN design_embeddings.embedding_type IS '埋め込みタイプ: claude_output, genre_classification, design_scores など';
COMMENT ON COLUMN design_embeddings.metadata IS 'JSON形式のメタデータ（figma_url, scores など）';

COMMENT ON FUNCTION search_similar_embeddings_cosine IS 'コサイン類似度による埋め込み検索';
COMMENT ON FUNCTION search_embeddings_hybrid IS 'ベクトル類似度とメタデータフィルタを組み合わせたハイブリッド検索';

-- =============================================================================
-- マイグレーション完了確認
-- =============================================================================

-- pgvector 拡張確認
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension 
WHERE extname = 'vector';

-- テーブル作成確認
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('training_examples', 'design_embeddings');

-- ベクトルインデックス確認
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('design_embeddings') 
AND indexname LIKE '%vector%';

-- 完了メッセージ
DO $$
BEGIN
    RAISE NOTICE '✅ design_embeddings migration completed successfully!';
    RAISE NOTICE '📊 Tables: training_examples, design_embeddings';
    RAISE NOTICE '🔍 Vector dimension: 3072 (text-embedding-3-large)';
    RAISE NOTICE '⚡ Indexes: Cosine similarity, L2 distance, JSONB metadata';
    RAISE NOTICE '🔧 Functions: search_similar_embeddings_cosine, search_embeddings_hybrid';
END $$;