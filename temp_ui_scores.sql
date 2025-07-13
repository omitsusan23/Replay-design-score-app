-- ui_scoresテーブル作成
CREATE TABLE IF NOT EXISTS ui_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES ui_submissions(id) ON DELETE CASCADE,
    ui_type TEXT NOT NULL,
    score_aesthetic NUMERIC(3,1) NOT NULL CHECK (score_aesthetic >= 0 AND score_aesthetic <= 10),
    score_usability NUMERIC(3,1) NOT NULL CHECK (score_usability >= 0 AND score_usability <= 10),
    score_alignment NUMERIC(3,1) NOT NULL CHECK (score_alignment >= 0 AND score_alignment <= 10),
    score_accessibility NUMERIC(3,1) NOT NULL CHECK (score_accessibility >= 0 AND score_accessibility <= 10),
    score_consistency NUMERIC(3,1) NOT NULL CHECK (score_consistency >= 0 AND score_consistency <= 10),
    review_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- total_score計算カラムを追加
ALTER TABLE ui_scores ADD COLUMN total_score NUMERIC(3,2) GENERATED ALWAYS AS (
    (score_aesthetic + score_usability + score_alignment + score_accessibility + score_consistency) / 5.0
) STORED; 