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

export interface EvaluationResponse {
  scores: UIScore;
  feedback: string;
  totalScore: number;
}

const EVALUATION_PROMPT = `
あなたはUI/UXの専門家です。提供されたUI設計を以下の7つの観点で評価し、各項目20点満点で採点してください。

評価項目：
1. 配色・コントラスト (color_contrast)
2. 情報整理・密度 (information_organization) 
3. 視線誘導・ナビゲーション (visual_guidance)
4. アクセシビリティ (accessibility)
5. UIの一貫性・余白 (ui_consistency)
6. 第一印象・ビジュアルインパクト (visual_impact)
7. CTAの明瞭さ (cta_clarity)

各項目について具体的な改善点を含む詳細なフィードバックを提供してください。
レスポンスは以下のJSON形式で返してください：

{
  "scores": {
    "color_contrast": 15,
    "information_organization": 17,
    "visual_guidance": 14,
    "accessibility": 16,
    "ui_consistency": 18,
    "visual_impact": 13,
    "cta_clarity": 19
  },
  "feedback": "詳細なフィードバック文章",
  "totalScore": 112
}
`;

export async function evaluateUI(request: EvaluationRequest): Promise<EvaluationResponse> {
  try {
    const message = `
タイトル: ${request.title}
説明: ${request.description}
${request.figmaLink ? `Figmaリンク: ${request.figmaLink}` : ''}

${EVALUATION_PROMPT}
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
    console.error('AI evaluation error:', error);
    throw new Error('AI評価に失敗しました');
  }
}

export async function evaluateExternalUI(imageUrl: string, title: string): Promise<EvaluationResponse> {
  return evaluateUI({
    imageUrl,
    title,
    description: '外部から収集されたUI設計'
  });
}