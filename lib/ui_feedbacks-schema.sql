-- ui_feedbacks テーブル作成
-- AIフィードバック（主観的評価コメント）を保存

CREATE TABLE IF NOT EXISTS ui_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES ui_submissions(id) ON DELETE CASCADE,
    visual_impact TEXT,
    user_experience TEXT,
    brand_consistency TEXT,
    trend_alignment TEXT,
    improvement_suggestions TEXT[], -- 改善提案の配列
    overall_feedback TEXT,
    tone TEXT CHECK (tone IN ('positive', 'neutral', 'constructive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_ui_feedbacks_submission_id ON ui_feedbacks(submission_id);
CREATE INDEX IF NOT EXISTS idx_ui_feedbacks_created_at ON ui_feedbacks(created_at DESC);

-- RLS (Row Level Security) ポリシー
ALTER TABLE ui_feedbacks ENABLE ROW LEVEL SECURITY;

-- ui_feedbacks ポリシー（submissionの所有者のみアクセス可能）
CREATE POLICY "Users can view feedbacks for their submissions" ON ui_feedbacks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_feedbacks.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

-- フィードバックの挿入は認証されたユーザーのみ（API経由でのみ作成）
CREATE POLICY "Authenticated users can insert feedbacks" ON ui_feedbacks
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- フィードバックの更新は所有者のみ
CREATE POLICY "Users can update feedbacks for their submissions" ON ui_feedbacks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_feedbacks.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

-- フィードバックの削除は所有者のみ
CREATE POLICY "Users can delete feedbacks for their submissions" ON ui_feedbacks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_feedbacks.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

-- 既存のビューを更新（フィードバックを含む）
CREATE OR REPLACE VIEW ui_submissions_with_scores_and_feedback AS
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