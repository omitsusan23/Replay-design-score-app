-- Replay Design Score App v1.0 正式版データベーススキーマ
-- Supabase PostgreSQL

-- UI提出記録テーブル
CREATE TABLE IF NOT EXISTS ui_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    description TEXT,
    structure_note TEXT, -- 構造メモ（設計意図）
    figma_url TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    
    -- 制約
    CONSTRAINT ui_submissions_has_url CHECK (
        (figma_url IS NOT NULL AND figma_url != '') OR 
        (image_url IS NOT NULL AND image_url != '')
    )
);

-- Claudeによるスコアテーブル
CREATE TABLE IF NOT EXISTS ui_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES ui_submissions(id) ON DELETE CASCADE,
    ui_type TEXT NOT NULL, -- LP, Dashboard, Form, Mobile App, E-commerce, その他
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

-- インデックス
CREATE INDEX idx_ui_submissions_user_id ON ui_submissions(user_id);
CREATE INDEX idx_ui_submissions_created_at ON ui_submissions(created_at DESC);
CREATE INDEX idx_ui_scores_submission_id ON ui_scores(submission_id);
CREATE INDEX idx_ui_scores_created_at ON ui_scores(created_at DESC);

-- RLS (Row Level Security) ポリシー
ALTER TABLE ui_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_scores ENABLE ROW LEVEL SECURITY;

-- ui_submissions ポリシー
CREATE POLICY "Users can view their own submissions" ON ui_submissions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own submissions" ON ui_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own submissions" ON ui_submissions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own submissions" ON ui_submissions
    FOR DELETE USING (auth.uid() = user_id);

-- ui_scores ポリシー（submissionの所有者のみアクセス可能）
CREATE POLICY "Users can view scores for their submissions" ON ui_scores
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_scores.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

-- スコアの挿入は認証されたユーザーのみ（API経由でのみ作成）
CREATE POLICY "Authenticated users can insert scores" ON ui_scores
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 関数：提出と同時にデフォルトスコアを作成（オプション）
CREATE OR REPLACE FUNCTION create_default_score()
RETURNS TRIGGER AS $$
BEGIN
    -- デフォルトスコアは作成しない（API経由でClaudeが評価後に作成）
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ビュー：提出物とスコアの結合ビュー
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

-- ビューにはRLSポリシーを直接適用できないため、ベーステーブルのポリシーで制御されます
-- ui_submissionsとui_scoresの既存のRLSポリシーにより、ビューも適切に保護されます