-- 完全スキーマ適用：Replay Design Score App
-- クラウドSupabaseの構造を完全に再現

-- 1. 基本テーブル: ui_submissions
CREATE TABLE IF NOT EXISTS ui_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    description TEXT,
    structure_note TEXT,
    figma_url TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    
    -- 制約
    CONSTRAINT ui_submissions_has_url CHECK (
        (figma_url IS NOT NULL AND figma_url != '') OR 
        (image_url IS NOT NULL AND image_url != '')
    )
);

-- 2. ui_scores テーブル
CREATE TABLE IF NOT EXISTS ui_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES ui_submissions(id) ON DELETE CASCADE,
    ui_type TEXT NOT NULL,
    score_aesthetic NUMERIC(3,1) NOT NULL CHECK (score_aesthetic >= 0 AND score_aesthetic <= 10),
    score_usability NUMERIC(3,1) NOT NULL CHECK (score_usability >= 0 AND score_usability <= 10),
    score_alignment NUMERIC(3,1) NOT NULL CHECK (score_alignment >= 0 AND score_alignment <= 10),
    score_accessibility NUMERIC(3,1) NOT NULL CHECK (score_accessibility >= 0 AND score_accessibility <= 10),
    score_consistency NUMERIC(3,1) NOT NULL CHECK (score_consistency >= 0 AND score_consistency <= 10),
    total_score NUMERIC(3,2) GENERATED ALWAYS AS (
        (score_aesthetic + score_usability + score_alignment + score_accessibility + score_consistency) / 5.0
    ) STORED,
    review_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. ui_feedbacks テーブル
CREATE TABLE IF NOT EXISTS ui_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES ui_submissions(id) ON DELETE CASCADE,
    visual_impact TEXT,
    user_experience TEXT,
    brand_consistency TEXT,
    trend_alignment TEXT,
    improvement_suggestions TEXT[],
    overall_feedback TEXT,
    tone TEXT CHECK (tone IN ('positive', 'neutral', 'constructive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 4. training_examples テーブル
CREATE TABLE IF NOT EXISTS training_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    figma_url TEXT,
    image_url TEXT,
    structure_note TEXT NOT NULL,
    ui_type TEXT NOT NULL,
    
    -- 評価スコア
    score_aesthetic NUMERIC(3,1) NOT NULL CHECK (score_aesthetic >= 0 AND score_aesthetic <= 10),
    score_usability NUMERIC(3,1) NOT NULL CHECK (score_usability >= 0 AND score_usability <= 10),
    score_alignment NUMERIC(3,1) NOT NULL CHECK (score_alignment >= 0 AND score_alignment <= 10),
    score_accessibility NUMERIC(3,1) NOT NULL CHECK (score_accessibility >= 0 AND score_accessibility <= 10),
    score_consistency NUMERIC(3,1) NOT NULL CHECK (score_consistency >= 0 AND score_consistency <= 10),
    
    -- 総合スコア
    total_score NUMERIC(3,2) GENERATED ALWAYS AS (
        (score_aesthetic + score_usability + score_alignment + score_accessibility + score_consistency) / 5.0
    ) STORED,
    
    review_text TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    tags TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    
    -- 制約
    CONSTRAINT training_examples_has_url CHECK (
        (figma_url IS NOT NULL AND figma_url != '') OR 
        (image_url IS NOT NULL AND image_url != '')
    )
);

-- 5. updated_at自動更新のトリガー関数
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

-- 6. インデックス作成
CREATE INDEX IF NOT EXISTS idx_ui_submissions_user_id ON ui_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_ui_submissions_created_at ON ui_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ui_scores_submission_id ON ui_scores(submission_id);
CREATE INDEX IF NOT EXISTS idx_ui_scores_created_at ON ui_scores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ui_feedbacks_submission_id ON ui_feedbacks(submission_id);
CREATE INDEX IF NOT EXISTS idx_ui_feedbacks_created_at ON ui_feedbacks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_examples_ui_type ON training_examples(ui_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_added_by ON training_examples(added_by);
CREATE INDEX IF NOT EXISTS idx_training_examples_created_at ON training_examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_examples_total_score ON training_examples(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_examples_approved ON training_examples(is_approved) WHERE is_approved = TRUE;
CREATE INDEX IF NOT EXISTS idx_training_examples_tags ON training_examples USING GIN(tags);

-- 7. ビュー作成
CREATE OR REPLACE VIEW ui_submissions_with_scores AS
SELECT 
    s.id,
    s.user_id,
    s.project_name,
    s.description,
    s.structure_note,
    s.figma_url,
    s.image_url,
    s.created_at as submitted_at,
    sc.id as score_id,
    sc.ui_type,
    sc.score_aesthetic,
    sc.score_usability,
    sc.score_alignment,
    sc.score_accessibility,
    sc.score_consistency,
    sc.total_score,
    sc.review_text,
    sc.created_at as scored_at
FROM ui_submissions s
LEFT JOIN ui_scores sc ON s.id = sc.submission_id;

CREATE OR REPLACE VIEW ui_submissions_with_scores_and_feedbacks AS
SELECT 
    s.id,
    s.user_id,
    s.project_name,
    s.description,
    s.structure_note,
    s.figma_url,
    s.image_url,
    s.created_at as submitted_at,
    sc.id as score_id,
    sc.ui_type,
    sc.score_aesthetic,
    sc.score_usability,
    sc.score_alignment,
    sc.score_accessibility,
    sc.score_consistency,
    sc.total_score,
    sc.review_text,
    sc.created_at as scored_at,
    fb.id as feedback_id,
    fb.visual_impact,
    fb.user_experience,
    fb.brand_consistency,
    fb.trend_alignment,
    fb.improvement_suggestions,
    fb.overall_feedback,
    fb.tone,
    fb.created_at as feedback_created_at
FROM ui_submissions s
LEFT JOIN ui_scores sc ON s.id = sc.submission_id
LEFT JOIN ui_feedbacks fb ON s.id = fb.submission_id;

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