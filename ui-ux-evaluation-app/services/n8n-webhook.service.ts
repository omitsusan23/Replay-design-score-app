import { V1EvaluationResponse } from './ai-evaluation-v1';

export interface N8nWebhookPayload {
  event: 'evaluation_completed';
  data: {
    evaluationId: string;
    userId: string;
    userName?: string;
    title: string;
    figmaLink?: string;
    uiType: string;
    totalScore: number;
    scores: Record<string, number>;
    shortReview: string;
    timestamp: string;
    version: number;
    isReevaluation: boolean;
  };
}

export class N8nWebhookService {
  private static webhookUrl = process.env.N8N_WEBHOOK_URL;

  /**
   * 評価完了をn8nに通知
   * n8n側でSlack通知などの後続処理を実行
   */
  public static async notifyEvaluationCompleted(
    evaluationId: string,
    userId: string,
    title: string,
    evaluation: V1EvaluationResponse,
    version: number = 1,
    figmaLink?: string,
    userName?: string
  ): Promise<boolean> {
    if (!this.webhookUrl) {
      console.log('N8N webhook URL not configured');
      return false;
    }

    try {
      const payload: N8nWebhookPayload = {
        event: 'evaluation_completed',
        data: {
          evaluationId,
          userId,
          userName,
          title,
          figmaLink,
          uiType: evaluation.uiType,
          totalScore: evaluation.totalScore,
          scores: evaluation.scores,
          shortReview: evaluation.shortReview,
          timestamp: evaluation.timestamp,
          version,
          isReevaluation: version > 1
        }
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-Event': 'evaluation_completed'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('N8N webhook failed:', response.status, await response.text());
        return false;
      }

      console.log('N8N webhook sent successfully for evaluation:', evaluationId);
      return true;
    } catch (error) {
      console.error('N8N webhook error:', error);
      return false;
    }
  }

  /**
   * バッチ評価完了をn8nに通知
   */
  public static async notifyBatchEvaluationsCompleted(
    evaluations: Array<{
      evaluationId: string;
      title: string;
      totalScore: number;
      uiType: string;
    }>,
    userId: string,
    userName?: string
  ): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    try {
      const payload = {
        event: 'batch_evaluations_completed',
        data: {
          userId,
          userName,
          evaluations,
          count: evaluations.length,
          timestamp: new Date().toISOString()
        }
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-Event': 'batch_evaluations_completed'
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      console.error('N8N batch webhook error:', error);
      return false;
    }
  }
}