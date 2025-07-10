import { Anthropic } from '@anthropic-ai/sdk';
import { TrainingExample } from './rag-search.service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface RAGEvaluationRequest {
  projectName: string;
  description?: string;
  structureNote?: string;
  figmaUrl?: string;
  imageUrl?: string;
  trainingExamples: TrainingExample[];
}

export interface RAGEvaluationResult {
  ui_type: string;
  score_aesthetic: number;
  score_usability: number;
  score_alignment: number;
  score_accessibility: number;
  score_consistency: number;
  total_score: number;
  review_text: string;
  confidence_score: number; // RAGによる評価の信頼度
  reference_examples: string[]; // 参考にした教師データのID
}

export class RAGClaudePromptService {
  /**
   * RAG対応のClaudeプロンプトを生成
   * @param request 評価リクエスト
   * @returns 構造化されたプロンプト
   */
  static generateRAGPrompt(request: RAGEvaluationRequest): string {
    const trainingExamplesText = this.formatTrainingExamples(request.trainingExamples);
    
    return `あなたは経験豊富なプロのUI/UXデザイン評価者です。
以下の教師データ（過去の優良な評価例）を参考にして、提出されたUIデザインを一貫性のある基準で評価してください。

## 📚 教師データ（参考評価例）
${trainingExamplesText}

## 🎯 評価対象UI
**プロジェクト名**: ${request.projectName}
**説明・意図**: ${request.description || 'なし'}
**設計意図（構造メモ）**: ${request.structureNote || 'なし'}
${request.figmaUrl ? `**Figma URL**: ${request.figmaUrl}` : ''}
${request.imageUrl ? `**添付画像**: [画像を確認]` : ''}

## 📋 評価指針
1. **教師データとの一貫性**: 上記の参考例と同様の評価基準を適用してください
2. **相対的評価**: 教師データのスコア傾向を踏まえ、適切な点数をつけてください
3. **具体的根拠**: 評価の理由を教師データの例と比較しながら説明してください
4. **建設的フィードバック**: 改善点を具体的に指摘してください

## 📊 評価項目（各項目0.0〜10.0の小数点スコア）
- **score_aesthetic**: 視覚的インパクト・美的完成度
- **score_usability**: 使いやすさ・操作性・情報設計
- **score_alignment**: グリッド整列・レイアウトの整合性
- **score_accessibility**: アクセシビリティ・包摂性
- **score_consistency**: デザイン言語の一貫性・再利用性

## 🎯 出力フォーマット
以下のJSON形式で必ず回答してください：

\`\`\`json
{
  "ui_type": "LP|Dashboard|Form|Mobile App|E-commerce|その他",
  "score_aesthetic": 0.0,
  "score_usability": 0.0,
  "score_alignment": 0.0,
  "score_accessibility": 0.0,
  "score_consistency": 0.0,
  "total_score": 0.00,
  "review_text": "教師データと比較した評価コメント。具体的な改善点と良い点を記載。",
  "confidence_score": 0.0,
  "reference_examples": ["参考にした教師データのID1", "ID2", "ID3"]
}
\`\`\`

**重要**: 教師データの評価傾向を必ず参考にし、一貫性のある評価を行ってください。`;
  }

  /**
   * 教師データをプロンプト用にフォーマット
   * @param examples 教師データ配列
   * @returns フォーマット済みテキスト
   */
  private static formatTrainingExamples(examples: TrainingExample[]): string {
    if (examples.length === 0) {
      return '※ 関連する教師データが見つかりませんでした。一般的なUI/UX評価基準に基づいて評価してください。';
    }

    return examples.map((example, index) => {
      const exampleJson = {
        id: example.id,
        ui_type: example.ui_type,
        structure_note: example.structure_note,
        scores: {
          aesthetic: example.score_aesthetic,
          usability: example.score_usability,
          alignment: example.score_alignment,
          accessibility: example.score_accessibility,
          consistency: example.score_consistency,
          total: example.total_score
        },
        review_text: example.review_text
      };

      return `### 参考例 ${index + 1}
\`\`\`json
${JSON.stringify(exampleJson, null, 2)}
\`\`\``;
    }).join('\n\n');
  }

  /**
   * RAG対応のUI評価を実行
   * @param request 評価リクエスト
   * @returns 評価結果
   */
  static async evaluateWithRAG(request: RAGEvaluationRequest): Promise<RAGEvaluationResult> {
    try {
      const systemPrompt = this.generateRAGPrompt(request);
      
      let userMessage = `UIデザインの評価をお願いします。教師データを参考に一貫性のある評価を行ってください。

プロジェクト: ${request.projectName}`;

      if (request.structureNote) {
        userMessage += `\n設計意図: ${request.structureNote}`;
      }

      const response = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 2000,
        temperature: 0.2, // RAGでは低い温度で一貫性を重視
        system: systemPrompt,
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
                text: userMessage
              }
            ] : userMessage
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // JSONブロックを抽出
        const jsonMatch = content.text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[1]) as RAGEvaluationResult;
          
          // total_scoreを再計算（念のため）
          result.total_score = Number(
            ((result.score_aesthetic + 
              result.score_usability + 
              result.score_alignment + 
              result.score_accessibility + 
              result.score_consistency) / 5).toFixed(2)
          );
          
          return result;
        }
      }

      throw new Error('Invalid response format from Claude');
    } catch (error) {
      console.error('RAG evaluation error:', error);
      throw new Error('RAG評価中にエラーが発生しました');
    }
  }

  /**
   * 簡略版：教師データなしでの評価（フォールバック）
   * @param request 基本的な評価リクエスト
   * @returns 評価結果
   */
  static async evaluateWithoutRAG(request: Omit<RAGEvaluationRequest, 'trainingExamples'>): Promise<RAGEvaluationResult> {
    const fallbackRequest: RAGEvaluationRequest = {
      ...request,
      trainingExamples: []
    };
    
    return this.evaluateWithRAG(fallbackRequest);
  }

  /**
   * 教師データの品質スコアを計算
   * @param examples 教師データ配列
   * @returns 品質スコア（0-1）
   */
  static calculateTrainingDataQuality(examples: TrainingExample[]): number {
    if (examples.length === 0) return 0;

    // 多様性とスコア分布を考慮した品質計算
    const avgScore = examples.reduce((sum, ex) => sum + ex.total_score, 0) / examples.length;
    const uiTypeVariety = new Set(examples.map(ex => ex.ui_type)).size;
    const scoreVariance = examples.reduce((sum, ex) => sum + Math.pow(ex.total_score - avgScore, 2), 0) / examples.length;
    
    const qualityScore = Math.min(1.0, 
      (avgScore / 10) * 0.5 +  // 平均スコアの貢献
      (uiTypeVariety / 3) * 0.3 +  // 多様性の貢献
      (1 - Math.min(scoreVariance / 4, 1)) * 0.2  // 適度なばらつきの貢献
    );
    
    return Math.round(qualityScore * 100) / 100;
  }
}

/**
 * RAGプロンプトテンプレート定数
 */
export const RAG_PROMPT_TEMPLATES = {
  // 基本のRAGプロンプト
  basic: `あなたはプロのUI/UX評価者です。
以下の教師データと、提出されたUIに基づいて、評価スコアと講評を出力してください。
教師データの傾向を踏まえ、一貫性ある評価を行ってください。

■ 教師データ（参考UI）:
{training_examples}

■ 評価対象UI:
プロジェクト名: {project_name}
設計意図: {structure_note}
Figma URL: {figma_url}
添付画像: [画像]

■ 出力フォーマット:
{output_format}`,

  // 厳格評価用
  strict: `あなたは業界標準に準拠した厳格なUI/UX評価者です。
以下の高品質な教師データを基準として、提出UIを厳密に評価してください。

{training_examples}

評価対象: {project_name}
{additional_context}

厳格な基準で以下のフォーマットで回答してください:
{output_format}`,

  // 教育的フィードバック用
  educational: `あなたは教育者として、学習者のUI設計を建設的に評価してください。
以下の優良例を参考に、具体的な改善指導を含めた評価を行ってください。

参考例:
{training_examples}

学習者の作品: {project_name}
{additional_context}

教育的観点で以下のフォーマットで評価してください:
{output_format}`
};