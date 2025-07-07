// 客観的UI評価システムの型定義

export interface ObjectiveUIEvaluation {
  id: string;
  title: string;
  description?: string;
  source_url: string;
  image_url: string;
  design_category: string[];
  external_scores: ExternalScores;
  community_ratings?: CommunityRatings;
  awards: string[];
  collected_at: string;
  updated_at: string;
  source_platform: 'dribbble' | 'behance' | 'awwwards' | 'uxpin' | 'other';
}

export interface ExternalScores {
  platform: string;
  likes?: number;
  views?: number;
  saves?: number;
  appreciations?: number;
  comments?: number;
  shares?: number;
  [key: string]: string | number | undefined;
}

export interface CommunityRatings {
  overall: number;
  usability?: number;
  creativity?: number;
  innovation?: number;
  aesthetics?: number;
  [key: string]: number | undefined;
}

export interface UIImageMetrics {
  id: string;
  evaluation_id: string;
  color_metrics: ColorMetrics;
  layout_metrics: LayoutMetrics;
  text_metrics?: TextMetrics;
  ui_elements?: UIElements;
  accessibility_metrics?: AccessibilityMetrics;
  analyzed_at: string;
}

export interface ColorMetrics {
  dominant_colors: Array<{
    hex: string;
    rgb: [number, number, number];
    percentage: number;
  }>;
  color_count: number;
  contrast_ratios: {
    [key: string]: number;
  };
  color_harmony_score?: number;
  vibrancy_score?: number;
}

export interface LayoutMetrics {
  grid_alignment: number; // 0-1
  white_space_ratio: number; // 0-1
  visual_hierarchy_score: number; // 0-1
  balance_score: number; // 0-1
  consistency_score: number; // 0-1
}

export interface TextMetrics {
  font_sizes: number[];
  line_heights: number[];
  text_contrast_scores: Array<{
    foreground: string;
    background: string;
    ratio: number;
    wcag_level: 'fail' | 'aa' | 'aaa';
  }>;
  readability_score: number;
}

export interface UIElements {
  buttons: number;
  forms: number;
  navigation: boolean;
  cta_prominence: number; // 0-1
  interactive_elements: number;
  images: number;
  icons: number;
}

export interface AccessibilityMetrics {
  color_blind_safe: boolean;
  wcag_aa_compliant: number; // 0-1
  wcag_aaa_compliant: number; // 0-1
  focus_indicators: boolean;
  alt_text_coverage: number; // 0-1
}

export interface TrainingDataset {
  id: string;
  evaluation_id: string;
  objective_score: number; // 0-100
  category_scores: CategoryScores;
  confidence_level: number; // 0-1
  data_quality: 'high' | 'medium' | 'low';
  is_validated: boolean;
  validated_by?: string;
  validated_at?: string;
  created_at: string;
}

export interface CategoryScores {
  usability: number;
  aesthetics: number;
  innovation: number;
  functionality?: number;
  performance?: number;
  [key: string]: number | undefined;
}

export interface ModelPrediction {
  id: string;
  submission_id: string;
  predicted_score: number;
  prediction_confidence: number;
  model_version: string;
  model_type: 'image_based' | 'metrics_based' | 'ensemble';
  feature_importance?: FeatureImportance;
  prediction_explanation?: PredictionExplanation;
  predicted_at: string;
}

export interface FeatureImportance {
  [feature: string]: number;
}

export interface PredictionExplanation {
  strengths: string[];
  weaknesses: string[];
  key_factors: Array<{
    factor: string;
    impact: 'positive' | 'negative';
    weight: number;
  }>;
}

export interface DataCollectionJob {
  id: string;
  job_type: 'scraping' | 'api_fetch' | 'image_analysis';
  source_platform: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  items_collected: number;
  error_message?: string;
  job_metadata?: {
    [key: string]: any;
  };
  created_at: string;
}

// スコア計算用のユーティリティ型
export interface ObjectiveScoreCalculation {
  // 外部評価の正規化スコア (0-100)
  external_score: number;
  
  // 画像解析による技術的スコア (0-100)
  technical_score: number;
  
  // コミュニティ評価スコア (0-100)
  community_score: number;
  
  // 重み付け
  weights: {
    external: number;
    technical: number;
    community: number;
  };
  
  // 最終的な客観スコア
  final_score: number;
}