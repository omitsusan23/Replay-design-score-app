-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_ui_submissions_user_id ON ui_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_ui_submissions_created_at ON ui_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ui_scores_submission_id ON ui_scores(submission_id);
CREATE INDEX IF NOT EXISTS idx_ui_scores_created_at ON ui_scores(created_at DESC);

-- RLS (Row Level Security) 有効化
ALTER TABLE ui_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_scores ENABLE ROW LEVEL SECURITY;

-- ui_submissions ポリシー
DROP POLICY IF EXISTS "Users can view their own submissions" ON ui_submissions;
CREATE POLICY "Users can view their own submissions" ON ui_submissions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own submissions" ON ui_submissions;
CREATE POLICY "Users can insert their own submissions" ON ui_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own submissions" ON ui_submissions;
CREATE POLICY "Users can update their own submissions" ON ui_submissions
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own submissions" ON ui_submissions;
CREATE POLICY "Users can delete their own submissions" ON ui_submissions
    FOR DELETE USING (auth.uid() = user_id);

-- ui_scores ポリシー
DROP POLICY IF EXISTS "Users can view scores for their submissions" ON ui_scores;
CREATE POLICY "Users can view scores for their submissions" ON ui_scores
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_scores.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Authenticated users can insert scores" ON ui_scores;
CREATE POLICY "Authenticated users can insert scores" ON ui_scores
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ビュー作成
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