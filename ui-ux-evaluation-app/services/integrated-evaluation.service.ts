import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';
import { UIScore } from '@/types/index';
import { PredictionModelService } from './prediction-model.service';
import { ImageAnalysisService } from './image-analysis.service';
import { ObjectiveEvaluationService } from './objective-evaluation.service';
import { ModelPrediction } from '@/types/objective-evaluation';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface IntegratedEvaluationRequest {
  imageUrl?: string;
  figmaLink?: string;
  description: string;
  title: string;
}

export interface IntegratedEvaluationResponse {
  scores: UIScore;
  feedback: string;
  totalScore: number;
  objectiveScore: number;
  prediction: ModelPrediction;
  explanation: string;
  recommendations: string[];
}

/**
 * 統合評価サービス
 * 客観的スコアリング + LLMによる説明文生成
 */
export class IntegratedEvaluationService {
  
  /**
   * メイン評価メソッド
   */
  static async evaluateUI(request: IntegratedEvaluationRequest): Promise<IntegratedEvaluationResponse> {
    try {
      // 1. 客観的スコアリング
      const objectiveResult = await this.performObjectiveEvaluation(request);
      
      // 2. LLMによる説明文生成
      const explanationResult = await this.generateExplanations(request, objectiveResult);
      
      // 3. 統合結果の作成
      const integratedResult = this.integrateResults(objectiveResult, explanationResult);
      
      return integratedResult;
    } catch (error) {
      console.error('Integrated evaluation error:', error);
      throw new Error('統合評価に失敗しました');
    }
  }
  
  /**
   * 客観的評価を実行
   */
  private static async performObjectiveEvaluation(
    request: IntegratedEvaluationRequest
  ): Promise<{
    prediction: ModelPrediction;
    imageMetrics: any;
    objectiveScore: number;
  }> {
    const imageData = request.imageUrl || '';
    
    // 予測モデルでスコアを計算
    const prediction = await PredictionModelService.predictScore(
      imageData,
      this.inferCategory(request.title, request.description)
    );
    
    // 画像解析メトリクスを取得
    const imageMetrics = await ImageAnalysisService.analyzeUIImage(imageData);
    
    return {
      prediction,
      imageMetrics,
      objectiveScore: prediction.predicted_score
    };
  }
  
  /**
   * LLMによる説明文生成
   */
  private static async generateExplanations(
    request: IntegratedEvaluationRequest,
    objectiveResult: {
      prediction: ModelPrediction;
      imageMetrics: any;
      objectiveScore: number;
    }
  ): Promise<{
    feedback: string;
    explanation: string;
    recommendations: string[];
  }> {
    const explanationPrompt = this.buildExplanationPrompt(request, objectiveResult);
    
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: request.imageUrl ? [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: request.imageUrl
              }
            },
            {
              type: 'text',
              text: explanationPrompt
            }
          ] : explanationPrompt
        }
      ]
    });
    
    const content = response.content[0];
    if (content.type === 'text') {
      const result = JSON.parse(content.text);
      return {
        feedback: result.feedback || '',
        explanation: result.explanation || '',
        recommendations: result.recommendations || []
      };
    }
    
    throw new Error('Invalid explanation response format');
  }
  
  /**
   * 説明文生成用のプロンプト作成
   */
  private static buildExplanationPrompt(
    request: IntegratedEvaluationRequest,
    objectiveResult: {
      prediction: ModelPrediction;
      imageMetrics: any;
      objectiveScore: number;
    }
  ): string {
    const { prediction, imageMetrics, objectiveScore } = objectiveResult;
    
    return `
あなたはUI/UXの専門家です。提供されたUI設計について、客観的分析結果を基に日本語で詳細な説明とフィードバックを提供してください。

【UI設計情報】
タイトル: ${request.title}
説明: ${request.description}
${request.figmaLink ? `Figmaリンク: ${request.figmaLink}` : ''}

【客観的分析結果】
総合スコア: ${objectiveScore}/100
予測信頼度: ${prediction.prediction_confidence}

【分析による強み】
${prediction.prediction_explanation?.strengths.join('\n') || ''}

【分析による弱み】
${prediction.prediction_explanation?.weaknesses.join('\n') || ''}

【重要な要因】
${prediction.prediction_explanation?.key_factors.map(f => `- ${f.factor}: ${f.impact} (重要度: ${f.weight})`).join('\n') || ''}

【画像解析データ】
- 色彩調和: ${imageMetrics.color_metrics?.color_harmony_score || 'N/A'}
- 視覚的階層: ${imageMetrics.layout_metrics?.visual_hierarchy_score || 'N/A'}
- アクセシビリティ: ${imageMetrics.accessibility_metrics?.wcag_aa_compliant || 'N/A'}

上記の客観的分析結果を基に、以下の形式で回答してください：

{
  "feedback": "全体的な評価と分析結果の要約を含む詳細なフィードバック",
  "explanation": "なぜこのスコアになったのかの客観的な説明",
  "recommendations": ["具体的な改善提案1", "具体的な改善提案2", "具体的な改善提案3"]
}

注意: スコアの採点は行わず、既に算出された客観スコアの解釈と説明のみを行ってください。`;
  }
  
  /**
   * 結果を統合
   */
  private static integrateResults(
    objectiveResult: {
      prediction: ModelPrediction;
      imageMetrics: any;
      objectiveScore: number;
    },
    explanationResult: {
      feedback: string;
      explanation: string;
      recommendations: string[];
    }
  ): IntegratedEvaluationResponse {
    const { prediction, objectiveScore } = objectiveResult;
    const { feedback, explanation, recommendations } = explanationResult;
    
    // 客観スコアを7項目に分散（既存システムとの互換性のため）
    const scores = this.distributeScoreToCategories(objectiveScore, prediction);
    
    return {
      scores,
      feedback,
      totalScore: Math.round(objectiveScore * 1.4), // 140点満点に調整
      objectiveScore,
      prediction,
      explanation,
      recommendations
    };
  }
  
  /**
   * 客観スコアを7つのカテゴリに分散
   */
  private static distributeScoreToCategories(
    objectiveScore: number,
    prediction: ModelPrediction
  ): UIScore {
    const baseScore = Math.round(objectiveScore / 5); // 20点満点に調整
    const featureImportance = prediction.feature_importance || {};
    
    // 重要度に基づいて調整
    const adjustments = {
      color_contrast: featureImportance.averageContrast || 0,
      information_organization: featureImportance.visualHierarchy || 0,
      visual_guidance: featureImportance.gridAlignment || 0,
      accessibility: featureImportance.wcagCompliance || 0,
      ui_consistency: featureImportance.consistency || 0,
      visual_impact: featureImportance.colorHarmony || 0,
      cta_clarity: featureImportance.ctaProminence || 0
    };
    
    return {
      color_contrast: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.color_contrast * 5))),
      information_organization: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.information_organization * 5))),
      visual_guidance: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.visual_guidance * 5))),
      accessibility: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.accessibility * 5))),
      ui_consistency: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.ui_consistency * 5))),
      visual_impact: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.visual_impact * 5))),
      cta_clarity: Math.max(5, Math.min(20, baseScore + Math.round(adjustments.cta_clarity * 5)))
    };
  }
  
  /**
   * タイトルと説明からカテゴリを推論
   */
  private static inferCategory(title: string, description: string): string[] {
    const text = `${title} ${description}`.toLowerCase();
    const categories: string[] = [];
    
    if (text.includes('landing') || text.includes('ランディング')) {
      categories.push('landing-page');
    }
    if (text.includes('dashboard') || text.includes('ダッシュボード')) {
      categories.push('dashboard');
    }
    if (text.includes('mobile') || text.includes('モバイル') || text.includes('app')) {
      categories.push('mobile-app');
    }
    if (text.includes('ecommerce') || text.includes('ec') || text.includes('shop')) {
      categories.push('e-commerce');
    }
    if (text.includes('web') || text.includes('ウェブ')) {
      categories.push('web-design');
    }
    
    return categories.length > 0 ? categories : ['ui', 'general'];
  }
}

// 下位互換性のためのレガシー関数
export async function evaluateUI(request: IntegratedEvaluationRequest): Promise<IntegratedEvaluationResponse> {
  return IntegratedEvaluationService.evaluateUI(request);
}