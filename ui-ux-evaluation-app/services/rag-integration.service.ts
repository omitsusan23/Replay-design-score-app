import { createRAGSearchService, TrainingExample } from './rag-search.service';
import { RAGClaudePromptService, RAGEvaluationRequest, RAGEvaluationResult } from './rag-claude-prompt.service';

export interface RAGIntegrationConfig {
  supabaseUrl: string;
  supabaseKey: string;
  enableRAG: boolean;
  maxTrainingExamples: number;
  fallbackToNonRAG: boolean;
}

export interface UISubmissionForRAG {
  projectName: string;
  description?: string;
  structureNote?: string;
  figmaUrl?: string;
  imageUrl?: string;
  ui_type?: string;
}

export class RAGIntegrationService {
  private ragSearchService;
  private config: RAGIntegrationConfig;

  constructor(config: RAGIntegrationConfig) {
    this.config = config;
    this.ragSearchService = createRAGSearchService(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * RAG統合評価のメイン処理
   * @param submission 提出UI情報
   * @returns RAG評価結果
   */
  async evaluateWithRAG(submission: UISubmissionForRAG): Promise<RAGEvaluationResult> {
    try {
      // RAGが無効の場合はRAGなし評価
      if (!this.config.enableRAG) {
        return await RAGClaudePromptService.evaluateWithoutRAG(submission);
      }

      // 1. 関連する教師データを検索
      const trainingExamples = await this.findRelevantTrainingData(submission);
      
      // 2. 教師データの品質チェック
      const qualityScore = RAGClaudePromptService.calculateTrainingDataQuality(trainingExamples);
      console.log(`Training data quality score: ${qualityScore}`);

      // 3. 品質が低い場合のフォールバック
      if (qualityScore < 0.3 && this.config.fallbackToNonRAG) {
        console.log('Training data quality too low, falling back to non-RAG evaluation');
        return await RAGClaudePromptService.evaluateWithoutRAG(submission);
      }

      // 4. RAG評価の実行
      const ragRequest: RAGEvaluationRequest = {
        ...submission,
        trainingExamples
      };

      const result = await RAGClaudePromptService.evaluateWithRAG(ragRequest);
      
      // 5. 結果の後処理
      return {
        ...result,
        confidence_score: this.calculateConfidenceScore(result, trainingExamples, qualityScore)
      };

    } catch (error) {
      console.error('RAG integration error:', error);
      
      // エラー時のフォールバック
      if (this.config.fallbackToNonRAG) {
        console.log('RAG evaluation failed, falling back to non-RAG evaluation');
        return await RAGClaudePromptService.evaluateWithoutRAG(submission);
      }
      
      throw error;
    }
  }

  /**
   * 提出UIに関連する教師データを検索
   * @param submission 提出UI情報
   * @returns 関連教師データ配列
   */
  private async findRelevantTrainingData(submission: UISubmissionForRAG): Promise<TrainingExample[]> {
    try {
      // 最適な教師データを検索
      const examples = await this.ragSearchService.findRelevantExamplesForSubmission({
        ui_type: submission.ui_type,
        structure_note: submission.structureNote,
        description: submission.description
      });

      // 最大件数制限
      return examples.slice(0, this.config.maxTrainingExamples);
    } catch (error) {
      console.error('Training data search error:', error);
      return [];
    }
  }

  /**
   * 評価の信頼度スコアを計算
   * @param result 評価結果
   * @param trainingExamples 使用した教師データ
   * @param qualityScore 教師データ品質スコア
   * @returns 信頼度スコア（0-1）
   */
  private calculateConfidenceScore(
    result: RAGEvaluationResult, 
    trainingExamples: TrainingExample[], 
    qualityScore: number
  ): number {
    // 基本信頼度
    let confidence = 0.5;

    // 教師データの数による調整
    const dataCountBonus = Math.min(trainingExamples.length / 3, 1) * 0.2;
    confidence += dataCountBonus;

    // 教師データの品質による調整
    confidence += qualityScore * 0.2;

    // 参照例の数による調整
    const referenceBonus = Math.min((result.reference_examples?.length || 0) / 3, 1) * 0.1;
    confidence += referenceBonus;

    return Math.min(Math.round(confidence * 100) / 100, 1.0);
  }

  /**
   * 教師データの統計情報を取得
   * @param ui_type UIタイプ（任意）
   * @returns 統計情報
   */
  async getTrainingDataStats(ui_type?: string) {
    try {
      // 基本統計
      let query = this.ragSearchService['supabase']
        .from('training_examples_stats')
        .select('*');

      if (ui_type) {
        query = query.eq('ui_type', ui_type);
      }

      const { data: stats } = await query;

      // 総数情報
      const { count } = await this.ragSearchService['supabase']
        .from('training_examples')
        .select('id', { count: 'exact' })
        .eq('is_approved', true);

      return {
        totalApprovedExamples: count || 0,
        statsByType: stats || [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Training data stats error:', error);
      return null;
    }
  }

  /**
   * 新しい教師データを追加
   * @param exampleData 教師データ
   * @param userId 追加者のユーザーID
   * @returns 追加結果
   */
  async addTrainingExample(exampleData: {
    figma_url?: string;
    image_url?: string;
    structure_note: string;
    ui_type: string;
    score_aesthetic: number;
    score_usability: number;
    score_alignment: number;
    score_accessibility: number;
    score_consistency: number;
    review_text: string;
    tags?: string[];
  }, userId: string) {
    try {
      const { data, error } = await this.ragSearchService['supabase']
        .from('training_examples')
        .insert({
          ...exampleData,
          added_by: userId,
          is_approved: false // 初期状態は未承認
        })
        .select()
        .single();

      if (error) {
        console.error('Training example insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Add training example error:', error);
      return { success: false, error: 'Failed to add training example' };
    }
  }
}

/**
 * RAG統合サービスのファクトリー関数
 * @param config RAG設定
 * @returns RAGIntegrationServiceインスタンス
 */
export function createRAGIntegrationService(config: RAGIntegrationConfig): RAGIntegrationService {
  return new RAGIntegrationService(config);
}

/**
 * デフォルトRAG設定
 */
export const DEFAULT_RAG_CONFIG: Omit<RAGIntegrationConfig, 'supabaseUrl' | 'supabaseKey'> = {
  enableRAG: true,
  maxTrainingExamples: 3,
  fallbackToNonRAG: true
};

/**
 * API Route統合例
 */
export const RAG_API_INTEGRATION_EXAMPLE = `
// /api/evaluate/route.ts での使用例

import { createRAGIntegrationService, DEFAULT_RAG_CONFIG } from '@/services/rag-integration.service';

export async function POST(request: NextRequest) {
  try {
    // ... 既存の認証・データ保存処理 ...

    // RAGサービスの初期化
    const ragService = createRAGIntegrationService({
      ...DEFAULT_RAG_CONFIG,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_SERVICE_KEY!
    });

    // RAG評価の実行
    const ragResult = await ragService.evaluateWithRAG({
      projectName,
      description,
      structureNote,
      figmaUrl: submitType === 'figma' ? figmaUrl : undefined,
      imageUrl: imageUrl || undefined,
      ui_type: 'LP' // 事前分類または推測
    });

    // ui_scoresテーブルに保存
    const { data: score, error: scoreError } = await supabase
      .from('ui_scores')
      .insert({
        submission_id: submission.id,
        ui_type: ragResult.ui_type,
        score_aesthetic: ragResult.score_aesthetic,
        score_usability: ragResult.score_usability,
        score_alignment: ragResult.score_alignment,
        score_accessibility: ragResult.score_accessibility,
        score_consistency: ragResult.score_consistency,
        review_text: ragResult.review_text
      })
      .select()
      .single();

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      evaluation: ragResult,
      metadata: {
        confidence_score: ragResult.confidence_score,
        reference_examples: ragResult.reference_examples,
        rag_enabled: true
      }
    });

  } catch (error) {
    // エラーハンドリング
  }
}
`;