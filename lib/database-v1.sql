-- V1.0 Database Schema for Replay Design Score App

-- UI評価履歴テーブル（メインテーブル）
CREATE TABLE ui_evaluations_v1 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 基本情報
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  structure_note TEXT, -- 構造メモ（設計意図）
  figma_link TEXT,
  image_url TEXT,
  
  -- UI分類
  ui_type TEXT NOT NULL CHECK (ui_type IN (
    'ランディングページ',
    'ダッシュボード', 
    'フォーム',
    'モバイルアプリ',
    'Eコマース',
    'その他'
  )),
  
  -- 10項目評価スコア（小数対応）
  score_visual_hierarchy DECIMAL(3,1) CHECK (score_visual_hierarchy >= 0 AND score_visual_hierarchy <= 10),
  score_color_harmony DECIMAL(3,1) CHECK (score_color_harmony >= 0 AND score_color_harmony <= 10),
  score_typography DECIMAL(3,1) CHECK (score_typography >= 0 AND score_typography <= 10),
  score_layout_balance DECIMAL(3,1) CHECK (score_layout_balance >= 0 AND score_layout_balance <= 10),
  score_consistency DECIMAL(3,1) CHECK (score_consistency >= 0 AND score_consistency <= 10),
  score_usability DECIMAL(3,1) CHECK (score_usability >= 0 AND score_usability <= 10),
  score_accessibility DECIMAL(3,1) CHECK (score_accessibility >= 0 AND score_accessibility <= 10),
  score_innovation DECIMAL(3,1) CHECK (score_innovation >= 0 AND score_innovation <= 10),
  score_brand_alignment DECIMAL(3,1) CHECK (score_brand_alignment >= 0 AND score_brand_alignment <= 10),
  score_emotional_impact DECIMAL(3,1) CHECK (score_emotional_impact >= 0 AND score_emotional_impact <= 10),
  
  -- 総合スコア
  total_score DECIMAL(4,1) GENERATED ALWAYS AS (
    (score_visual_hierarchy + score_color_harmony + score_typography + 
     score_layout_balance + score_consistency + score_usability + 
     score_accessibility + score_innovation + score_brand_alignment + 
     score_emotional_impact) / 10
  ) STORED,
  
  -- フィードバック
  short_review TEXT,        -- 小講評
  critical_feedback TEXT,   -- 辛口コメント
  improvements JSONB,       -- 改善提案（配列）
  
  -- メタデータ
  version INTEGER DEFAULT 1,  -- 同一FigmaURLのバージョン管理用
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_ui_evaluations_v1_user_id ON ui_evaluations_v1(user_id);
CREATE INDEX idx_ui_evaluations_v1_figma_link ON ui_evaluations_v1(figma_link);
CREATE INDEX idx_ui_evaluations_v1_created_at ON ui_evaluations_v1(created_at DESC);
CREATE INDEX idx_ui_evaluations_v1_ui_type ON ui_evaluations_v1(ui_type);

-- Slack通知設定テーブル
CREATE TABLE slack_notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  slack_channel_id TEXT,      -- 個人のSlackチャンネルID
  slack_webhook_url TEXT,     -- WebhookURL（暗号化推奨）
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 評価バージョン管理ビュー（同一FigmaURLの履歴を追跡）
CREATE VIEW ui_evaluation_versions AS
SELECT 
  figma_link,
  COUNT(*) as version_count,
  MAX(version) as latest_version,
  MIN(created_at) as first_evaluation,
  MAX(created_at) as latest_evaluation,
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'id', id,
      'version', version,
      'total_score', total_score,
      'created_at', created_at
    ) ORDER BY version DESC
  ) as version_history
FROM ui_evaluations_v1
WHERE figma_link IS NOT NULL
GROUP BY figma_link;

-- RLS（Row Level Security）ポリシー
ALTER TABLE ui_evaluations_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_notification_settings ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の評価のみ操作可能
CREATE POLICY "Users can CRUD own evaluations" ON ui_evaluations_v1
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own slack settings" ON slack_notification_settings
  FOR ALL USING (auth.uid() = user_id);

-- バージョン自動採番トリガー
CREATE OR REPLACE FUNCTION increment_version_for_figma_link()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.figma_link IS NOT NULL THEN
    NEW.version := COALESCE(
      (SELECT MAX(version) + 1 
       FROM ui_evaluations_v1 
       WHERE figma_link = NEW.figma_link 
         AND user_id = NEW.user_id), 
      1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_version_before_insert
BEFORE INSERT ON ui_evaluations_v1
FOR EACH ROW
EXECUTE FUNCTION increment_version_for_figma_link();

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ui_evaluations_v1_updated_at
BEFORE UPDATE ON ui_evaluations_v1
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_slack_settings_updated_at
BEFORE UPDATE ON slack_notification_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();