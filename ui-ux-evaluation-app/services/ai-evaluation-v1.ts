import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type UIType = 
  | 'ランディングページ'
  | 'ダッシュボード'
  | 'フォーム'
  | 'モバイルアプリ'
  | 'Eコマース'
  | 'その他';

export interface V1EvaluationScores extends Record<string, number> {
  visual_hierarchy: number;      // 視覚的階層
  color_harmony: number;         // 色彩調和
  typography: number;            // タイポグラフィ
  layout_balance: number;        // レイアウトバランス
  consistency: number;           // 一貫性
  usability: number;            // 使いやすさ
  accessibility: number;        // アクセシビリティ
  innovation: number;           // 革新性
  brand_alignment: number;      // ブランド整合性
  emotional_impact: number;     // 感情的インパクト
}

export interface V1EvaluationRequest {
  imageUrl?: string;
  figmaLink?: string;
  title: string;
  description: string;
  structureNote?: string;  // 構造メモ（設計意図）
}

export interface V1EvaluationResponse {
  uiType: UIType;
  scores: V1EvaluationScores;
  totalScore: number;
  shortReview: string;      // 小講評（1-2文）
  criticalFeedback: string; // 辛口コメント
  improvements: string[];   // 改善提案
  timestamp: string;
}

const V1_EVALUATION_PROMPT = `
あなたは厳格なUI/UXデザインの専門レビュアーです。
提供されたデザインを以下の基準で評価してください。

# 評価タスク

1. UIタイプの分類
以下のいずれかに分類:
- ランディングページ
- ダッシュボード
- フォーム
- モバイルアプリ
- Eコマース
- その他

2. 10項目の評価（各項目0.0-10.0の小数スコア）
- visual_hierarchy: 視覚的階層の明確さ
- color_harmony: 色彩の調和と効果的な使用
- typography: タイポグラフィの適切さ
- layout_balance: レイアウトのバランス
- consistency: デザインの一貫性
- usability: 使いやすさと操作性
- accessibility: アクセシビリティ対応
- innovation: 革新性と創造性
- brand_alignment: ブランドとの整合性
- emotional_impact: ユーザーへの感情的インパクト

3. 評価方針
- 社内デザイナーの成長を促すため、辛口で具体的なフィードバックを提供
- 良い点も認めつつ、改善点を明確に指摘
- プロフェッショナル基準で評価（甘い採点は避ける）

# 出力形式（JSON）

{
  "uiType": "UIタイプ",
  "scores": {
    "visual_hierarchy": 7.5,
    "color_harmony": 8.2,
    "typography": 6.8,
    "layout_balance": 7.0,
    "consistency": 8.5,
    "usability": 7.3,
    "accessibility": 6.0,
    "innovation": 5.5,
    "brand_alignment": 7.8,
    "emotional_impact": 7.2
  },
  "totalScore": 71.8,
  "shortReview": "全体的に統一感があるが、アクセシビリティと革新性に課題あり。",
  "criticalFeedback": "配色は調和していますが、コントラスト比が不十分な箇所が散見されます。特にCTAボタンの視認性が低く、ユーザーのコンバージョンに影響する可能性があります。また、レイアウトは安全すぎて記憶に残りにくいデザインです。",
  "improvements": [
    "CTAボタンのコントラスト比を4.5:1以上に改善",
    "視覚的階層をより明確にするため、見出しサイズの差を拡大",
    "革新的な要素（マイクロインタラクション等）の追加を検討"
  ]
}
`;

export async function evaluateUIV1(request: V1EvaluationRequest): Promise<V1EvaluationResponse> {
  try {
    const message = `
# デザイン情報
タイトル: ${request.title}
説明: ${request.description}
${request.structureNote ? `設計意図: ${request.structureNote}` : ''}
${request.figmaLink ? `Figmaリンク: ${request.figmaLink}` : ''}

${V1_EVALUATION_PROMPT}
`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.7,
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
      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    }

    throw new Error('Invalid response format');
  } catch (error) {
    console.error('V1 AI evaluation error:', error);
    throw new Error('V1評価の生成に失敗しました');
  }
}

export function calculateAverageScore(scores: V1EvaluationScores): number {
  const values = Object.values(scores);
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / values.length) * 10) / 10;
}