-- RLS (Row Level Security) ポリシー設定
-- すべてのテーブルでRLSを有効化

-- 1. ui_submissions のRLSとポリシー
ALTER TABLE ui_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own submissions" ON ui_submissions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own submissions" ON ui_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own submissions" ON ui_submissions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own submissions" ON ui_submissions
    FOR DELETE USING (auth.uid() = user_id);

-- 2. ui_scores のRLSとポリシー
ALTER TABLE ui_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scores for their submissions" ON ui_scores
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_scores.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can insert scores" ON ui_scores
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. ui_feedbacks のRLSとポリシー
ALTER TABLE ui_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view feedbacks for their submissions" ON ui_feedbacks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_feedbacks.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can insert feedbacks" ON ui_feedbacks
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update feedbacks for their submissions" ON ui_feedbacks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_feedbacks.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete feedbacks for their submissions" ON ui_feedbacks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM ui_submissions 
            WHERE ui_submissions.id = ui_feedbacks.submission_id 
            AND ui_submissions.user_id = auth.uid()
        )
    );

-- 4. training_examples のRLSとポリシー
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