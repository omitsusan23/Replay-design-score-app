import { supabase } from '@/lib/supabase';
import { 
  ObjectiveUIEvaluation,
  UIImageMetrics,
  TrainingDataset,
  ModelPrediction,
  PredictionExplanation
} from '@/types/objective-evaluation';
import { ObjectiveEvaluationService } from './objective-evaluation.service';
import { ImageAnalysisService } from './image-analysis.service';

interface FeatureVector {
  // 色彩特徴
  colorHarmony: number;
  colorCount: number;
  averageContrast: number;
  vibrancy: number;
  
  // レイアウト特徴
  gridAlignment: number;
  whiteSpaceRatio: number;
  visualHierarchy: number;
  balance: number;
  consistency: number;
  
  // アクセシビリティ特徴
  wcagCompliance: number;
  colorBlindSafe: number;
  
  // UI要素特徴
  ctaProminence: number;
  hasNavigation: number;
  interactiveElements: number;
  
  // カテゴリ特徴（one-hot encoding）
  categoryLanding: number;
  categoryDashboard: number;
  categoryMobile: number;
  categoryEcommerce: number;
}

export class PredictionModelService {
  private static modelVersion = '1.0.0';
  
  /**
   * UIデザインの客観スコアを予測
   */
  static async predictScore(
    imageData: string,
    category?: string[]
  ): Promise<ModelPrediction> {
    try {
      // 画像解析を実行
      const imageMetrics = await ImageAnalysisService.analyzeUIImage(imageData);
      
      // 特徴ベクトルを抽出
      const features = this.extractFeatures(imageMetrics, category);
      
      // 類似デザインを検索
      const similarDesigns = await this.findSimilarDesigns(features);
      
      // スコアを予測
      const prediction = await this.calculatePrediction(features, similarDesigns);
      
      // 予測結果を保存
      const savedPrediction = await this.savePrediction(prediction);
      
      return savedPrediction;
    } catch (error) {
      console.error('Prediction error:', error);
      throw error;
    }
  }
  
  /**
   * 画像メトリクスから特徴ベクトルを抽出
   */
  private static extractFeatures(
    metrics: Partial<UIImageMetrics>,
    category?: string[]
  ): FeatureVector {
    const features: FeatureVector = {
      // 色彩特徴
      colorHarmony: metrics.color_metrics?.color_harmony_score || 0,
      colorCount: metrics.color_metrics ? 
        Math.min(metrics.color_metrics.color_count / 50, 1) : 0,
      averageContrast: this.calculateAverageContrast(metrics.color_metrics?.contrast_ratios),
      vibrancy: metrics.color_metrics?.vibrancy_score || 0,
      
      // レイアウト特徴
      gridAlignment: metrics.layout_metrics?.grid_alignment || 0,
      whiteSpaceRatio: metrics.layout_metrics?.white_space_ratio || 0,
      visualHierarchy: metrics.layout_metrics?.visual_hierarchy_score || 0,
      balance: metrics.layout_metrics?.balance_score || 0,
      consistency: metrics.layout_metrics?.consistency_score || 0,
      
      // アクセシビリティ特徴
      wcagCompliance: metrics.accessibility_metrics?.wcag_aa_compliant || 0,
      colorBlindSafe: metrics.accessibility_metrics?.color_blind_safe ? 1 : 0,
      
      // UI要素特徴
      ctaProminence: metrics.ui_elements?.cta_prominence || 0,
      hasNavigation: metrics.ui_elements?.navigation ? 1 : 0,
      interactiveElements: metrics.ui_elements ? 
        Math.min(metrics.ui_elements.interactive_elements / 20, 1) : 0,
      
      // カテゴリ特徴
      categoryLanding: category?.includes('landing-page') ? 1 : 0,
      categoryDashboard: category?.includes('dashboard') ? 1 : 0,
      categoryMobile: category?.includes('mobile-app') ? 1 : 0,
      categoryEcommerce: category?.includes('e-commerce') ? 1 : 0
    };
    
    return features;
  }
  
  /**
   * 類似デザインを検索
   */
  private static async findSimilarDesigns(
    features: FeatureVector
  ): Promise<Array<{evaluation: ObjectiveUIEvaluation, score: number, distance: number}>> {
    // トレーニングデータセットから類似デザインを検索
    const { data: trainingData } = await supabase
      .from('training_dataset')
      .select(`
        *,
        objective_ui_evaluations!inner(
          *,
          ui_image_metrics(*)
        )
      `)
      .eq('is_validated', true)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (!trainingData || trainingData.length === 0) {
      return [];
    }
    
    // 各デザインとの距離を計算
    const similarities = trainingData.map(item => {
      const evaluation = item.objective_ui_evaluations;
      const metrics = evaluation.ui_image_metrics?.[0];
      
      if (!metrics) return null;
      
      const compareFeatures = this.extractFeatures(metrics, evaluation.design_category);
      const distance = this.calculateEuclideanDistance(features, compareFeatures);
      
      return {
        evaluation,
        score: item.objective_score,
        distance
      };
    }).filter(item => item !== null) as Array<{evaluation: ObjectiveUIEvaluation, score: number, distance: number}>;
    
    // 距離でソート（近い順）
    similarities.sort((a, b) => a.distance - b.distance);
    
    // 上位10件を返す
    return similarities.slice(0, 10);
  }
  
  /**
   * スコアを予測
   */
  private static async calculatePrediction(
    features: FeatureVector,
    similarDesigns: Array<{evaluation: ObjectiveUIEvaluation, score: number, distance: number}>
  ): Promise<Omit<ModelPrediction, 'id' | 'predicted_at'>> {
    let predictedScore = 50; // デフォルトスコア
    let confidence = 0;
    
    if (similarDesigns.length > 0) {
      // k-NN回帰（重み付き平均）
      const k = Math.min(5, similarDesigns.length);
      let weightedSum = 0;
      let weightSum = 0;
      
      for (let i = 0; i < k; i++) {
        const weight = 1 / (1 + similarDesigns[i].distance);
        weightedSum += similarDesigns[i].score * weight;
        weightSum += weight;
      }
      
      predictedScore = weightedSum / weightSum;
      
      // 信頼度の計算（最近傍の距離に基づく）
      confidence = Math.max(0, 1 - similarDesigns[0].distance / 10);
    }
    
    // ルールベースの調整
    predictedScore = this.applyRuleBasedAdjustments(predictedScore, features);
    
    // 特徴の重要度を計算
    const featureImportance = this.calculateFeatureImportance(features, similarDesigns);
    
    // 予測の説明を生成
    const explanation = this.generateExplanation(features, predictedScore, featureImportance);
    
    return {
      submission_id: '', // 後で設定
      predicted_score: Math.round(predictedScore * 100) / 100,
      prediction_confidence: Math.round(confidence * 100) / 100,
      model_version: this.modelVersion,
      model_type: 'metrics_based',
      feature_importance: featureImportance,
      prediction_explanation: explanation
    };
  }
  
  /**
   * ルールベースの調整
   */
  private static applyRuleBasedAdjustments(
    baseScore: number,
    features: FeatureVector
  ): number {
    let score = baseScore;
    
    // アクセシビリティが低い場合はペナルティ
    if (features.wcagCompliance < 0.5) {
      score *= 0.9;
    }
    
    // 色の調和が高い場合はボーナス
    if (features.colorHarmony > 0.8) {
      score *= 1.05;
    }
    
    // 視覚的階層が明確な場合はボーナス
    if (features.visualHierarchy > 0.8) {
      score *= 1.05;
    }
    
    // CTAが不明確な場合はペナルティ
    if (features.ctaProminence < 0.3) {
      score *= 0.95;
    }
    
    // スコアを0-100の範囲に制限
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 特徴の重要度を計算
   */
  private static calculateFeatureImportance(
    features: FeatureVector,
    similarDesigns: Array<{evaluation: ObjectiveUIEvaluation, score: number, distance: number}>
  ): Record<string, number> {
    const importance: Record<string, number> = {};
    const featureKeys = Object.keys(features) as (keyof FeatureVector)[];
    
    // 各特徴の寄与度を計算（簡易版）
    featureKeys.forEach(key => {
      const value = features[key];
      let contribution = 0;
      
      // 特徴値が高いほど重要度が高い（簡易実装）
      contribution = value * 0.5;
      
      // カテゴリに応じた重み付け
      if (key.startsWith('category')) {
        contribution *= 0.3;
      } else if (key.includes('accessibility') || key.includes('wcag')) {
        contribution *= 1.2;
      } else if (key.includes('color') || key.includes('visual')) {
        contribution *= 1.1;
      }
      
      importance[key] = Math.round(contribution * 100) / 100;
    });
    
    return importance;
  }
  
  /**
   * 予測の説明を生成
   */
  private static generateExplanation(
    features: FeatureVector,
    predictedScore: number,
    featureImportance: Record<string, number>
  ): PredictionExplanation {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const keyFactors: Array<{factor: string, impact: 'positive' | 'negative', weight: number}> = [];
    
    // 強みを特定
    if (features.colorHarmony > 0.7) {
      strengths.push('優れた色彩調和');
      keyFactors.push({ factor: '色彩調和', impact: 'positive', weight: featureImportance.colorHarmony || 0 });
    }
    if (features.visualHierarchy > 0.7) {
      strengths.push('明確な視覚的階層');
      keyFactors.push({ factor: '視覚的階層', impact: 'positive', weight: featureImportance.visualHierarchy || 0 });
    }
    if (features.wcagCompliance > 0.8) {
      strengths.push('高いアクセシビリティ');
      keyFactors.push({ factor: 'アクセシビリティ', impact: 'positive', weight: featureImportance.wcagCompliance || 0 });
    }
    
    // 弱みを特定
    if (features.ctaProminence < 0.4) {
      weaknesses.push('CTAの視認性が低い');
      keyFactors.push({ factor: 'CTA視認性', impact: 'negative', weight: -0.2 });
    }
    if (features.whiteSpaceRatio < 0.2) {
      weaknesses.push('余白が不足');
      keyFactors.push({ factor: '余白バランス', impact: 'negative', weight: -0.15 });
    }
    if (features.averageContrast < 4.5) {
      weaknesses.push('コントラストが不十分');
      keyFactors.push({ factor: 'コントラスト', impact: 'negative', weight: -0.25 });
    }
    
    // 重要度でソート
    keyFactors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    
    return {
      strengths,
      weaknesses,
      key_factors: keyFactors.slice(0, 5) // 上位5つの要因
    };
  }
  
  /**
   * 予測結果を保存
   */
  private static async savePrediction(
    prediction: Omit<ModelPrediction, 'id' | 'predicted_at'>
  ): Promise<ModelPrediction> {
    const { data, error } = await supabase
      .from('model_predictions')
      .insert(prediction)
      .select()
      .single();
    
    if (error) {
      console.error('Error saving prediction:', error);
      throw error;
    }
    
    return data;
  }
  
  // ユーティリティメソッド
  
  private static calculateAverageContrast(
    contrastRatios?: Record<string, number>
  ): number {
    if (!contrastRatios || Object.keys(contrastRatios).length === 0) {
      return 0;
    }
    
    const values = Object.values(contrastRatios);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // 正規化（1-21の範囲を0-1に）
    return Math.min(avg / 21, 1);
  }
  
  private static calculateEuclideanDistance(
    features1: FeatureVector,
    features2: FeatureVector
  ): number {
    let sum = 0;
    const keys = Object.keys(features1) as (keyof FeatureVector)[];
    
    keys.forEach(key => {
      const diff = features1[key] - features2[key];
      sum += diff * diff;
    });
    
    return Math.sqrt(sum);
  }
}