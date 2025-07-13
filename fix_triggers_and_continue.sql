-- ========================================
-- 既存トリガーエラー修正と残りの処理実行SQL
-- ========================================

-- 1. 既存のトリガーと関数を削除
DROP TRIGGER IF EXISTS update_search_text_trigger ON rag_documents;
DROP TRIGGER IF EXISTS set_rag_documents_updated_at ON rag_documents;
DROP FUNCTION IF EXISTS update_search_text();
DROP FUNCTION IF EXISTS update_updated_at();

-- 2. 関数を再作成
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

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. トリガーを再作成
CREATE TRIGGER update_search_text_trigger
  BEFORE INSERT OR UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_search_text();

CREATE TRIGGER set_rag_documents_updated_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. 既存のインデックスをチェック・削除
DROP INDEX IF EXISTS pgroonga_title_idx;
DROP INDEX IF EXISTS pgroonga_description_idx;
DROP INDEX IF EXISTS pgroonga_content_idx;
DROP INDEX IF EXISTS pgroonga_search_text_idx;
DROP INDEX IF EXISTS embedding_ivfflat_idx;
DROP INDEX IF EXISTS content_embedding_ivfflat_idx;
DROP INDEX IF EXISTS title_embedding_ivfflat_idx;

-- 5. PGroongaインデックス作成（修正版・エラー対策済み）
-- 個別カラムのシンプルなインデックス
CREATE INDEX pgroonga_title_idx ON rag_documents USING pgroonga (title);
CREATE INDEX pgroonga_description_idx ON rag_documents USING pgroonga (description);
CREATE INDEX pgroonga_content_idx ON rag_documents USING pgroonga (copied_content);

-- 統合検索用インデックス
CREATE INDEX pgroonga_search_text_idx ON rag_documents USING pgroonga (search_text);

-- 6. pgvectorインデックス作成（ベクトル検索の高速化）
-- IVFFlatインデックス（コサイン距離）
CREATE INDEX embedding_ivfflat_idx ON rag_documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX content_embedding_ivfflat_idx ON rag_documents 
USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX title_embedding_ivfflat_idx ON rag_documents 
USING ivfflat (title_embedding vector_cosine_ops)
WITH (lists = 100);

-- 7. 既存のビューと関数を削除してから再作成
DROP VIEW IF EXISTS ui_patterns_overview;
DROP FUNCTION IF EXISTS hybrid_search_ui_components(text, vector, jsonb, integer);
DROP FUNCTION IF EXISTS semantic_search_similar_ui(uuid, integer);
DROP FUNCTION IF EXISTS simple_text_search(text, integer);

-- 8. 検索用ビュー作成
CREATE OR REPLACE VIEW ui_patterns_overview AS
SELECT 
  d.id,
  d.title,
  d.ui_type,
  d.description,
  d.evaluation_score,
  d.keywords,
  d.source_url,
  d.is_approved,
  d.embedding_model,
  e.app_name,
  e.app_category,
  e.learning_priority,
  e.overall_score,
  e.implementation_difficulty,
  LENGTH(d.copied_content) as content_length,
  d.created_at,
  d.updated_at
FROM rag_documents d
LEFT JOIN ui_learning_evaluations e ON d.id = e.document_id
ORDER BY d.evaluation_score DESC, d.created_at DESC;

-- 9. 修正済みハイブリッド検索関数
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

-- 10. セマンティック検索専用関数
CREATE OR REPLACE FUNCTION semantic_search_similar_ui(
  reference_id uuid,
  limit_count integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  similarity_score float,
  ui_type text,
  app_name text
) AS $$
DECLARE
  ref_embedding vector(3072);
BEGIN
  -- 参照ドキュメントの埋め込み取得
  SELECT embedding INTO ref_embedding
  FROM rag_documents
  WHERE id = reference_id;
  
  IF ref_embedding IS NULL THEN
    RAISE EXCEPTION '参照ドキュメントが見つかりません: %', reference_id;
  END IF;
  
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    1 - (d.embedding <=> ref_embedding) AS similarity_score,
    d.ui_type,
    e.app_name
  FROM rag_documents d
  LEFT JOIN ui_learning_evaluations e ON d.id = e.document_id
  WHERE 
    d.id != reference_id
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> ref_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 11. シンプルな全文検索関数（テスト用）
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

-- 12. 既存レコードのsearch_textを更新（空の場合のみ）
UPDATE rag_documents 
SET search_text = COALESCE(title, '') || ' ' || 
                  COALESCE(description, '') || ' ' || 
                  COALESCE(copied_content, '') || ' ' ||
                  COALESCE(array_to_string(keywords, ' '), '')
WHERE search_text IS NULL OR search_text = '';

-- 13. 統計情報表示
SELECT 
  'rag_documents' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
  AVG(evaluation_score) as avg_evaluation_score
FROM rag_documents
UNION ALL
SELECT 
  'ui_learning_evaluations' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN overall_score IS NOT NULL THEN 1 END) as with_scores,
  AVG(overall_score) as avg_overall_score
FROM ui_learning_evaluations;

-- 14. テスト検索（データがあれば）
SELECT '=== 基本検索テスト ===' as test_section;

-- インデックス確認
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'rag_documents' 
ORDER BY indexname;

-- トリガー確認
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'rag_documents';

-- 完了メッセージ
SELECT 'RAG設定完了！トリガーエラー修正済み。次にinsert_sample_data.jsを実行してデータを投入してください。' as status;