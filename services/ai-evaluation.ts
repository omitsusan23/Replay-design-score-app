import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { UIScore } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface EvaluationRequest {
  imageUrl?: string;
  figmaLink?: string;
  description: string;
  title: string;
}

export interface SubjectiveFeedback {
  visual_impact: string;
  user_experience: string;
  brand_consistency: string;
  trend_alignment: string;
  improvement_suggestions: string[];
}

export interface AIFeedbackResponse {
  subjective_feedback: SubjectiveFeedback;
  overall_feedback: string;
  tone: 'positive' | 'neutral' | 'constructive';
}

export interface EvaluationResponse {
  scores: UIScore;
  feedback: string;
  totalScore: number;
}

const FEEDBACK_PROMPT = `
あなたはUI/UXの専門家です。提供されたUI設計とその客観的分析結果を基に、主観的なフィードバックを提供してください。

客観的スコアは既に算出されているので、スコアの計算は不要です。
代わりに、以下の観点から実用的なフィードバックを提供してください：

1. 第一印象・ビジュアルインパクト
2. ユーザー体験の質
3. ブランドアイデンティティとの整合性
4. トレンドとの関連性
5. 改善提案

レスポンスは以下のJSON形式で返してください：

{
  "subjective_feedback": {
    "visual_impact": "第一印象に関するコメント",
    "user_experience": "ユーザー体験に関するコメント", 
    "brand_consistency": "ブランドとの整合性に関するコメント",
    "trend_alignment": "トレンドとの関連性に関するコメント",
    "improvement_suggestions": [
      "具体的な改善提案1",
      "具体的な改善提案2"
    ]
  },
  "overall_feedback": "総合的なフィードバック文章",
  "tone": "positive" | "neutral" | "constructive"
}
`;

export async function generateSubjectiveFeedback(
  request: EvaluationRequest, 
  objectiveScore?: number,
  technicalMetrics?: any
): Promise<AIFeedbackResponse> {
  try {
    const message = `
タイトル: ${request.title}
説明: ${request.description}
${request.figmaLink ? `Figmaリンク: ${request.figmaLink}` : ''}
${objectiveScore ? `客観的スコア: ${objectiveScore.toFixed(1)}点` : ''}
${technicalMetrics ? `技術指標: ${JSON.stringify(technicalMetrics, null, 2)}` : ''}

${FEEDBACK_PROMPT}
    `;

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
              text: message
            }
          ] : message
        }
      ]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const result = JSON.parse(content.text);
      return result;
    }

    throw new Error('Invalid response format');
  } catch (error) {
    console.error('AI feedback generation error:', error);
    throw new Error('AI フィードバック生成に失敗しました');
  }
}

// 後方互換性のための旧関数（非推奨）
export async function evaluateUI(request: EvaluationRequest): Promise<EvaluationResponse> {
  try {
    const feedback = await generateSubjectiveFeedback(request);
    
    // 旧形式に変換（スコアは0で返す）
    return {
      scores: {
        color_contrast: 0,
        information_organization: 0,
        visual_guidance: 0,
        accessibility: 0,
        ui_consistency: 0,
        visual_impact: 0,
        cta_clarity: 0
      },
      feedback: feedback.overall_feedback,
      totalScore: 0
    };
  } catch (error) {
    console.error('Backward compatibility evaluation error:', error);
    throw new Error('評価に失敗しました');
  }
}

export async function evaluateExternalUI(imageUrl: string, title: string): Promise<EvaluationResponse> {
  return evaluateUI({
    imageUrl,
    title,
    description: '外部から収集されたUI設計'
  });
}