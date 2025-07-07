-- 客観的UI評価データベース構造の改善案
-- 開発方針：LLMの主観的評価ではなく、客観的データに基づくスコアリング

-- 1. 客観的評価データの収集テーブル
CREATE TABLE objective_ui_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- UI基本情報
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT NOT NULL, -- Dribbble, Behance, Awwwards等のURL
  image_url TEXT NOT NULL,
  design_category TEXT[], -- ["landing-page", "dashboard", "mobile-app"]等
  
  -- 客観的評価指標（他者による評価）
  external_scores JSONB NOT NULL, -- {platform: "dribbble", likes: 1234, views: 5678, saves: 234}
  community_ratings JSONB, -- {overall: 4.5, usability: 4.2, creativity: 4.8}
  awards TEXT[], -- ["Site of the Day", "Best UI Design"]等
  
  -- 収集メタデータ
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source_platform TEXT NOT NULL CHECK (source_platform IN ('dribbble', 'behance', 'awwwards', 'uxpin', 'other'))
);

-- 2. 定量的画像解析データテーブル
CREATE TABLE ui_image_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID REFERENCES objective_ui_evaluations(id) ON DELETE CASCADE,
  
  -- 色彩分析
  color_metrics JSONB NOT NULL, -- {dominant_colors: [], color_count: 8, contrast_ratios: {}}
  
  -- レイアウト分析
  layout_metrics JSONB NOT NULL, -- {grid_alignment: 0.95, white_space_ratio: 0.35, visual_hierarchy_score: 0.8}
  
  -- テキスト可読性
  text_metrics JSONB, -- {font_sizes: [], line_heights: [], text_contrast_scores: []}
  
  -- UI要素検出
  ui_elements JSONB, -- {buttons: 5, forms: 2, navigation: true, cta_prominence: 0.9}
  
  -- アクセシビリティ指標
  accessibility_metrics JSONB, -- {color_blind_safe: true, wcag_aa_compliant: 0.85}
  
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 学習用ラベル付きデータセット
CREATE TABLE training_dataset (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID REFERENCES objective_ui_evaluations(id) ON DELETE CASCADE,
  
  -- 総合的な客観スコア（0-100）
  objective_score DECIMAL(5,2) NOT NULL CHECK (objective_score >= 0 AND objective_score <= 100),
  
  -- カテゴリ別スコア
  category_scores JSONB NOT NULL, -- {usability: 85, aesthetics: 90, innovation: 75}
  
  -- データの信頼性
  confidence_level DECIMAL(3,2) CHECK (confidence_level >= 0 AND confidence_level <= 1),
  data_quality TEXT CHECK (data_quality IN ('high', 'medium', 'low')),
  
  -- バリデーション
  is_validated BOOLEAN DEFAULT FALSE,
  validated_by UUID REFERENCES profiles(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 予測モデルのパフォーマンス追跡
CREATE TABLE model_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES ui_submissions(id) ON DELETE CASCADE,
  
  -- 予測スコア
  predicted_score DECIMAL(5,2) NOT NULL,
  prediction_confidence DECIMAL(3,2),
  
  -- 使用したモデル情報
  model_version TEXT NOT NULL,
  model_type TEXT NOT NULL, -- 'image_based', 'metrics_based', 'ensemble'
  
  -- 予測の詳細
  feature_importance JSONB, -- どの特徴が予測に寄与したか
  prediction_explanation JSONB, -- なぜこのスコアになったか
  
  predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 自動データ収集ジョブの管理
CREATE TABLE data_collection_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('scraping', 'api_fetch', 'image_analysis')),
  source_platform TEXT NOT NULL,
  
  -- ジョブ状態
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- 結果
  items_collected INTEGER DEFAULT 0,
  error_message TEXT,
  job_metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX idx_objective_evaluations_platform ON objective_ui_evaluations(source_platform);
CREATE INDEX idx_objective_evaluations_collected ON objective_ui_evaluations(collected_at);
CREATE INDEX idx_training_dataset_score ON training_dataset(objective_score);
CREATE INDEX idx_model_predictions_submission ON model_predictions(submission_id);
CREATE INDEX idx_collection_jobs_status ON data_collection_jobs(status);

-- Row Level Security
ALTER TABLE objective_ui_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_image_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_dataset ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_collection_jobs ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは客観評価データを閲覧可能
CREATE POLICY "Authenticated users can view objective evaluations"
  ON objective_ui_evaluations
  FOR SELECT
  TO authenticated
  USING (true);

-- 管理者のみデータ収集ジョブを管理可能
CREATE POLICY "Only admins can manage collection jobs"
  ON data_collection_jobs
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  ));