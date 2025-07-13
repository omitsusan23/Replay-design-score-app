-- ========================================
-- pgvectorインデックスエラー修正SQL（3072次元対応）
-- ========================================

-- 1. 既存のpgvectorインデックスを削除
DROP INDEX IF EXISTS embedding_ivfflat_idx;
DROP INDEX IF EXISTS content_embedding_ivfflat_idx;
DROP INDEX IF EXISTS title_embedding_ivfflat_idx;

-- 2. pgvector拡張の確認
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. HNSWインデックスを作成（3072次元対応）
-- HNSWはIVFFlatよりも高次元ベクトルに適している

-- メイン埋め込み用HNSWインデックス
CREATE INDEX embedding_hnsw_idx ON rag_documents 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- コンテンツ埋め込み用HNSWインデックス
CREATE INDEX content_embedding_hnsw_idx ON rag_documents 
USING hnsw (content_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- タイトル埋め込み用HNSWインデックス
CREATE INDEX title_embedding_hnsw_idx ON rag_documents 
USING hnsw (title_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 4. ベクトル検索の設定を最適化
-- HNSWの検索パラメータを設定
SET hnsw.ef_search = 40;

-- 5. 修正済みハイブリッド検索関数（HNSWインデックス対応）
CREATE OR REPLACE FUNCTION hybrid_search_ui_components_hnsw(
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
  -- HNSWインデックス用の検索パラメータを設定
  PERFORM set_config('hnsw.ef_search', '40', true);
  
  RETURN QUERY
  WITH 
  -- PGroonga全文検索
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
  -- HNSWベクトル類似度検索
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

-- 6. HNSWベクトル専用検索関数
CREATE OR REPLACE FUNCTION vector_search_hnsw(
  search_embedding vector(3072),
  limit_count integer DEFAULT 10,
  similarity_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  title text,
  ui_type text,
  similarity_score float,
  app_name text
) AS $$
BEGIN
  -- HNSWパラメータ設定
  PERFORM set_config('hnsw.ef_search', '64', true);
  
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.ui_type,
    1 - (d.embedding <=> search_embedding) AS similarity_score,
    e.app_name
  FROM rag_documents d
  LEFT JOIN ui_learning_evaluations e ON d.id = e.document_id
  WHERE 
    d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> search_embedding) >= similarity_threshold
  ORDER BY d.embedding <=> search_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 7. 修正済みセマンティック検索関数（HNSW対応）
CREATE OR REPLACE FUNCTION semantic_search_similar_ui_hnsw(
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
  -- HNSWパラメータ設定
  PERFORM set_config('hnsw.ef_search', '32', true);
  
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

-- 8. インデックス統計とパフォーマンス確認
CREATE OR REPLACE FUNCTION check_vector_index_stats()
RETURNS TABLE (
  index_name text,
  table_name text,
  index_size text,
  index_type text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.indexname::text,
    i.tablename::text,
    pg_size_pretty(pg_relation_size(i.indexname::regclass))::text,
    CASE 
      WHEN i.indexdef LIKE '%hnsw%' THEN 'HNSW'
      WHEN i.indexdef LIKE '%ivfflat%' THEN 'IVFFlat'
      WHEN i.indexdef LIKE '%pgroonga%' THEN 'PGroonga'
      ELSE 'Other'
    END::text
  FROM pg_indexes i
  WHERE i.tablename = 'rag_documents'
    AND (i.indexdef LIKE '%vector%' OR i.indexdef LIKE '%pgroonga%')
  ORDER BY i.indexname;
END;
$$ LANGUAGE plpgsql;

-- 9. ベクトル次元の確認
SELECT 
  'ベクトル次元確認' as check_type,
  COUNT(*) as total_records,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding,
  COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) as with_content_embedding,
  COUNT(CASE WHEN title_embedding IS NOT NULL THEN 1 END) as with_title_embedding
FROM rag_documents;

-- 10. インデックス確認
SELECT * FROM check_vector_index_stats();

-- 11. HNSWパラメータの説明
SELECT 
  'HNSWパラメータ説明' as info_type,
  'm=16: 各ノードの最大接続数（デフォルト16、高品質）' as parameter_1,
  'ef_construction=64: 構築時の探索候補数（デフォルト64、バランス重視）' as parameter_2,
  'ef_search=40: 検索時の探索候補数（デフォルト40、速度重視）' as parameter_3;

-- 完了メッセージ
SELECT 'pgvector HNSWインデックス作成完了！3072次元ベクトル対応済み。' as status;