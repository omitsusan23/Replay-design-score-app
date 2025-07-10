import { createClient } from '@supabase/supabase-js';
import { AIFeedbackResponse } from './ai-evaluation';
import { UIFeedback, Database } from '../types/database';

export type FeedbackInsertData = Database['public']['Tables']['ui_feedbacks']['Insert'];
export type FeedbackRow = UIFeedback;

export class FeedbackService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * AI生成フィードバックをui_feedbacksテーブルに保存
   * @param submissionId 紐づくUI投稿ID
   * @param feedbackData AI生成フィードバック
   * @returns 保存されたフィードバック情報
   */
  async insertFeedback(
    submissionId: string, 
    feedbackData: AIFeedbackResponse
  ): Promise<FeedbackRow | null> {
    try {
      const insertData: FeedbackInsertData = {
        submission_id: submissionId,
        visual_impact: feedbackData.subjective_feedback?.visual_impact || null,
        user_experience: feedbackData.subjective_feedback?.user_experience || null,
        brand_consistency: feedbackData.subjective_feedback?.brand_consistency || null,
        trend_alignment: feedbackData.subjective_feedback?.trend_alignment || null,
        improvement_suggestions: feedbackData.subjective_feedback?.improvement_suggestions || [],
        overall_feedback: feedbackData.overall_feedback || null,
        tone: feedbackData.tone || 'neutral'
      };

      const { data, error } = await this.supabase
        .from('ui_feedbacks')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Feedback insert error:', error);
        return null;
      }

      return data as FeedbackRow;
    } catch (error) {
      console.error('Feedback service error:', error);
      return null;
    }
  }

  /**
   * submission_idに紐づくフィードバックを取得
   * @param submissionId UI投稿ID
   * @returns フィードバック情報
   */
  async getFeedbackBySubmissionId(submissionId: string): Promise<FeedbackRow | null> {
    try {
      const { data, error } = await this.supabase
        .from('ui_feedbacks')
        .select('*')
        .eq('submission_id', submissionId)
        .single();

      if (error) {
        console.error('Feedback fetch error:', error);
        return null;
      }

      return data as FeedbackRow;
    } catch (error) {
      console.error('Feedback service error:', error);
      return null;
    }
  }

  /**
   * フィードバックを更新（再評価時）
   * @param submissionId UI投稿ID
   * @param feedbackData 新しいフィードバック
   * @returns 更新されたフィードバック情報
   */
  async updateFeedback(
    submissionId: string, 
    feedbackData: AIFeedbackResponse
  ): Promise<FeedbackRow | null> {
    try {
      const updateData: Partial<FeedbackInsertData> = {
        visual_impact: feedbackData.subjective_feedback?.visual_impact || null,
        user_experience: feedbackData.subjective_feedback?.user_experience || null,
        brand_consistency: feedbackData.subjective_feedback?.brand_consistency || null,
        trend_alignment: feedbackData.subjective_feedback?.trend_alignment || null,
        improvement_suggestions: feedbackData.subjective_feedback?.improvement_suggestions || [],
        overall_feedback: feedbackData.overall_feedback || null,
        tone: feedbackData.tone || 'neutral'
      };

      const { data, error } = await this.supabase
        .from('ui_feedbacks')
        .update(updateData)
        .eq('submission_id', submissionId)
        .select()
        .single();

      if (error) {
        console.error('Feedback update error:', error);
        return null;
      }

      return data as FeedbackRow;
    } catch (error) {
      console.error('Feedback service error:', error);
      return null;
    }
  }

  /**
   * フィードバックを挿入または更新（upsert）
   * @param submissionId UI投稿ID
   * @param feedbackData AI生成フィードバック
   * @returns 保存されたフィードバック情報
   */
  async upsertFeedback(
    submissionId: string, 
    feedbackData: AIFeedbackResponse
  ): Promise<FeedbackRow | null> {
    try {
      // 既存のフィードバックを確認
      const existing = await this.getFeedbackBySubmissionId(submissionId);
      
      if (existing) {
        // 既存の場合は更新
        return await this.updateFeedback(submissionId, feedbackData);
      } else {
        // 新規の場合は挿入
        return await this.insertFeedback(submissionId, feedbackData);
      }
    } catch (error) {
      console.error('Feedback upsert error:', error);
      return null;
    }
  }
}

/**
 * Supabaseクライアントを使用してフィードバックサービスを初期化
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @returns FeedbackServiceインスタンス
 */
export function createFeedbackService(supabaseUrl: string, supabaseKey: string): FeedbackService {
  return new FeedbackService(supabaseUrl, supabaseKey);
}

/**
 * 便利関数：AI生成フィードバックを直接保存
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @param submissionId UI投稿ID
 * @param feedbackData AI生成フィードバック
 * @returns 保存されたフィードバック情報
 */
export async function insertFeedback(
  supabaseUrl: string,
  supabaseKey: string,
  submissionId: string,
  feedbackData: AIFeedbackResponse
): Promise<FeedbackRow | null> {
  const service = createFeedbackService(supabaseUrl, supabaseKey);
  return await service.insertFeedback(submissionId, feedbackData);
}