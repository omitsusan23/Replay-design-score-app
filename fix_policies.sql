-- 既存のポリシーを削除して再作成
-- ui_submissions のポリシー修正
DROP POLICY IF EXISTS "Users can insert their own submissions" ON ui_submissions;
CREATE POLICY "Users can insert their own submissions" ON ui_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own submissions" ON ui_submissions;
CREATE POLICY "Users can update their own submissions" ON ui_submissions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ui_scores のポリシー修正
DROP POLICY IF EXISTS "Authenticated users can insert scores" ON ui_scores;
CREATE POLICY "Authenticated users can insert scores" ON ui_scores
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- auth.uid()関数の動作確認用
-- この関数がローカルSupabaseで正しく機能するかテスト
SELECT 
    'auth.uid() function test' as test_name,
    auth.uid() as current_user_id,
    current_user as current_role; 