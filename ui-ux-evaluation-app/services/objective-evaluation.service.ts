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
   * 画像解析メトリクスから技術的スコアを計算
   */
  static calculateTechnicalScore(metrics: UIImageMetrics): number {
    let score = 0;
    let weights = 0;

    // 色彩スコア (25%)
    if (metrics.color_metrics) {
      const colorScore = (
        metrics.color_metrics.color_harmony_score * 0.4 +
        (Object.keys(metrics.color_metrics.contrast_ratios).length > 0 ? 0.6 : 0)
      );
      score += colorScore * 25;
      weights += 25;
    }

    // レイアウトスコア (30%)
    if (metrics.layout_metrics) {
      const layoutScore = (
        metrics.layout_metrics.grid_alignment * 0.2 +
        metrics.layout_metrics.white_space_ratio * 0.2 +
        metrics.layout_metrics.visual_hierarchy_score * 0.3 +
        metrics.layout_metrics.balance_score * 0.15 +
        metrics.layout_metrics.consistency_score * 0.15
      );
      score += layoutScore * 30;
      weights += 30;
    }

    // アクセシビリティスコア (25%)
    if (metrics.accessibility_metrics) {
      const accessibilityScore = (
        metrics.accessibility_metrics.wcag_aa_compliant * 0.6 +
        (metrics.accessibility_metrics.color_blind_safe ? 0.2 : 0) +
        metrics.accessibility_metrics.alt_text_coverage * 0.2
      );
      score += accessibilityScore * 25;
      weights += 25;
    }

    // UI要素スコア (20%)
    if (metrics.ui_elements) {
      const uiScore = (
        metrics.ui_elements.cta_prominence * 0.4 +
        (metrics.ui_elements.navigation ? 0.3 : 0) +
        Math.min(metrics.ui_elements.interactive_elements / 10, 1) * 0.3
      );
      score += uiScore * 20;
      weights += 20;
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
}