import { supabase } from '@/lib/supabase';
import { 
  ObjectiveUIEvaluation, 
  UIImageMetrics, 
  TrainingDataset,
  ObjectiveScoreCalculation,
  ExternalScores 
} from '@/types/objective-evaluation';

export class ObjectiveEvaluationService {
  /**
   * 外部プラットフォームからの評価データを正規化
   */
  static normalizeExternalScores(externalScores: ExternalScores): number {
    const platform = externalScores.platform.toLowerCase();
    
    switch (platform) {
      case 'dribbble':
        // Dribbbleのlikes/views比率とsavesを考慮
        const dribbbleEngagement = (
          (externalScores.likes || 0) * 10 +
          (externalScores.saves || 0) * 20 +
          (externalScores.comments || 0) * 5
        ) / Math.max(externalScores.views || 1, 100);
        return Math.min(dribbbleEngagement * 10, 100);
        
      case 'behance':
        // Behanceのappreciationsとviewsを考慮
        const behanceScore = (
          (externalScores.appreciations || 0) * 15 +
          (externalScores.comments || 0) * 10
        ) / Math.max(externalScores.views || 1, 100);
        return Math.min(behanceScore * 10, 100);
        
      case 'awwwards':
        // Awwwardsの評価システム (既に0-10スケール)
        return (externalScores.overall || 0) * 10;
        
      default:
        // 汎用的な正規化
        const totalEngagement = (
          (externalScores.likes || 0) +
          (externalScores.saves || 0) * 2 +
          (externalScores.comments || 0) * 0.5
        );
        const engagementRate = totalEngagement / Math.max(externalScores.views || 1, 100);
        return Math.min(engagementRate * 100, 100);
    }
  }

  /**
   * 画像解析メトリクスから技術的スコアを計算（強化版）
   */
  static calculateTechnicalScore(metrics: UIImageMetrics): number {
    let score = 0;
    let weights = 0;

    // 色彩・コントラストスコア (30%)
    if (metrics.color_metrics) {
      const colorScore = this.calculateColorScore(metrics.color_metrics);
      score += colorScore * 30;
      weights += 30;
    }

    // レイアウトスコア (25%)
    if (metrics.layout_metrics) {
      const layoutScore = this.calculateLayoutScore(metrics.layout_metrics);
      score += layoutScore * 25;
      weights += 25;
    }

    // アクセシビリティスコア (30%)
    if (metrics.accessibility_metrics) {
      const accessibilityScore = this.calculateAccessibilityScore(metrics.accessibility_metrics);
      score += accessibilityScore * 30;
      weights += 30;
    }

    // UI要素・インタラクションスコア (15%)
    if (metrics.ui_elements) {
      const uiScore = this.calculateUIElementsScore(metrics.ui_elements);
      score += uiScore * 15;
      weights += 15;
    }

    return weights > 0 ? (score / weights) * 100 : 0;
  }

  /**
   * 複数の評価源から総合的な客観スコアを計算
   */
  static calculateObjectiveScore(
    externalScores: ExternalScores,
    imageMetrics?: UIImageMetrics,
    communityRatings?: { overall: number }
  ): ObjectiveScoreCalculation {
    const calculation: ObjectiveScoreCalculation = {
      external_score: this.normalizeExternalScores(externalScores),
      technical_score: imageMetrics ? this.calculateTechnicalScore(imageMetrics) : 0,
      community_score: communityRatings ? communityRatings.overall * 10 : 0,
      weights: {
        external: 0.4,
        technical: 0.4,
        community: 0.2
      },
      final_score: 0
    };

    // 利用可能なデータに基づいて重みを調整
    const hasExternal = calculation.external_score > 0;
    const hasTechnical = calculation.technical_score > 0;
    const hasCommunity = calculation.community_score > 0;

    if (!hasTechnical && !hasCommunity) {
      calculation.weights = { external: 1.0, technical: 0, community: 0 };
    } else if (!hasExternal && !hasCommunity) {
      calculation.weights = { external: 0, technical: 1.0, community: 0 };
    } else if (!hasExternal && !hasTechnical) {
      calculation.weights = { external: 0, technical: 0, community: 1.0 };
    } else if (!hasCommunity) {
      calculation.weights = { external: 0.5, technical: 0.5, community: 0 };
    } else if (!hasTechnical) {
      calculation.weights = { external: 0.7, technical: 0, community: 0.3 };
    }

    // 最終スコアの計算
    calculation.final_score = 
      calculation.external_score * calculation.weights.external +
      calculation.technical_score * calculation.weights.technical +
      calculation.community_score * calculation.weights.community;

    return calculation;
  }

  /**
   * 客観的評価データをデータベースに保存
   */
  static async saveObjectiveEvaluation(
    evaluation: Omit<ObjectiveUIEvaluation, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ObjectiveUIEvaluation | null> {
    const { data, error } = await supabase
      .from('objective_ui_evaluations')
      .insert(evaluation)
      .select()
      .single();

    if (error) {
      console.error('Error saving objective evaluation:', error);
      return null;
    }

    return data;
  }

  /**
   * 画像解析メトリクスを保存
   */
  static async saveImageMetrics(
    metrics: Omit<UIImageMetrics, 'id' | 'analyzed_at'>
  ): Promise<UIImageMetrics | null> {
    const { data, error } = await supabase
      .from('ui_image_metrics')
      .insert(metrics)
      .select()
      .single();

    if (error) {
      console.error('Error saving image metrics:', error);
      return null;
    }

    return data;
  }

  /**
   * トレーニングデータセットに追加
   */
  static async addToTrainingDataset(
    evaluationId: string,
    scoreCalculation: ObjectiveScoreCalculation,
    categoryScores: Record<string, number>
  ): Promise<TrainingDataset | null> {
    const trainingData = {
      evaluation_id: evaluationId,
      objective_score: scoreCalculation.final_score,
      category_scores: categoryScores,
      confidence_level: this.calculateConfidenceLevel(scoreCalculation),
      data_quality: this.assessDataQuality(scoreCalculation)
    };

    const { data, error } = await supabase
      .from('training_dataset')
      .insert(trainingData)
      .select()
      .single();

    if (error) {
      console.error('Error adding to training dataset:', error);
      return null;
    }

    return data;
  }

  /**
   * スコア計算の信頼度を評価
   */
  private static calculateConfidenceLevel(calculation: ObjectiveScoreCalculation): number {
    const dataPoints = [
      calculation.external_score > 0,
      calculation.technical_score > 0,
      calculation.community_score > 0
    ].filter(Boolean).length;

    return dataPoints / 3;
  }

  /**
   * データ品質を評価
   */
  private static assessDataQuality(calculation: ObjectiveScoreCalculation): 'high' | 'medium' | 'low' {
    const confidence = this.calculateConfidenceLevel(calculation);
    
    if (confidence >= 0.66 && calculation.technical_score > 0) {
      return 'high';
    } else if (confidence >= 0.33) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 類似UIデザインから参考スコアを取得
   */
  static async getSimilarDesignScores(
    category: string[],
    limit: number = 10
  ): Promise<ObjectiveUIEvaluation[]> {
    const { data, error } = await supabase
      .from('objective_ui_evaluations')
      .select('*')
      .contains('design_category', category)
      .order('collected_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching similar designs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * 色彩・コントラストスコアの詳細計算
   */
  private static calculateColorScore(colorMetrics: ColorMetrics): number {
    let score = 0;
    let factors = 0;

    // WCAGコントラスト比スコア (40%)
    if (Object.keys(colorMetrics.contrast_ratios).length > 0) {
      const contrastScores = Object.values(colorMetrics.contrast_ratios);
      const avgContrast = contrastScores.reduce((a, b) => a + b, 0) / contrastScores.length;
      const wcagScore = Math.min(avgContrast / 7, 1); // 7:1が最高スコア
      score += wcagScore * 0.4;
      factors += 0.4;
    }

    // 色の調和スコア (30%)
    if (colorMetrics.color_harmony_score !== undefined) {
      score += colorMetrics.color_harmony_score * 0.3;
      factors += 0.3;
    }

    // 色の適切な数 (20%)
    const colorCountScore = this.evaluateColorCount(colorMetrics.color_count);
    score += colorCountScore * 0.2;
    factors += 0.2;

    // 鮮やかさバランス (10%)
    if (colorMetrics.vibrancy_score !== undefined) {
      const vibrancyScore = this.normalizeVibrancy(colorMetrics.vibrancy_score);
      score += vibrancyScore * 0.1;
      factors += 0.1;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * レイアウトスコアの詳細計算
   */
  private static calculateLayoutScore(layoutMetrics: LayoutMetrics): number {
    let score = 0;
    let factors = 0;

    // グリッド整列性 (25%)
    score += layoutMetrics.grid_alignment * 0.25;
    factors += 0.25;

    // 適切な余白比率 (20%)
    const whiteSpaceScore = this.evaluateWhiteSpaceRatio(layoutMetrics.white_space_ratio);
    score += whiteSpaceScore * 0.2;
    factors += 0.2;

    // 視覚階層 (30%)
    score += layoutMetrics.visual_hierarchy_score * 0.3;
    factors += 0.3;

    // バランス (15%)
    score += layoutMetrics.balance_score * 0.15;
    factors += 0.15;

    // 一貫性 (10%)
    score += layoutMetrics.consistency_score * 0.1;
    factors += 0.1;

    return factors > 0 ? score / factors : 0;
  }

  /**
   * アクセシビリティスコアの詳細計算
   */
  private static calculateAccessibilityScore(accessibilityMetrics: AccessibilityMetrics): number {
    let score = 0;
    let factors = 0;

    // WCAG AA準拠 (50%)
    score += accessibilityMetrics.wcag_aa_compliant * 0.5;
    factors += 0.5;

    // 色覚異常対応 (20%)
    score += (accessibilityMetrics.color_blind_safe ? 1 : 0) * 0.2;
    factors += 0.2;

    // WCAG AAA準拠 (15%)
    score += accessibilityMetrics.wcag_aaa_compliant * 0.15;
    factors += 0.15;

    // フォーカス表示 (10%)
    score += (accessibilityMetrics.focus_indicators ? 1 : 0) * 0.1;
    factors += 0.1;

    // テキストコントラスト (5%)
    score += accessibilityMetrics.alt_text_coverage * 0.05;
    factors += 0.05;

    return factors > 0 ? score / factors : 0;
  }

  /**
   * UI要素スコアの詳細計算
   */
  private static calculateUIElementsScore(uiElements: UIElements): number {
    let score = 0;
    let factors = 0;

    // CTAの際立ち度 (50%)
    score += uiElements.cta_prominence * 0.5;
    factors += 0.5;

    // ナビゲーションの存在 (25%)
    score += (uiElements.navigation ? 1 : 0) * 0.25;
    factors += 0.25;

    // インタラクティブ要素のバランス (15%)
    const interactiveScore = this.evaluateInteractiveElements(uiElements.interactive_elements);
    score += interactiveScore * 0.15;
    factors += 0.15;

    // ボタンの適切な数 (10%)
    const buttonScore = this.evaluateButtonCount(uiElements.buttons);
    score += buttonScore * 0.1;
    factors += 0.1;

    return factors > 0 ? score / factors : 0;
  }

  /**
   * 色数の評価
   */
  private static evaluateColorCount(colorCount: number): number {
    // 2-8色が理想的
    if (colorCount < 2) return 0.3;
    if (colorCount <= 8) return 1.0;
    if (colorCount <= 15) return 0.8;
    if (colorCount <= 25) return 0.6;
    return 0.4;
  }

  /**
   * 鮮やかさの正規化
   */
  private static normalizeVibrancy(vibrancy: number): number {
    // 0.3-0.7が理想的な範囲
    if (vibrancy < 0.1) return 0.5; // 単調すぎる
    if (vibrancy >= 0.3 && vibrancy <= 0.7) return 1.0; // 理想的
    if (vibrancy > 0.7) return Math.max(0.3, 1.0 - (vibrancy - 0.7) * 2); // 派手すぎる
    return 0.7 + (vibrancy - 0.1) * 1.5; // 少し地味
  }

  /**
   * 余白比率の評価
   */
  private static evaluateWhiteSpaceRatio(ratio: number): number {
    // 0.2-0.4が理想的
    if (ratio < 0.1) return 0.3; // 詰まりすぎ
    if (ratio >= 0.2 && ratio <= 0.4) return 1.0; // 理想的
    if (ratio > 0.4) return Math.max(0.4, 1.0 - (ratio - 0.4) * 2); // 空白過多
    return 0.5 + (ratio - 0.1) * 5; // やや詰まり気味
  }

  /**
   * インタラクティブ要素数の評価
   */
  private static evaluateInteractiveElements(count: number): number {
    if (count === 0) return 0.2; // 要素なし
    if (count <= 3) return 0.6; // 少なめ
    if (count <= 8) return 1.0; // 適切
    if (count <= 15) return 0.8; // やや多め
    return 0.5; // 多すぎ
  }

  /**
   * ボタン数の評価
   */
  private static evaluateButtonCount(count: number): number {
    if (count === 0) return 0.3; // ボタンなし
    if (count <= 2) return 1.0; // 適切
    if (count <= 5) return 0.8; // やや多め
    return 0.6; // 多すぎ
  }
}