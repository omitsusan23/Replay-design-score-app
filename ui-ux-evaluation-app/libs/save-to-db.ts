import { createClient } from '@supabase/supabase-js';
import { ClaudeEvaluationResult } from './claude-eval';

export interface TrainingExampleData {
  image_url: string;
  ui_type: string;
  structure_note: string;
  review_text: string;
  tags: string[];
  added_by: string;
  is_approved?: boolean;
  figma_url?: string;
  score_aesthetic?: number;
  score_usability?: number;
  score_alignment?: number;
  score_accessibility?: number;
  score_consistency?: number;
}

export interface SaveResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface BatchSaveResult {
  success: boolean;
  results: SaveResult[];
  successCount: number;
  failureCount: number;
  savedIds: string[];
}

export class TrainingExampleSaveService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * 単一の教師データをSupabaseに保存
   * @param data 教師データ
   * @returns 保存結果
   */
  async saveSingleExample(data: TrainingExampleData): Promise<SaveResult> {
    try {
      // データ検証
      const validationError = this.validateTrainingData(data);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // training_examplesテーブルに挿入
      const { data: saved, error } = await this.supabase
        .from('training_examples')
        .insert({
          image_url: data.image_url,
          ui_type: data.ui_type,
          structure_note: data.structure_note,
          review_text: data.review_text,
          tags: data.tags,
          added_by: data.added_by,
          is_approved: data.is_approved || false,
          figma_url: data.figma_url || null,
          score_aesthetic: data.score_aesthetic || null,
          score_usability: data.score_usability || null,
          score_alignment: data.score_alignment || null,
          score_accessibility: data.score_accessibility || null,
          score_consistency: data.score_consistency || null
        })
        .select('id')
        .single();

      if (error) {
        console.error('Training example save error:', error);
        return {
          success: false,
          error: `保存エラー: ${error.message}`
        };
      }

      return {
        success: true,
        id: saved.id
      };

    } catch (error) {
      console.error('Save service error:', error);
      return {
        success: false,
        error: 'データ保存処理でエラーが発生しました'
      };
    }
  }

  /**
   * 複数の教師データを一括保存
   * @param dataArray 教師データ配列
   * @returns バッチ保存結果
   */
  async saveMultipleExamples(dataArray: TrainingExampleData[]): Promise<BatchSaveResult> {
    const results: SaveResult[] = [];
    const savedIds: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const data of dataArray) {
      const result = await this.saveSingleExample(data);
      results.push(result);

      if (result.success && result.id) {
        savedIds.push(result.id);
        successCount++;
      } else {
        failureCount++;
      }
    }

    return {
      success: successCount > 0,
      results,
      successCount,
      failureCount,
      savedIds
    };
  }

  /**
   * Claude評価結果から教師データを作成して保存
   * @param evaluationResults Claude評価結果配列
   * @param imageUrls 対応する画像URL配列
   * @param userId ユーザーID
   * @returns 保存結果
   */
  async saveFromClaudeEvaluations(
    evaluationResults: ClaudeEvaluationResult[],
    imageUrls: string[],
    userId: string
  ): Promise<BatchSaveResult> {
    if (evaluationResults.length !== imageUrls.length) {
      return {
        success: false,
        results: [],
        successCount: 0,
        failureCount: evaluationResults.length,
        savedIds: []
      };
    }

    const trainingData: TrainingExampleData[] = evaluationResults.map((result, index) => ({
      image_url: imageUrls[index],
      ui_type: result.ui_type,
      structure_note: result.structure_note,
      review_text: result.review_text,
      tags: result.tags,
      added_by: userId,
      is_approved: false // 初期状態は未承認
    }));

    return await this.saveMultipleExamples(trainingData);
  }

  /**
   * 教師データの検証
   * @param data 教師データ
   * @returns エラーメッセージ（エラーがない場合はnull）
   */
  private validateTrainingData(data: TrainingExampleData): string | null {
    if (!data.image_url || !data.image_url.trim()) {
      return '画像URLが必要です';
    }

    if (!data.ui_type || !data.ui_type.trim()) {
      return 'UIタイプが必要です';
    }

    if (!data.structure_note || !data.structure_note.trim()) {
      return '構造メモが必要です';
    }

    if (!data.review_text || !data.review_text.trim()) {
      return 'レビューテキストが必要です';
    }

    if (!data.added_by || !data.added_by.trim()) {
      return 'ユーザーIDが必要です';
    }

    if (!Array.isArray(data.tags)) {
      return 'タグは配列である必要があります';
    }

    // URL形式の検証
    try {
      new URL(data.image_url);
    } catch {
      return '無効な画像URL形式です';
    }

    return null;
  }

  /**
   * ユーザーの教師データ追加制限をチェック
   * @param userId ユーザーID
   * @param dailyLimit 1日の制限数（デフォルト: 50）
   * @returns 追加可能かどうか
   */
  async checkUserUploadLimit(userId: string, dailyLimit: number = 50): Promise<{
    canUpload: boolean;
    todayCount: number;
    remaining: number;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { count, error } = await this.supabase
        .from('training_examples')
        .select('id', { count: 'exact' })
        .eq('added_by', userId)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`);

      if (error) {
        console.error('Upload limit check error:', error);
        return { canUpload: true, todayCount: 0, remaining: dailyLimit };
      }

      const todayCount = count || 0;
      const remaining = Math.max(0, dailyLimit - todayCount);

      return {
        canUpload: todayCount < dailyLimit,
        todayCount,
        remaining
      };
    } catch (error) {
      console.error('Upload limit check service error:', error);
      return { canUpload: true, todayCount: 0, remaining: dailyLimit };
    }
  }

  /**
   * ユーザーの教師データ統計を取得
   * @param userId ユーザーID
   * @returns 統計情報
   */
  async getUserStats(userId: string) {
    try {
      const { data: stats, error } = await this.supabase
        .from('training_examples')
        .select('is_approved, ui_type, created_at')
        .eq('added_by', userId);

      if (error) {
        console.error('User stats error:', error);
        return null;
      }

      const total = stats?.length || 0;
      const approved = stats?.filter(item => item.is_approved).length || 0;
      const pending = total - approved;
      
      const typeCount = stats?.reduce((acc, item) => {
        acc[item.ui_type] = (acc[item.ui_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const last30Days = stats?.filter(item => {
        const created = new Date(item.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return created >= thirtyDaysAgo;
      }).length || 0;

      return {
        total,
        approved,
        pending,
        typeCount,
        last30Days
      };
    } catch (error) {
      console.error('User stats service error:', error);
      return null;
    }
  }

  /**
   * 教師データを更新（管理者承認など）
   * @param id 教師データID
   * @param updates 更新データ
   * @returns 更新結果
   */
  async updateExample(id: string, updates: Partial<TrainingExampleData>): Promise<SaveResult> {
    try {
      const { data, error } = await this.supabase
        .from('training_examples')
        .update(updates)
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        return {
          success: false,
          error: `更新エラー: ${error.message}`
        };
      }

      return {
        success: true,
        id: data.id
      };
    } catch (error) {
      console.error('Update service error:', error);
      return {
        success: false,
        error: '更新処理でエラーが発生しました'
      };
    }
  }

  /**
   * 教師データを削除
   * @param id 教師データID
   * @param userId ユーザーID（所有者確認用）
   * @returns 削除結果
   */
  async deleteExample(id: string, userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('training_examples')
        .delete()
        .eq('id', id)
        .eq('added_by', userId);

      return !error;
    } catch (error) {
      console.error('Delete service error:', error);
      return false;
    }
  }
}

/**
 * 教師データ保存サービスのファクトリー関数
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @returns TrainingExampleSaveServiceインスタンス
 */
export function createTrainingExampleSaveService(
  supabaseUrl: string, 
  supabaseKey: string
): TrainingExampleSaveService {
  return new TrainingExampleSaveService(supabaseUrl, supabaseKey);
}

/**
 * 便利関数：Claude評価結果を直接保存
 * @param evaluationResults Claude評価結果配列
 * @param imageUrls 画像URL配列
 * @param userId ユーザーID
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @returns 保存結果
 */
export async function saveClaudeEvaluationsToDatabase(
  evaluationResults: ClaudeEvaluationResult[],
  imageUrls: string[],
  userId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<BatchSaveResult> {
  const saveService = createTrainingExampleSaveService(supabaseUrl, supabaseKey);
  return await saveService.saveFromClaudeEvaluations(evaluationResults, imageUrls, userId);
}