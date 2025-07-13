-- ========================================
-- Supabase Studio で実行するRAGテーブル作成SQL
-- ========================================

-- 1. 必要な拡張機能を有効化
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 2. 既存テーブルを削除（存在する場合）
DROP TABLE IF EXISTS ui_learning_evaluations CASCADE;
DROP TABLE IF EXISTS rag_documents CASCADE;
DROP TABLE IF EXISTS evaluation_history CASCADE;

-- 3. RAGドキュメントメインテーブル作成（text-embedding-3-large 3072次元対応）
CREATE TABLE rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本情報
  title text NOT NULL,
  ui_type text,
  description text,
  
  -- コピペ関連カラム
  copied_content text,           -- コピペされた元テキスト/HTMLコード
  paste_context jsonb,           -- 貼り付け先のコンテキスト情報
  copy_metadata jsonb,           -- コピー元の詳細（URL、タイムスタンプ等）
  
  -- 構造化データ
  structure jsonb,               -- UIの構造情報
  keywords text[],               -- 検索用タグ
  
  -- Claude評価結果
  claude_evaluation jsonb,       -- Claude APIの評価結果（完全な形）
  evaluation_score numeric(3,2), -- 0.00-1.00のスコア
  improvement_notes text[],      -- 改善提案の配列
  
  -- OpenAI text-embedding-3-large ベクトル（3072次元）
  embedding vector(3072),        -- メイン埋め込み（タイトル+説明+特徴）
  content_embedding vector(3072), -- コンテンツ埋め込み（コード/詳細内容）
  title_embedding vector(3072),   -- タイトル埋め込み（高速検索用）
  
  -- メタデータ
  source_url text,               -- 元画像やFigmaのURL
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
  app_name text NOT NULL,              -- アプリ名（実際のアプリまたはプロジェクト名）
  app_category text NOT NULL,          -- music, video, productivity等
  
  -- 1. デザインシステム評価
  design_system jsonb DEFAULT '{
    "color_scheme": {
      "primary_colors": [],
      "secondary_colors": [],
      "semantic_colors": {},
      "contrast_ratio": null,
      "dark_mode_support": false
    },
    "typography": {
      "font_families": [],
      "font_scales": {},
      "line_heights": {},
      "readability_score": null
    },
    "spacing": {
      "base_unit": null,
      "scale_system": [],
      "consistency_score": null
    },
    "components": {
      "atomic_level": null,
      "reusability_score": null,
      "naming_convention": null
    }
  }',
  
  -- 2. UXパターン評価
  ux_patterns jsonb DEFAULT '{
    "navigation": {
      "pattern_type": null,
      "hierarchy_depth": null,
      "consistency": null,
      "mobile_adaptation": null
    },
    "interaction": {
      "gesture_support": [],
      "feedback_types": [],
      "animation_usage": null,
      "response_time": null
    },
    "information_architecture": {
      "structure_type": null,
      "content_organization": null,
      "search_capability": null,
      "filtering_options": []
    }
  }',
  
  -- 3. アクセシビリティ評価
  accessibility jsonb DEFAULT '{
    "wcag_compliance": {
      "level": null,
      "violations": [],
      "passes": []
    },
    "semantic_html": {
      "usage_score": null,
      "aria_labels": null,
      "heading_structure": null
    },
    "keyboard_navigation": {
      "fully_supported": false,
      "tab_order": null,
      "shortcuts": []
    }
  }',
  
  -- 総合評価
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
  field_path text NOT NULL,           -- 'design_system.color_scheme.primary_colors'
  old_value jsonb,
  new_value jsonb,
  change_reason text,
  changed_by text DEFAULT 'claude',
  changed_at timestamptz DEFAULT now()
);

-- 6. 更新時刻自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_rag_documents_updated_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 7. PGroongaインデックス作成（日本語全文検索）
CREATE INDEX pgroonga_title_index ON rag_documents USING pgroonga (title);
CREATE INDEX pgroonga_description_index ON rag_documents USING pgroonga (description);
CREATE INDEX pgroonga_copied_content_index ON rag_documents USING pgroonga (copied_content);
CREATE INDEX pgroonga_keywords_index ON rag_documents USING pgroonga (keywords);

-- 複合全文検索インデックス
CREATE INDEX pgroonga_all_text_index ON rag_documents USING pgroonga (
  (title || ' ' || COALESCE(description, '') || ' ' || COALESCE(copied_content, '') || ' ' || array_to_string(keywords, ' '))
);

-- 8. pgvectorインデックス作成（ベクトル検索の高速化）
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

-- 9. 検索用ビュー作成
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

-- 10. ハイブリッド検索関数
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
      (title || ' ' || COALESCE(description, '') || ' ' || COALESCE(copied_content, '') || ' ' || array_to_string(keywords, ' ')) &@~ search_query
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

-- 11. セマンティック検索専用関数
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

-- 12. 統計情報表示
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

-- 完了メッセージ
SELECT 'RAGテーブル作成完了！次にgenerate-embeddings.jsを実行してデータを投入してください。' as status;