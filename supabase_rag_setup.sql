-- ======================================
-- Supabase Studio で実行するRAGセットアップ
-- ======================================

-- 1. 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 2. RAGドキュメントテーブル作成（text-embedding-3-large対応）
DROP TABLE IF EXISTS ui_learning_evaluations CASCADE;
DROP TABLE IF EXISTS rag_documents CASCADE;

CREATE TABLE rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本情報
  title text NOT NULL,
  ui_type text,
  description text,
  
  -- コピペ関連
  copied_content text,
  paste_context jsonb,
  copy_metadata jsonb,
  
  -- 構造化データ
  structure jsonb,
  keywords text[],
  
  -- Claude評価
  claude_evaluation jsonb,
  evaluation_score numeric(3,2),
  improvement_notes text[],
  
  -- OpenAI text-embedding-3-large ベクトル (3072次元)
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

-- 3. 評価テーブル作成
CREATE TABLE ui_learning_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES rag_documents(id) ON DELETE CASCADE,
  app_name text NOT NULL,
  app_category text NOT NULL,
  
  -- デザインシステム評価
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
    }
  }',
  
  -- UXパターン評価
  ux_patterns jsonb DEFAULT '{
    "navigation": {
      "pattern_type": null,
      "hierarchy_depth": null,
      "consistency": null
    },
    "interaction": {
      "gesture_support": [],
      "feedback_types": [],
      "animation_usage": null
    }
  }',
  
  -- 総合評価
  overall_score numeric(3,2),
  learning_priority text CHECK (learning_priority IN ('critical', 'high', 'medium', 'low')),
  implementation_difficulty text CHECK (implementation_difficulty IN ('easy', 'medium', 'hard', 'expert')),
  
  created_at timestamptz DEFAULT now(),
  evaluated_at timestamptz DEFAULT now()
);

-- 4. PGroongaインデックス作成
CREATE INDEX pgroonga_title_index ON rag_documents USING pgroonga (title);
CREATE INDEX pgroonga_description_index ON rag_documents USING pgroonga (description);
CREATE INDEX pgroonga_copied_content_index ON rag_documents USING pgroonga (copied_content);
CREATE INDEX pgroonga_all_text_index ON rag_documents USING pgroonga (
  (title || ' ' || description || ' ' || COALESCE(copied_content, ''))
);

-- 5. pgvectorインデックス作成（テスト用の小さいベクトルで代用）
-- 注意: 実際のtext-embedding-3-largeは3072次元ですが、テスト用に3次元で作成
CREATE INDEX embedding_idx ON rag_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 6. サンプルデータ投入（有名アプリのUIパターン）
INSERT INTO rag_documents (
  title,
  ui_type,
  description,
  copied_content,
  paste_context,
  claude_evaluation,
  evaluation_score,
  improvement_notes,
  embedding,
  keywords
) VALUES 
(
  'Spotify - プレイヤーバー',
  'player',
  'Spotifyの常時表示される音楽プレイヤーバー',
  '<div class="player-bar">
    <div class="now-playing">
      <img src="album-art.jpg" alt="Album" />
      <div class="track-info">
        <span class="track-name">Song Title</span>
        <span class="artist-name">Artist Name</span>
      </div>
    </div>
    <div class="player-controls">
      <button class="shuffle"></button>
      <button class="previous"></button>
      <button class="play-pause"></button>
      <button class="next"></button>
      <button class="repeat"></button>
    </div>
  </div>',
  '{"component_type": "player_bar", "screen_name": "Global Player", "position": "bottom_fixed"}',
  '{
    "consistency_score": 0.95,
    "quality": {
      "reusability": "高",
      "maintainability": "高",
      "accessibility": "中"
    },
    "improvements": [
      "ARIAラベルの追加を推奨",
      "キーボードショートカットの実装"
    ],
    "ui_classification": {
      "primary_type": "player",
      "secondary_types": ["media_control", "navigation"]
    }
  }',
  0.95,
  ARRAY['ARIAラベルの追加を推奨', 'キーボードショートカットの実装'],
  '[0.1, 0.2, 0.3]'::vector(3072),  -- テスト用の小さいベクトル
  ARRAY['音楽', 'プレイヤー', 'メディアコントロール', 'Spotify']
),
(
  'Netflix - カルーセル',
  'carousel',
  'Netflixのコンテンツカルーセルコンポーネント',
  '<div class="content-carousel">
    <h2 class="carousel-title">Trending Now</h2>
    <div class="carousel-container">
      <button class="carousel-nav prev"></button>
      <div class="carousel-items">
        <div class="content-card">
          <img src="thumbnail.jpg" />
          <div class="content-hover">
            <button class="play-button"></button>
            <button class="add-list"></button>
          </div>
        </div>
      </div>
      <button class="carousel-nav next"></button>
    </div>
  </div>',
  '{"component_type": "carousel", "screen_name": "Home Feed", "interaction": "horizontal_scroll"}',
  '{
    "consistency_score": 0.92,
    "quality": {
      "reusability": "高",
      "maintainability": "高",
      "accessibility": "高"
    },
    "improvements": [
      "タッチジェスチャーのサポート追加",
      "無限スクロールの実装検討"
    ],
    "ui_classification": {
      "primary_type": "carousel",
      "secondary_types": ["content_grid", "navigation"]
    }
  }',
  0.92,
  ARRAY['タッチジェスチャーのサポート追加', '無限スクロールの実装検討'],
  '[0.2, 0.3, 0.4]'::vector(3072),
  ARRAY['動画', 'カルーセル', 'コンテンツ表示', 'Netflix']
),
(
  'Notion - サイドバーナビゲーション',
  'navigation',
  'Notionの階層型サイドバーナビゲーション',
  '<nav class="sidebar">
    <div class="workspace-switcher">
      <button class="workspace-button">
        <span>My Workspace</span>
      </button>
    </div>
    <div class="nav-section">
      <div class="nav-item">
        <button class="expand-toggle"></button>
        <span class="page-icon">📄</span>
        <span class="page-title">Getting Started</span>
      </div>
      <div class="nav-children">
        <div class="nav-item nested">
          <span class="page-icon">📝</span>
          <span class="page-title">Quick Notes</span>
        </div>
      </div>
    </div>
  </nav>',
  '{"component_type": "sidebar", "screen_name": "Main Layout", "features": ["collapsible", "nested"]}',
  '{
    "consistency_score": 0.88,
    "quality": {
      "reusability": "高",
      "maintainability": "中",
      "accessibility": "中"
    },
    "improvements": [
      "ドラッグ&ドロップの実装",
      "検索機能の追加",
      "キーボードナビゲーション強化"
    ],
    "ui_classification": {
      "primary_type": "navigation",
      "secondary_types": ["sidebar", "tree_view"]
    }
  }',
  0.88,
  ARRAY['ドラッグ&ドロップの実装', '検索機能の追加', 'キーボードナビゲーション強化'],
  '[0.3, 0.4, 0.5]'::vector(3072),
  ARRAY['生産性', 'ナビゲーション', 'サイドバー', 'Notion']
);

-- 7. 評価データの投入
INSERT INTO ui_learning_evaluations (
  document_id,
  app_name,
  app_category,
  design_system,
  ux_patterns,
  overall_score,
  learning_priority,
  implementation_difficulty
)
SELECT 
  id,
  CASE 
    WHEN title LIKE '%Spotify%' THEN 'Spotify'
    WHEN title LIKE '%Netflix%' THEN 'Netflix'
    WHEN title LIKE '%Notion%' THEN 'Notion'
  END,
  CASE 
    WHEN title LIKE '%Spotify%' THEN 'music'
    WHEN title LIKE '%Netflix%' THEN 'video'
    WHEN title LIKE '%Notion%' THEN 'productivity'
  END,
  '{
    "color_scheme": {
      "primary_colors": ["#1DB954", "#191414"],
      "dark_mode_support": true
    },
    "typography": {
      "font_families": ["Circular", "Helvetica"],
      "readability_score": 0.85
    }
  }'::jsonb,
  '{
    "navigation": {
      "pattern_type": "fixed_bottom",
      "consistency": 0.9
    },
    "interaction": {
      "gesture_support": ["tap", "swipe"],
      "feedback_types": ["visual", "haptic"]
    }
  }'::jsonb,
  evaluation_score,
  'high',
  'medium'
FROM rag_documents;

-- 8. データ確認用のビュー作成
CREATE OR REPLACE VIEW ui_patterns_overview AS
SELECT 
  d.id,
  d.title,
  d.ui_type,
  d.description,
  d.evaluation_score,
  d.keywords,
  e.app_name,
  e.app_category,
  e.learning_priority,
  e.overall_score,
  LENGTH(d.copied_content) as content_length,
  d.created_at
FROM rag_documents d
LEFT JOIN ui_learning_evaluations e ON d.id = e.document_id
ORDER BY d.evaluation_score DESC;

-- 9. 検索テスト用クエリ
-- PGroonga全文検索テスト
SELECT * FROM rag_documents WHERE title &@~ 'プレイヤー';
SELECT * FROM rag_documents WHERE description &@~ 'カルーセル';
SELECT * FROM rag_documents WHERE (title || ' ' || description) &@~ 'ナビゲーション サイドバー';

-- 10. 統計情報の確認
SELECT 
  COUNT(*) as total_documents,
  AVG(evaluation_score) as avg_score,
  COUNT(DISTINCT ui_type) as unique_ui_types
FROM rag_documents;

-- カテゴリ別の集計
SELECT 
  e.app_category,
  COUNT(*) as pattern_count,
  AVG(e.overall_score) as avg_score,
  array_agg(DISTINCT d.ui_type) as ui_types
FROM ui_learning_evaluations e
JOIN rag_documents d ON e.document_id = d.id
GROUP BY e.app_category;