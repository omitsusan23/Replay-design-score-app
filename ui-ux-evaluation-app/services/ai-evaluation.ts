import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { UIScore } from '@/types/index';

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
  structureNote?: string;
}

export interface EvaluationResult {
  ui_type: string;
  score_aesthetic: number;
  score_usability: number;
  score_alignment: number;
  score_accessibility: number;
  score_consistency: number;
  total_score: number;
  review_text: string;
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
あなたはUI/UXデザインの専門家です。提供されたデザインを以下の5つの観点から評価し、各項目を0.0〜10.0の小数点スコアで採点してください。

評価基準：
1. score_aesthetic（視覚的インパクト）: 配色、タイポグラフィ、ビジュアル要素の美的完成度
2. score_usability（使いやすさ）: 直感的な操作性、情報の見つけやすさ、ユーザーフロー
3. score_alignment（グリッド/整列）: レイアウトの整合性、要素の配置、視覚的階層
4. score_accessibility（アクセシビリティ）: 色のコントラスト、フォントサイズ、インクルーシブデザイン
5. score_consistency（一貫性）: デザイン言語の統一性、UI要素の再利用性、ブランド整合性

また、ui_typeを以下から選択してください：
- "LP"（ランディングページ）
- "Dashboard"（ダッシュボード）
- "Form"（フォーム）
- "Mobile App"（モバイルアプリ）
- "E-commerce"（ECサイト）
- "その他"

review_textには、デザインの長所と改善点を簡潔に記載してください。特に改善が必要な点については具体的な提案を含めてください。

必ず以下のJSON形式で回答してください：
{
  "ui_type": "選択したUIタイプ",
  "score_aesthetic": 0.0,
  "score_usability": 0.0,
  "score_alignment": 0.0,
  "score_accessibility": 0.0,
  "score_consistency": 0.0,
  "total_score": 0.00,
  "review_text": "評価コメント"
}
`;

export async function evaluateDesign(request: EvaluationRequest): Promise<EvaluationResult> {
  try {
    let message = `以下のUI/UXデザインを評価してください。

プロジェクト名: ${request.title}
説明・意図: ${request.description}`;

    if (request.structureNote) {
      message += `\n構造メモ（設計意図）: ${request.structureNote}`;
    }

    if (request.figmaLink) {
      message += `\nFigma URL: ${request.figmaLink}`;
    } else if (request.imageUrl) {
      message += `\n画像URL: ${request.imageUrl}`;
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1000,
      temperature: 0.3,
      system: FEEDBACK_PROMPT,
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
      const result = JSON.parse(content.text) as EvaluationResult;
      
      // total_scoreを再計算（5項目の平均）
      result.total_score = Number(
        ((result.score_aesthetic + 
          result.score_usability + 
          result.score_alignment + 
          result.score_accessibility + 
          result.score_consistency) / 5).toFixed(2)
      );
      
      return result;
    }

    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Error evaluating design:', error);
    throw new Error('デザイン評価中にエラーが発生しました');
  }
}

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