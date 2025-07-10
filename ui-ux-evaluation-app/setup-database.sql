-- Supabase Database Setup for Training Examples
-- Project: hqegdcdbyflrmufzbsga
-- 
-- このSQLファイルをSupabaseのSQL Editorで実行してください

-- ========================================
-- 1. training_examplesテーブルの作成
-- ========================================
CREATE TABLE IF NOT EXISTS public.training_examples (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    added_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT,
    ui_type TEXT NOT NULL,
    structure_note TEXT NOT NULL,
    review_text TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_approved BOOLEAN DEFAULT false,
    figma_url TEXT,
    score_aesthetic NUMERIC(3,1) CHECK (score_aesthetic >= 0 AND score_aesthetic <= 10),
    score_usability NUMERIC(3,1) CHECK (score_usability >= 0 AND score_usability <= 10),
    score_alignment NUMERIC(3,1) CHECK (score_alignment >= 0 AND score_alignment <= 10),
    score_accessibility NUMERIC(3,1) CHECK (score_accessibility >= 0 AND score_accessibility <= 10),
    score_consistency NUMERIC(3,1) CHECK (score_consistency >= 0 AND score_consistency <= 10),
    total_score NUMERIC(4,1) GENERATED ALWAYS AS (
        COALESCE(score_aesthetic, 0) + 
        COALESCE(score_usability, 0) + 
        COALESCE(score_alignment, 0) + 
        COALESCE(score_accessibility, 0) + 
        COALESCE(score_consistency, 0)
    ) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ========================================
-- 2. インデックスの作成
-- ========================================
CREATE INDEX IF NOT EXISTS idx_training_examples_added_by ON public.training_examples(added_by);
CREATE INDEX IF NOT EXISTS idx_training_examples_ui_type ON public.training_examples(ui_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_is_approved ON public.training_examples(is_approved);
CREATE INDEX IF NOT EXISTS idx_training_examples_created_at ON public.training_examples(created_at);
CREATE INDEX IF NOT EXISTS idx_training_examples_total_score ON public.training_examples(total_score);

-- ========================================
-- 3. updated_atトリガーの作成
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER handle_training_examples_updated_at
    BEFORE UPDATE ON public.training_examples
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- 4. RLS (Row Level Security) の設定
-- ========================================
ALTER TABLE public.training_examples ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の投稿のみ閲覧可能
CREATE POLICY "Users can view their own training examples" ON public.training_examples
    FOR SELECT USING (auth.uid() = added_by);

-- 承認済みの投稿は全員閲覧可能
CREATE POLICY "Everyone can view approved training examples" ON public.training_examples
    FOR SELECT USING (is_approved = true);

-- ユーザーは自分の投稿のみ作成可能
CREATE POLICY "Users can insert their own training examples" ON public.training_examples
    FOR INSERT WITH CHECK (auth.uid() = added_by);

-- ユーザーは自分の未承認投稿のみ更新可能
CREATE POLICY "Users can update their own unapproved training examples" ON public.training_examples
    FOR UPDATE USING (auth.uid() = added_by AND is_approved = false);

-- ユーザーは自分の投稿のみ削除可能
CREATE POLICY "Users can delete their own training examples" ON public.training_examples
    FOR DELETE USING (auth.uid() = added_by);

-- ========================================
-- 5. training_examples_stats ビューの作成
-- ========================================
CREATE OR REPLACE VIEW public.training_examples_stats AS
SELECT 
    ui_type,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_approved = true) as approved_count,
    AVG(total_score) as avg_total_score,
    AVG(score_aesthetic) as avg_aesthetic,
    AVG(score_usability) as avg_usability,
    AVG(score_alignment) as avg_alignment,
    AVG(score_accessibility) as avg_accessibility,
    AVG(score_consistency) as avg_consistency
FROM public.training_examples
WHERE is_approved = true
GROUP BY ui_type;

-- ========================================
-- 6. Storageバケットの作成
-- ========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'training-images',
    'training-images',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 7. Storage RLS ポリシーの設定
-- ========================================

-- 全員が承認済み画像を閲覧可能
CREATE POLICY "Public Access to training images" ON storage.objects
    FOR SELECT USING (bucket_id = 'training-images');

-- 認証済みユーザーのみアップロード可能
CREATE POLICY "Authenticated users can upload training images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'training-images' AND 
        auth.role() = 'authenticated'
    );

-- ユーザーは自分がアップロードした画像のみ更新可能
CREATE POLICY "Users can update their own training images" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'training-images' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- ユーザーは自分がアップロードした画像のみ削除可能
CREATE POLICY "Users can delete their own training images" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'training-images' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- ========================================
-- 8. 管理者用のポリシー追加（必要に応じて）
-- ========================================

-- 管理者は全ての投稿を閲覧・更新可能
-- 注意: 管理者ユーザーを識別するカラムやテーブルが必要
-- 例: auth.users テーブルに role カラムがある場合

-- CREATE POLICY "Admins can view all training examples" ON public.training_examples
--     FOR SELECT USING (
--         EXISTS (
--             SELECT 1 FROM auth.users 
--             WHERE id = auth.uid() 
--             AND raw_user_meta_data->>'role' = 'admin'
--         )
--     );

-- CREATE POLICY "Admins can update all training examples" ON public.training_examples
--     FOR UPDATE USING (
--         EXISTS (
--             SELECT 1 FROM auth.users 
--             WHERE id = auth.uid() 
--             AND raw_user_meta_data->>'role' = 'admin'
--         )
--     );

-- ========================================
-- 9. データベースセットアップ確認クエリ
-- ========================================

-- テーブル存在確認
SELECT 
    schemaname, 
    tablename, 
    tableowner, 
    hasindexes, 
    hasrules, 
    hastriggers
FROM pg_tables 
WHERE tablename = 'training_examples';

-- カラム構造確認
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'training_examples' 
ORDER BY ordinal_position;

-- インデックス確認
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'training_examples';

-- RLSポリシー確認
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'training_examples';

-- Storageバケット確認
SELECT 
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'training-images';

-- Storage RLSポリシー確認
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects';

-- ========================================
-- 10. テスト用のサンプルデータ（オプション）
-- ========================================

-- 注意: 実際のユーザーIDに置き換えてください
-- INSERT INTO public.training_examples (
--     added_by,
--     image_url,
--     ui_type,
--     structure_note,
--     review_text,
--     tags,
--     is_approved,
--     score_aesthetic,
--     score_usability,
--     score_alignment,
--     score_accessibility,
--     score_consistency
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000000', -- 実際のユーザーIDに置き換え
--     'https://example.com/test-image.jpg',
--     'ログイン画面',
--     'シンプルで使いやすいログイン画面',
--     'とても良いデザインです',
--     ARRAY['login', 'simple', 'clean'],
--     true,
--     8.5,
--     9.0,
--     8.0,
--     7.5,
--     8.5
-- );

-- ========================================
-- セットアップ完了
-- ========================================
-- 1. 上記のSQLを順番に実行してください
-- 2. エラーがないことを確認してください
-- 3. 確認クエリを実行してセットアップが正しく完了したことを確認してください
-- 4. アプリケーションから接続テストを行ってください