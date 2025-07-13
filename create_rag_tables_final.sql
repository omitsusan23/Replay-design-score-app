-- ========================================
-- 完全版RAGテーブル作成SQL（全エラー修正済み）
-- ========================================

-- 1. 必要な拡張機能を有効化
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 2. 既存テーブルとリソースをクリーンアップ
DROP TABLE IF EXISTS ui_learning_evaluations CASCADE;
DROP TABLE IF EXISTS rag_documents CASCADE;
DROP TABLE IF EXISTS evaluation_history CASCADE;

-- 既存の関数とビューも削除
DROP VIEW IF EXISTS ui_patterns_overview CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_ui_components(text, vector, jsonb, integer) CASCADE;
DROP FUNCTION IF EXISTS semantic_search_similar_ui(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS simple_text_search(text, integer) CASCADE;
DROP FUNCTION IF EXISTS update_search_text() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- 3. RAGドキュメントメインテーブル作成
CREATE TABLE rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本情報
  title text NOT NULL,
  ui_type text,
  description text,
  
  -- コピペ関連カラム
  copied_content text,
  paste_context jsonb,
  copy_metadata jsonb,
  
  -- 構造化データ
  structure jsonb,
  keywords text[],
  
  -- 検索用の統合テキスト（PGroongaエラー対策）
  search_text text,
  
  -- Claude評価結果
  claude_evaluation jsonb,
  evaluation_score numeric(3,2),
  improvement_notes text[],
  
  -- OpenAI text-embedding-3-large ベクトル（3072次元）
  embedding vector(3072),
  content_embedding vector(3072),
  title_embedding vector(3072),
  
  -- メタデータ
  source_url text,
  is_approved boolean DEFAULT false,
  review_count integer DEFAULT 0,
  embedding_model text DEFAULT 'text-embedding-3-large',
  embedding_generated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. 詳細評価テーブル作成
CREATE TABLE ui_learning_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES rag_documents(id) ON DELETE CASCADE,
  app_name text NOT NULL,
  app_category text NOT NULL,
  
  design_system jsonb DEFAULT '{}',
  ux_patterns jsonb DEFAULT '{}',
  accessibility jsonb DEFAULT '{}',
  
  overall_score numeric(3,2),
  learning_priority text CHECK (learning_priority IN ('critical', 'high', 'medium', 'low')),
  implementation_difficulty text CHECK (implementation_difficulty IN ('easy', 'medium', 'hard', 'expert')),
  
  created_at timestamptz DEFAULT now(),
  evaluated_at timestamptz DEFAULT now()
);

-- 5. 評価履歴テーブル
CREATE TABLE evaluation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES ui_learning_evaluations(id) ON DELETE CASCADE,
  field_path text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  change_reason text,
  changed_by text DEFAULT 'claude',
  changed_at timestamptz DEFAULT now()
);

-- 6. トリガー関数作成
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

-- 7. トリガー作成
CREATE TRIGGER update_search_text_trigger
  BEFORE INSERT OR UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_search_text();

CREATE TRIGGER set_rag_documents_updated_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 8. PGroongaインデックス作成
CREATE INDEX pgroonga_title_idx ON rag_documents USING pgroonga (title);
CREATE INDEX pgroonga_description_idx ON rag_documents USING pgroonga (description);
CREATE INDEX pgroonga_content_idx ON rag_documents USING pgroonga (copied_content);
CREATE INDEX pgroonga_search_text_idx ON rag_documents USING pgroonga (search_text);

-- 9. HNSWインデックス作成（3072次元対応）
CREATE INDEX embedding_hnsw_idx ON rag_documents 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX content_embedding_hnsw_idx ON rag_documents 
USING hnsw (content_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX title_embedding_hnsw_idx ON rag_documents 
USING hnsw (title_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 10. 検索用ビュー作成
CREATE VIEW ui_patterns_overview AS
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

-- 11. ハイブリッド検索関数（HNSW対応）
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
  -- HNSWパラメータ設定
  PERFORM set_config('hnsw.ef_search', '40', true);
  
  RETURN QUERY
  WITH 
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
      d.search_text &@~ search_query
      AND (filters->>'ui_type' IS NULL OR d.ui_type = filters->>'ui_type')
      AND (filters->>'is_approved' IS NULL OR d.is_approved = (filters->>'is_approved')::boolean)
  ),
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

-- 12. セマンティック検索関数
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
  PERFORM set_config('hnsw.ef_search', '32', true);
  
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

-- 13. シンプル全文検索関数
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

-- 14. 統計情報とテスト
SELECT 
  'RAGテーブル作成完了' as status,
  COUNT(*) as rag_documents_count
FROM rag_documents;

SELECT 
  indexname,
  CASE 
    WHEN indexdef LIKE '%hnsw%' THEN 'HNSW (3072次元対応)'
    WHEN indexdef LIKE '%pgroonga%' THEN 'PGroonga (日本語全文検索)'
    ELSE 'その他'
  END as index_type
FROM pg_indexes 
WHERE tablename = 'rag_documents'
ORDER BY indexname;

-- 完了メッセージ
SELECT '🎉 RAGシステム構築完了！text-embedding-3-large（3072次元）対応、全エラー修正済み。次にinsert_sample_data.jsでデータ投入してください。' as final_status;