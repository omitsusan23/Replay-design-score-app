-- ========================================
-- pgvector最小次元対応SQL（384次元）
-- ========================================

-- 1. 既存テーブルとリソースをクリーンアップ
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

-- 2. 必要な拡張機能を有効化
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 3. RAGドキュメントテーブル作成（384次元 - all-MiniLM-L6-v2対応）
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
  
  -- 検索用の統合テキスト
  search_text text,
  
  -- Claude評価結果
  claude_evaluation jsonb,
  evaluation_score numeric(3,2),
  improvement_notes text[],
  
  -- 小次元埋め込み（384次元 - Sentence Transformers対応）
  embedding vector(384),              -- メイン埋め込み
  content_embedding vector(384),      -- コンテンツ埋め込み
  title_embedding vector(384),        -- タイトル埋め込み
  
  -- 元テキスト保存（将来の高次元移行用）
  embedding_text text,                 -- 埋め込み元テキスト保存
  content_text text,                   -- コンテンツテキスト保存
  title_text text,                     -- タイトルテキスト保存
  
  -- メタデータ
  source_url text,
  is_approved boolean DEFAULT false,
  review_count integer DEFAULT 0,
  embedding_model text DEFAULT 'all-MiniLM-L6-v2',  -- 軽量モデル
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
  
  -- 埋め込み用テキストも同時に保存
  NEW.embedding_text := NEW.search_text;
  NEW.content_text := COALESCE(NEW.copied_content, '');
  NEW.title_text := COALESCE(NEW.title, '');
  
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

-- 9. pgvectorインデックス作成（384次元）
-- まずはIVFFlatで試行
CREATE INDEX embedding_ivfflat_idx ON rag_documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);

CREATE INDEX content_embedding_ivfflat_idx ON rag_documents 
USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 10);

CREATE INDEX title_embedding_ivfflat_idx ON rag_documents 
USING ivfflat (title_embedding vector_cosine_ops)
WITH (lists = 10);

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

-- 11. ハイブリッド検索関数（384次元対応）
CREATE OR REPLACE FUNCTION hybrid_search_ui_components(
  search_query text,
  search_embedding vector(384),
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
        (0.7 * COALESCE(t.text_score, 0) + 0.3 * COALESCE(v.vector_score, 0))
      ELSE
        (0.4 * COALESCE(t.text_score, 0) + 0.6 * COALESCE(v.vector_score, 0))
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

-- 12. セマンティック検索関数（384次元対応）
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
  ref_embedding vector(384);
BEGIN
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

-- 14. ダミーベクトル生成関数（テスト用）
CREATE OR REPLACE FUNCTION generate_dummy_vector_384()
RETURNS vector(384) AS $$
DECLARE
  result float8[];
  i int;
BEGIN
  result := array[]::float8[];
  FOR i IN 1..384 LOOP
    result := result || (random() - 0.5)::float8;
  END LOOP;
  RETURN result::vector(384);
END;
$$ LANGUAGE plpgsql;

-- 15. テストデータ投入（ダミーベクトルで）
INSERT INTO rag_documents (
  title,
  ui_type,
  description,
  copied_content,
  keywords,
  embedding,
  content_embedding,
  title_embedding,
  embedding_model,
  evaluation_score,
  is_approved
) VALUES 
(
  'Spotify - プレイヤーバー（テスト）',
  'player',
  'Spotifyの音楽プレイヤーバー。再生コントロールと進行状況表示',
  '<div class="player-bar">音楽プレイヤーのHTML構造</div>',
  ARRAY['音楽', 'プレイヤー', 'Spotify', 'メディア'],
  generate_dummy_vector_384(),
  generate_dummy_vector_384(),
  generate_dummy_vector_384(),
  'dummy-384d',
  0.85,
  true
),
(
  'Netflix - カルーセル（テスト）',
  'carousel',
  'Netflixのコンテンツカルーセル。水平スクロール対応',
  '<div class="carousel">コンテンツカルーセルのHTML構造</div>',
  ARRAY['動画', 'カルーセル', 'Netflix', 'スクロール'],
  generate_dummy_vector_384(),
  generate_dummy_vector_384(),
  generate_dummy_vector_384(),
  'dummy-384d',
  0.78,
  false
);

-- 16. 対応する評価データ投入
INSERT INTO ui_learning_evaluations (
  document_id,
  app_name,
  app_category,
  overall_score,
  learning_priority,
  implementation_difficulty
)
SELECT 
  id,
  CASE 
    WHEN title LIKE '%Spotify%' THEN 'Spotify'
    WHEN title LIKE '%Netflix%' THEN 'Netflix'
  END,
  CASE 
    WHEN title LIKE '%Spotify%' THEN 'music'
    WHEN title LIKE '%Netflix%' THEN 'video'
  END,
  evaluation_score,
  'high',
  'medium'
FROM rag_documents;

-- 17. 機能テスト
SELECT '=== 基本検索テスト ===' as test_section;
SELECT * FROM simple_text_search('プレイヤー', 3);

SELECT '=== ベクトル検索テスト ===' as test_section;
SELECT 
  title,
  ui_type,
  1 - (embedding <=> generate_dummy_vector_384()) as similarity
FROM rag_documents 
WHERE embedding IS NOT NULL
ORDER BY embedding <=> generate_dummy_vector_384()
LIMIT 3;

-- 18. インデックス確認
SELECT 
  indexname,
  CASE 
    WHEN indexdef LIKE '%ivfflat%' THEN 'IVFFlat (384次元)'
    WHEN indexdef LIKE '%pgroonga%' THEN 'PGroonga (日本語全文検索)'
    ELSE 'その他'
  END as index_type
FROM pg_indexes 
WHERE tablename = 'rag_documents'
ORDER BY indexname;

-- 19. 埋め込みモデル情報
SELECT 
  '🎯 次元数対応状況' as info_type,
  '384次元（IVFFlat対応）' as current_setting,
  'Sentence Transformersなど軽量モデル推奨' as recommendation,
  'PGroonga全文検索がメイン、ベクトル検索は補完' as strategy;

-- 完了メッセージ
SELECT '✅ RAGシステム構築完了！384次元対応、pgvector制限回避済み。テストデータで動作確認できます。' as final_status;