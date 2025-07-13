-- ========================================
-- PGroongaインデックスエラー修正SQL
-- ========================================

-- 1. 既存の問題のあるインデックスを削除
DROP INDEX IF EXISTS pgroonga_title_index;
DROP INDEX IF EXISTS pgroonga_description_index;
DROP INDEX IF EXISTS pgroonga_copied_content_index;
DROP INDEX IF EXISTS pgroonga_keywords_index;
DROP INDEX IF EXISTS pgroonga_all_text_index;

-- 2. PGroonga拡張の確認と再インストール
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 3. 個別カラムのPGroongaインデックス（シンプル版）
CREATE INDEX pgroonga_title_simple_idx 
ON rag_documents 
USING pgroonga (title);

CREATE INDEX pgroonga_description_simple_idx 
ON rag_documents 
USING pgroonga (description);

CREATE INDEX pgroonga_content_simple_idx 
ON rag_documents 
USING pgroonga (copied_content);

-- 4. 複合全文検索用のMATERIALIZED VIEWアプローチ
-- （関数の代わりに物理的なカラムを作成）

-- 検索用のカラムを追加
ALTER TABLE rag_documents 
ADD COLUMN IF NOT EXISTS search_text text;

-- 検索用テキストを更新する関数
CREATE OR REPLACE FUNCTION update_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := COALESCE(NEW.title, '') || ' ' || 
                     COALESCE(NEW.description, '') || ' ' || 
                     COALESCE(NEW.copied_content, '') || ' ' ||
                     COALESCE(array_to_string(NEW.keywords, ' '), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成してsearch_textを自動更新
DROP TRIGGER IF EXISTS update_search_text_trigger ON rag_documents;
CREATE TRIGGER update_search_text_trigger
  BEFORE INSERT OR UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_search_text();

-- 既存レコードのsearch_textを更新
UPDATE rag_documents 
SET search_text = COALESCE(title, '') || ' ' || 
                  COALESCE(description, '') || ' ' || 
                  COALESCE(copied_content, '') || ' ' ||
                  COALESCE(array_to_string(keywords, ' '), '')
WHERE search_text IS NULL;

-- 5. search_textカラムにPGroongaインデックスを作成
CREATE INDEX pgroonga_search_text_idx 
ON rag_documents 
USING pgroonga (search_text);

-- 6. キーワード配列用の検索関数（IMMUTABLE対応）
CREATE OR REPLACE FUNCTION keywords_to_text(keywords text[])
RETURNS text
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT array_to_string($1, ' ');
$$;

-- キーワード用インデックス
CREATE INDEX pgroonga_keywords_text_idx 
ON rag_documents 
USING pgroonga (keywords_to_text(keywords));

-- 7. 修正されたハイブリッド検索関数
CREATE OR REPLACE FUNCTION hybrid_search_ui_components(
  search_query text,
  search_embedding vector(3072),
  filters jsonb DEFAULT '{}',
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  ui_type text,
  description text,
  copied_content text,
  app_name text,
  text_score float,
  vector_score float,
  combined_score float,
  evaluation_data jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- PGroonga全文検索（修正版）
  text_search AS (
    SELECT 
      d.id,
      d.title,
      d.ui_type,
      d.description,
      d.copied_content,
      pgroonga_score(tableoid, ctid) AS text_score
    FROM rag_documents d
    WHERE 
      d.search_text &@~ search_query  -- 単一カラムで検索
      AND (filters->>'ui_type' IS NULL OR d.ui_type = filters->>'ui_type')
      AND (filters->>'is_approved' IS NULL OR d.is_approved = (filters->>'is_approved')::boolean)
  ),
  -- ベクトル類似度検索
  vector_search AS (
    SELECT 
      d.id,
      1 - (d.embedding <=> search_embedding) AS vector_score
    FROM rag_documents d
    WHERE 
      d.embedding IS NOT NULL
      AND (filters->>'min_score' IS NULL OR d.evaluation_score >= (filters->>'min_score')::numeric)
    ORDER BY d.embedding <=> search_embedding
    LIMIT limit_count * 2
  ),
  -- 評価データ結合
  evaluation_join AS (
    SELECT 
      e.document_id,
      e.app_name,
      jsonb_build_object(
        'overall_score', e.overall_score,
        'learning_priority', e.learning_priority,
        'design_system', e.design_system,
        'ux_patterns', e.ux_patterns
      ) AS evaluation_data
    FROM ui_learning_evaluations e
  )
  SELECT 
    COALESCE(t.id, v.id) AS id,
    t.title,
    t.ui_type,
    t.description,
    t.copied_content,
    ej.app_name,
    COALESCE(t.text_score, 0) AS text_score,
    COALESCE(v.vector_score, 0) AS vector_score,
    -- 動的重み付け
    CASE 
      WHEN LENGTH(search_query) > 20 THEN
        (0.6 * COALESCE(t.text_score, 0) + 0.4 * COALESCE(v.vector_score, 0))
      ELSE
        (0.3 * COALESCE(t.text_score, 0) + 0.7 * COALESCE(v.vector_score, 0))
    END AS combined_score,
    ej.evaluation_data
  FROM text_search t
  FULL OUTER JOIN vector_search v ON t.id = v.id
  LEFT JOIN evaluation_join ej ON COALESCE(t.id, v.id) = ej.document_id
  WHERE t.id IS NOT NULL OR v.id IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 8. シンプルな全文検索関数（テスト用）
CREATE OR REPLACE FUNCTION simple_text_search(search_query text, limit_count integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  title text,
  ui_type text,
  description text,
  score float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.ui_type,
    d.description,
    pgroonga_score(tableoid, ctid) AS score
  FROM rag_documents d
  WHERE d.search_text &@~ search_query
  ORDER BY score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 9. テスト用クエリ
-- 基本的な全文検索テスト
SELECT '=== 基本全文検索テスト ===' as test_section;
SELECT * FROM simple_text_search('プレイヤー', 5);

-- 個別カラム検索テスト
SELECT '=== 個別カラム検索テスト ===' as test_section;
SELECT title, ui_type FROM rag_documents WHERE title &@~ 'Spotify';
SELECT title, ui_type FROM rag_documents WHERE description &@~ 'カルーセル';

-- search_textカラムの確認
SELECT '=== search_textカラム確認 ===' as test_section;
SELECT title, LEFT(search_text, 100) as search_text_sample 
FROM rag_documents 
WHERE search_text IS NOT NULL
LIMIT 3;

-- インデックス確認
SELECT '=== インデックス確認 ===' as test_section;
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'rag_documents' 
  AND indexname LIKE '%pgroonga%';

SELECT 'PGroongaインデックス修正完了！' as status;