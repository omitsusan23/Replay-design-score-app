import { supabase } from '@/lib/supabase';
import { V1EvaluationResponse, V1EvaluationRequest } from './ai-evaluation-v1';

export interface EvaluationHistory {
  id: string;
  version: number;
  totalScore: number;
  uiType: string;
  createdAt: string;
  shortReview: string;
}

export interface EvaluationComparison {
  current: V1EvaluationResponse;
  previous: V1EvaluationResponse | null;
  improvement: {
    totalScore: number;
    categoryImprovements: Record<string, number>;
  } | null;
}

export class EvaluationHistoryService {
  
  /**
   * 同一FigmaURLの評価履歴を取得
   */
  public static async getEvaluationHistory(figmaLink: string, userId: string): Promise<EvaluationHistory[]> {
    const { data, error } = await supabase
      .from('ui_evaluations_v1')
      .select('id, version, total_score, ui_type, created_at, short_review')
      .eq('figma_link', figmaLink)
      .eq('user_id', userId)
      .order('version', { ascending: false });

    if (error) {
      console.error('Failed to fetch evaluation history:', error);
      return [];
    }

    return data.map(item => ({
      id: item.id,
      version: item.version,
      totalScore: item.total_score,
      uiType: item.ui_type,
      createdAt: item.created_at,
      shortReview: item.short_review
    }));
  }

  /**
   * 評価を保存（自動バージョニング）
   */
  public static async saveEvaluation(
    userId: string,
    request: V1EvaluationRequest,
    evaluation: V1EvaluationResponse
  ): Promise<string> {
    const { data, error } = await supabase
      .from('ui_evaluations_v1')
      .insert({
        user_id: userId,
        title: request.title,
        description: request.description,
        structure_note: request.structureNote,
        figma_link: request.figmaLink,
        image_url: request.imageUrl,
        ui_type: evaluation.uiType,
        score_visual_hierarchy: evaluation.scores.visual_hierarchy,
        score_color_harmony: evaluation.scores.color_harmony,
        score_typography: evaluation.scores.typography,
        score_layout_balance: evaluation.scores.layout_balance,
        score_consistency: evaluation.scores.consistency,
        score_usability: evaluation.scores.usability,
        score_accessibility: evaluation.scores.accessibility,
        score_innovation: evaluation.scores.innovation,
        score_brand_alignment: evaluation.scores.brand_alignment,
        score_emotional_impact: evaluation.scores.emotional_impact,
        short_review: evaluation.shortReview,
        critical_feedback: evaluation.criticalFeedback,
        improvements: evaluation.improvements
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save evaluation:', error);
      throw new Error('評価の保存に失敗しました');
    }

    return data.id;
  }

  /**
   * 特定バージョンの評価を取得
   */
  public static async getEvaluationById(evaluationId: string): Promise<V1EvaluationResponse | null> {
    const { data, error } = await supabase
      .from('ui_evaluations_v1')
      .select('*')
      .eq('id', evaluationId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      uiType: data.ui_type,
      scores: {
        visual_hierarchy: data.score_visual_hierarchy,
        color_harmony: data.score_color_harmony,
        typography: data.score_typography,
        layout_balance: data.score_layout_balance,
        consistency: data.score_consistency,
        usability: data.score_usability,
        accessibility: data.score_accessibility,
        innovation: data.score_innovation,
        brand_alignment: data.score_brand_alignment,
        emotional_impact: data.score_emotional_impact
      },
      totalScore: data.total_score,
      shortReview: data.short_review,
      criticalFeedback: data.critical_feedback,
      improvements: data.improvements,
      timestamp: data.created_at
    };
  }

  /**
   * 前回との比較分析
   */
  public static async compareWithPrevious(
    figmaLink: string,
    userId: string,
    currentEvaluation: V1EvaluationResponse
  ): Promise<EvaluationComparison> {
    const history = await this.getEvaluationHistory(figmaLink, userId);
    
    if (history.length <= 1) {
      return {
        current: currentEvaluation,
        previous: null,
        improvement: null
      };
    }

    // 前回の評価を取得
    const previousEvaluation = await this.getEvaluationById(history[1].id);
    
    if (!previousEvaluation) {
      return {
        current: currentEvaluation,
        previous: null,
        improvement: null
      };
    }

    // スコアの改善を計算
    const categoryImprovements: Record<string, number> = {};
    const scoreKeys = Object.keys(currentEvaluation.scores) as Array<keyof typeof currentEvaluation.scores>;
    
    scoreKeys.forEach(key => {
      categoryImprovements[key] = 
        currentEvaluation.scores[key] - previousEvaluation.scores[key];
    });

    return {
      current: currentEvaluation,
      previous: previousEvaluation,
      improvement: {
        totalScore: currentEvaluation.totalScore - previousEvaluation.totalScore,
        categoryImprovements
      }
    };
  }

  /**
   * 統計情報の取得
   */
  public static async getStatistics(userId: string): Promise<{
    totalEvaluations: number;
    averageScore: number;
    bestScore: number;
    mostFrequentUIType: string;
    recentTrend: 'improving' | 'declining' | 'stable';
  }> {
    const { data, error } = await supabase
      .from('ui_evaluations_v1')
      .select('total_score, ui_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) {
      return {
        totalEvaluations: 0,
        averageScore: 0,
        bestScore: 0,
        mostFrequentUIType: 'その他',
        recentTrend: 'stable'
      };
    }

    const totalEvaluations = data.length;
    const scores = data.map(item => item.total_score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bestScore = Math.max(...scores);

    // UIタイプの頻度を計算
    const uiTypeCounts = data.reduce((acc, item) => {
      acc[item.ui_type] = (acc[item.ui_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostFrequentUIType = Object.entries(uiTypeCounts)
      .sort(([, a], [, b]) => b - a)[0][0];

    // 最近のトレンドを計算（直近10件と前の10件を比較）
    let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (data.length >= 20) {
      const recent10 = data.slice(0, 10).map(item => item.total_score);
      const previous10 = data.slice(10, 20).map(item => item.total_score);
      
      const recentAvg = recent10.reduce((a, b) => a + b, 0) / 10;
      const previousAvg = previous10.reduce((a, b) => a + b, 0) / 10;
      
      if (recentAvg > previousAvg + 5) {
        recentTrend = 'improving';
      } else if (recentAvg < previousAvg - 5) {
        recentTrend = 'declining';
      }
    }

    return {
      totalEvaluations,
      averageScore: Math.round(averageScore * 10) / 10,
      bestScore,
      mostFrequentUIType,
      recentTrend
    };
  }
}