-- RAG構成用 教師データテーブル作成
-- Replay Design Score App - Training Examples for RAG

-- 教師データテーブル
CREATE TABLE IF NOT EXISTS training_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    figma_url TEXT,
    image_url TEXT,
    structure_note TEXT NOT NULL, -- 設計意図（必須）
    ui_type TEXT NOT NULL, -- LP, Dashboard, Form, Mobile App, E-commerce, その他
    
    -- 評価スコア（5項目）
    score_aesthetic NUMERIC(3,1) NOT NULL CHECK (score_aesthetic >= 0 AND score_aesthetic <= 10),
    score_usability NUMERIC(3,1) NOT NULL CHECK (score_usability >= 0 AND score_usability <= 10),
    score_alignment NUMERIC(3,1) NOT NULL CHECK (score_alignment >= 0 AND score_alignment <= 10),
    score_accessibility NUMERIC(3,1) NOT NULL CHECK (score_accessibility >= 0 AND score_accessibility <= 10),
    score_consistency NUMERIC(3,1) NOT NULL CHECK (score_consistency >= 0 AND score_consistency <= 10),
    
    -- 総合スコア（自動計算）
    total_score NUMERIC(3,2) GENERATED ALWAYS AS (
        (score_aesthetic + score_usability + score_alignment + score_accessibility + score_consistency) / 5.0
    ) STORED,
    
    review_text TEXT NOT NULL, -- 講評
    
    -- 将来のベクトル検索用カラム（pgvector拡張インストール後に追加予定）
    -- embedding VECTOR(1536), -- OpenAI text-embedding-ada-002 の次元数
    
    -- メタデータ
    is_approved BOOLEAN DEFAULT FALSE, -- 管理者承認フラグ
    tags TEXT[], -- タグ配列（カテゴリ分類用）
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    
    -- 制約
    CONSTRAINT training_examples_has_url CHECK (
        (figma_url IS NOT NULL AND figma_url != '') OR 
        (image_url IS NOT NULL AND image_url != '')
    )
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_training_examples_ui_type ON training_examples(ui_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_added_by ON training_examples(added_by);
CREATE INDEX IF NOT EXISTS idx_training_examples_created_at ON training_examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_examples_total_score ON training_examples(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_examples_approved ON training_examples(is_approved) WHERE is_approved = TRUE;
CREATE INDEX IF NOT EXISTS idx_training_examples_tags ON training_examples USING GIN(tags);

-- 全文検索用インデックス（structure_note, review_text）
-- 日本語設定が利用可能な場合は 'japanese' を使用、そうでなければ 'simple' を使用
CREATE INDEX IF NOT EXISTS idx_training_examples_text_search 
ON training_examples USING GIN(to_tsvector('simple', structure_note || ' ' || review_text));

-- 将来のベクトル検索用インデックス（pgvector拡張 + embeddingカラム追加後）
-- CREATE EXTENSION IF NOT EXISTS vector;
-- ALTER TABLE training_examples ADD COLUMN embedding VECTOR(1536);
-- CREATE INDEX idx_training_examples_embedding 
-- ON training_examples USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- updated_at自動更新のトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_atトリガー
CREATE TRIGGER update_training_examples_updated_at 
    BEFORE UPDATE ON training_examples 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) ポリシー
ALTER TABLE training_examples ENABLE ROW LEVEL SECURITY;

-- 承認済みの教師データは全ユーザーが閲覧可能
CREATE POLICY "Approved training examples are viewable by all authenticated users" 
ON training_examples FOR SELECT 
USING (auth.uid() IS NOT NULL AND is_approved = TRUE);

-- 自分が追加した教師データは閲覧可能
CREATE POLICY "Users can view their own training examples" 
ON training_examples FOR SELECT 
USING (auth.uid() = added_by);

-- 管理者は全ての教師データを閲覧可能
CREATE POLICY "Admins can view all training examples" 
ON training_examples FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = auth.uid() 
        AND auth.users.raw_app_meta_data->>'role' = 'admin'
    )
);

-- 認証ユーザーは教師データを追加可能
CREATE POLICY "Authenticated users can insert training examples" 
ON training_examples FOR INSERT 
WITH CHECK (auth.uid() = added_by);

-- 自分が追加した教師データは更新可能
CREATE POLICY "Users can update their own training examples" 
ON training_examples FOR UPDATE 
USING (auth.uid() = added_by);

-- 管理者は全ての教師データを更新可能（承認用）
CREATE POLICY "Admins can update all training examples" 
ON training_examples FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = auth.uid() 
        AND auth.users.raw_app_meta_data->>'role' = 'admin'
    )
);

-- 自分が追加した教師データは削除可能
CREATE POLICY "Users can delete their own training examples" 
ON training_examples FOR DELETE 
USING (auth.uid() = added_by);

-- 管理者は全ての教師データを削除可能
CREATE POLICY "Admins can delete all training examples" 
ON training_examples FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = auth.uid() 
        AND auth.users.raw_app_meta_data->>'role' = 'admin'
    )
);

-- 教師データ統計ビュー
CREATE OR REPLACE VIEW training_examples_stats AS
SELECT 
    ui_type,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_approved = TRUE) as approved_count,
    ROUND(AVG(total_score), 2) as avg_total_score,
    ROUND(AVG(score_aesthetic), 2) as avg_aesthetic,
    ROUND(AVG(score_usability), 2) as avg_usability,
    ROUND(AVG(score_alignment), 2) as avg_alignment,
    ROUND(AVG(score_accessibility), 2) as avg_accessibility,
    ROUND(AVG(score_consistency), 2) as avg_consistency
FROM training_examples 
WHERE is_approved = TRUE
GROUP BY ui_type
ORDER BY total_count DESC;