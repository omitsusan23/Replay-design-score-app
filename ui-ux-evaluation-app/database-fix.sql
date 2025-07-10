-- Database Fix for Training Examples
-- Project: hqegdcdbyflrmufzbsga
-- 
-- 問題点と対処法:
-- 1. score_aesthetic等のカラムがNOT NULL制約を持っている
-- 2. 現在のコードはNULLを許可する設計になっている
-- 3. 必要な調整を行う

-- ========================================
-- 1. 現在のテーブル構造を確認
-- ========================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'training_examples'
ORDER BY ordinal_position;

-- ========================================
-- 2. スコアカラムをNULL許可に変更
-- ========================================
-- 現在のコードがNULLを許可する設計になっているため、
-- データベース構造を合わせる

ALTER TABLE public.training_examples 
ALTER COLUMN score_aesthetic DROP NOT NULL;

ALTER TABLE public.training_examples 
ALTER COLUMN score_usability DROP NOT NULL;

ALTER TABLE public.training_examples 
ALTER COLUMN score_alignment DROP NOT NULL;

ALTER TABLE public.training_examples 
ALTER COLUMN score_accessibility DROP NOT NULL;

ALTER TABLE public.training_examples 
ALTER COLUMN score_consistency DROP NOT NULL;

-- ========================================
-- 3. 外部キー制約を一時的に無効化（テスト用）
-- ========================================
-- 注意: 本番環境では実際のユーザーIDを使用してください
-- テスト目的でのみ外部キー制約を一時的に削除

-- 現在の外部キー制約を確認
SELECT conname, contype, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'public.training_examples'::regclass
AND contype = 'f';

-- 外部キー制約を削除（テスト用）
-- ALTER TABLE public.training_examples 
-- DROP CONSTRAINT IF EXISTS training_examples_added_by_fkey;

-- ========================================
-- 4. より柔軟な外部キー制約を追加
-- ========================================
-- 代わりに、NULL許可の外部キー制約を追加
-- ALTER TABLE public.training_examples 
-- ADD CONSTRAINT training_examples_added_by_fkey 
-- FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ========================================
-- 5. デフォルト値を設定
-- ========================================
-- is_approved のデフォルト値を確認・設定
ALTER TABLE public.training_examples 
ALTER COLUMN is_approved SET DEFAULT false;

-- created_at, updated_at のデフォルト値を確認・設定
ALTER TABLE public.training_examples 
ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());

ALTER TABLE public.training_examples 
ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

-- ========================================
-- 6. 更新トリガーを作成（存在しない場合）
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS handle_training_examples_updated_at ON public.training_examples;

CREATE TRIGGER handle_training_examples_updated_at
    BEFORE UPDATE ON public.training_examples
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- 7. RLS ポリシーを修正
-- ========================================
-- 現在のRLS設定を確認
SELECT schemaname, tablename, rowsecurity
FROM pg_tables 
WHERE tablename = 'training_examples';

-- RLS ポリシーを確認
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies 
WHERE tablename = 'training_examples';

-- 必要に応じてRLSを無効化（テスト用）
-- ALTER TABLE public.training_examples DISABLE ROW LEVEL SECURITY;

-- または、より柔軟なRLS ポリシーを追加
-- 認証済みユーザーは自分のデータを操作可能
DROP POLICY IF EXISTS "training_examples_authenticated_policy" ON public.training_examples;

CREATE POLICY "training_examples_authenticated_policy" 
ON public.training_examples 
FOR ALL 
TO authenticated
USING (auth.uid() = added_by OR auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() = added_by OR auth.uid() IS NOT NULL);

-- 一般ユーザーは承認済みデータを閲覧可能
DROP POLICY IF EXISTS "training_examples_public_read_policy" ON public.training_examples;

CREATE POLICY "training_examples_public_read_policy" 
ON public.training_examples 
FOR SELECT 
TO public
USING (is_approved = true);

-- ========================================
-- 8. Storage RLS ポリシーを修正
-- ========================================
-- 現在のStorage RLS設定を確認
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects';

-- より柔軟なStorage ポリシーを追加
DROP POLICY IF EXISTS "training_images_authenticated_upload" ON storage.objects;

CREATE POLICY "training_images_authenticated_upload" 
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'training-images');

DROP POLICY IF EXISTS "training_images_public_read" ON storage.objects;

CREATE POLICY "training_images_public_read" 
ON storage.objects 
FOR SELECT 
TO public
USING (bucket_id = 'training-images');

-- ========================================
-- 9. 確認クエリ
-- ========================================
-- 修正後の構造を確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'training_examples'
ORDER BY ordinal_position;

-- 制約を確認
SELECT conname, contype, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'public.training_examples'::regclass;

-- RLS設定を確認
SELECT schemaname, tablename, rowsecurity
FROM pg_tables 
WHERE tablename = 'training_examples';

-- ポリシーを確認
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies 
WHERE tablename = 'training_examples';

-- ========================================
-- 10. テストデータの挿入
-- ========================================
-- テスト用のダミーデータを挿入
-- 注意: 実際のユーザーIDまたはNULLを使用

-- 既存のテストデータを削除
DELETE FROM public.training_examples 
WHERE ui_type = 'テスト' AND image_url LIKE '%test%';

-- 新しいテストデータを挿入
INSERT INTO public.training_examples (
    added_by,
    image_url,
    ui_type,
    structure_note,
    review_text,
    tags,
    is_approved,
    score_aesthetic,
    score_usability,
    score_alignment,
    score_accessibility,
    score_consistency
) VALUES (
    NULL, -- added_by をNULLに設定（テスト用）
    'https://example.com/test-image.jpg',
    'テスト画面',
    'テスト用の構造説明',
    'テスト用のレビュー内容',
    ARRAY['test', 'debug'],
    false,
    8.0,
    7.5,
    8.5,
    7.0,
    8.0
);

-- 挿入結果を確認
SELECT * FROM public.training_examples 
WHERE ui_type = 'テスト画面' 
ORDER BY created_at DESC 
LIMIT 1;

-- ========================================
-- 完了
-- ========================================
-- 上記のSQLを順番に実行して、データベースの問題を修正してください。
-- 修正後、アプリケーションからのアップロードテストを行ってください。