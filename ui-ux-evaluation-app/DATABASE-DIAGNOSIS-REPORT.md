# Supabase Database Diagnosis Report
## Project: hqegdcdbyflrmufzbsga

### 🔍 **診断結果**

#### ✅ **正常に動作している部分**
1. **Supabase接続**: 正常
2. **training_examplesテーブル**: 存在
3. **training-imagesバケット**: 存在

#### ❌ **問題が発見された部分**

### 1. **スコアカラムのNOT NULL制約エラー**
- **問題**: `score_aesthetic`, `score_usability`, `score_alignment`, `score_accessibility`, `score_consistency`カラムがNOT NULL制約を持っている
- **現状**: アプリケーションコードはこれらのフィールドにNULLを許可する設計
- **エラー**: `null value in column "score_aesthetic" violates not-null constraint`

### 2. **外部キー制約エラー**
- **問題**: `added_by`フィールドが`auth.users`テーブルの実際のユーザーIDを参照する必要がある
- **現状**: テスト用のダミーUUID `00000000-0000-0000-0000-000000000000`を使用
- **エラー**: `insert or update on table "training_examples" violates foreign key constraint "training_examples_added_by_fkey"`

### 3. **RLS (Row Level Security) 設定**
- **問題**: RLS ポリシーの設定が不完全または厳しすぎる可能性
- **現状**: ポリシーの詳細確認が必要

---

## 🛠️ **修正手順**

### ステップ1: データベース構造の修正
Supabaseのダッシュボード → SQL Editor で以下を実行：

```sql
-- スコアカラムをNULL許可に変更
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
```

### ステップ2: RLS ポリシーの修正
```sql
-- 認証済みユーザー用のポリシー
DROP POLICY IF EXISTS "training_examples_authenticated_policy" ON public.training_examples;

CREATE POLICY "training_examples_authenticated_policy" 
ON public.training_examples 
FOR ALL 
TO authenticated
USING (auth.uid() = added_by OR auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() = added_by OR auth.uid() IS NOT NULL);
```

### ステップ3: 外部キー制約の対処
以下のいずれかを選択：

#### オプション A: 外部キー制約を柔軟にする
```sql
-- 現在の外部キー制約を削除
ALTER TABLE public.training_examples 
DROP CONSTRAINT IF EXISTS training_examples_added_by_fkey;

-- NULL許可の外部キー制約を追加
ALTER TABLE public.training_examples 
ADD CONSTRAINT training_examples_added_by_fkey 
FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

#### オプション B: 実際のユーザーIDを使用（推奨）
- アプリケーションで適切な認証を行い、実際のユーザーIDを使用

### ステップ4: テストの実行
```bash
npm run test:db
```

---

## 📋 **現在のテーブル構造（推測）**

```sql
CREATE TABLE public.training_examples (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    added_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT,
    ui_type TEXT NOT NULL,
    structure_note TEXT NOT NULL,
    review_text TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_approved BOOLEAN DEFAULT false,
    figma_url TEXT,
    score_aesthetic NUMERIC(3,1) NOT NULL,  -- ❌ 問題: NOT NULL制約
    score_usability NUMERIC(3,1) NOT NULL,  -- ❌ 問題: NOT NULL制約
    score_alignment NUMERIC(3,1) NOT NULL,  -- ❌ 問題: NOT NULL制約
    score_accessibility NUMERIC(3,1) NOT NULL,  -- ❌ 問題: NOT NULL制約
    score_consistency NUMERIC(3,1) NOT NULL,  -- ❌ 問題: NOT NULL制約
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

## 📋 **修正後のテーブル構造（目標）**

```sql
CREATE TABLE public.training_examples (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    added_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT,
    ui_type TEXT NOT NULL,
    structure_note TEXT NOT NULL,
    review_text TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_approved BOOLEAN DEFAULT false,
    figma_url TEXT,
    score_aesthetic NUMERIC(3,1),  -- ✅ NULL許可
    score_usability NUMERIC(3,1),  -- ✅ NULL許可
    score_alignment NUMERIC(3,1),  -- ✅ NULL許可
    score_accessibility NUMERIC(3,1),  -- ✅ NULL許可
    score_consistency NUMERIC(3,1),  -- ✅ NULL許可
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
```

---

## 🔄 **修正後のテスト手順**

1. **database-fix.sqlの実行**
   ```bash
   # Supabase SQL Editorで database-fix.sql の内容を実行
   ```

2. **接続テスト**
   ```bash
   npm run test:db
   ```

3. **アップロードテスト**
   ```bash
   npm run debug:upload
   ```

4. **実際のアプリケーションテスト**
   - 認証済みユーザーで画像アップロードを試行
   - エラーログを確認

---

## 📞 **サポート**

修正後も問題が発生する場合は、以下の情報を提供してください：

1. **エラーメッセージ**の詳細
2. **テストスクリプト**の結果
3. **Supabaseダッシュボード**のログ
4. **ブラウザのコンソール**ログ

---

## 📝 **修正内容の要約**

| 項目 | 現在の状態 | 修正後 |
|------|------------|---------|
| score_aesthetic | NOT NULL | NULL許可 |
| score_usability | NOT NULL | NULL許可 |
| score_alignment | NOT NULL | NULL許可 |
| score_accessibility | NOT NULL | NULL許可 |
| score_consistency | NOT NULL | NULL許可 |
| RLS ポリシー | 厳しい制約 | 柔軟な制約 |
| 外部キー制約 | CASCADE | SET NULL |

この修正により、「データベース保存に失敗しました」エラーが解決されるはずです。