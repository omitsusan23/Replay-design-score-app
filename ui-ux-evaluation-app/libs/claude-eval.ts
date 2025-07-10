import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface ClaudeEvaluationInput {
  imageUrl: string;
  projectName: string;
}

export interface ClaudeEvaluationResult {
  ui_type: string;
  structure_note: string;
  review_text: string;
  tags: string[];
}

export interface BatchEvaluationResult {
  success: boolean;
  results: ClaudeEvaluationResult[];
  successCount: number;
  failureCount: number;
  errors: string[];
}

export class ClaudeEvaluationService {
  private static readonly EVALUATION_PROMPT = `あなたはUI/UXの専門家です。
以下のUIスクリーンショットを観察し、次の4つを出力してください。

ui_type: UIの分類（例: LP, 設定画面, ダッシュボード等）

structure_note: このUIの構造的特徴や設計意図を簡潔に説明

review_text: このUIがどのように優れているかを構造的観点で講評してください

tags: ["構造優", "CTA優", "視認性良好"] など分類的なラベルを3〜5個出力

出力形式（JSON）:
{
  "ui_type": "...",
  "structure_note": "...",
  "review_text": "...",
  "tags": ["...", "..."]
}`;

  /**
   * 単一画像をClaudeで評価
   * @param input 評価入力データ
   * @returns 評価結果
   */
  static async evaluateSingleImage(input: ClaudeEvaluationInput): Promise<ClaudeEvaluationResult> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY が設定されていません');
      }

      const userMessage = `プロジェクト名: ${input.projectName}

${this.EVALUATION_PROMPT}`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022', // Vision対応モデル
        max_tokens: 1500,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: input.imageUrl
                }
              },
              {
                type: 'text',
                text: userMessage
              }
            ]
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // JSONブロックを抽出して解析
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]) as ClaudeEvaluationResult;
          
          // 結果の検証とクリーニング
          return this.validateAndCleanResult(result);
        } else {
          // JSONが見つからない場合の代替処理
          return this.parseAlternativeFormat(content.text);
        }
      }

      throw new Error('Claudeからの応答形式が無効です');

    } catch (error) {
      console.error('Claude evaluation error:', error);
      throw new Error(`Claude評価エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 複数画像を順次評価（APIレート制限を考慮）
   * @param inputs 評価入力データ配列
   * @param onProgress 進捗コールバック
   * @returns バッチ評価結果
   */
  static async evaluateMultipleImages(
    inputs: ClaudeEvaluationInput[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<BatchEvaluationResult> {
    const results: ClaudeEvaluationResult[] = [];
    const errors: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < inputs.length; i++) {
      try {
        // APIレート制限を考慮した待機時間
        if (i > 0) {
          await this.delay(1000); // 1秒待機
        }

        const result = await this.evaluateSingleImage(inputs[i]);
        results.push(result);
        successCount++;

        if (onProgress) {
          onProgress(i + 1, inputs.length);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`画像 ${i + 1}: ${errorMessage}`);
        failureCount++;

        // エラーが発生してもデフォルト値で継続
        results.push(this.createDefaultResult(inputs[i].projectName, i + 1));

        if (onProgress) {
          onProgress(i + 1, inputs.length);
        }
      }
    }

    return {
      success: successCount > 0,
      results,
      successCount,
      failureCount,
      errors
    };
  }

  /**
   * 評価結果の検証とクリーニング
   * @param result 生の評価結果
   * @returns クリーニング済み評価結果
   */
  private static validateAndCleanResult(result: any): ClaudeEvaluationResult {
    return {
      ui_type: this.cleanString(result.ui_type || 'その他'),
      structure_note: this.cleanString(result.structure_note || '構造的特徴の分析が困難です'),
      review_text: this.cleanString(result.review_text || '詳細な評価が困難です'),
      tags: this.cleanTags(result.tags || [])
    };
  }

  /**
   * JSON以外の形式の応答を解析
   * @param text Claude応答テキスト
   * @returns 評価結果
   */
  private static parseAlternativeFormat(text: string): ClaudeEvaluationResult {
    try {
      // キーワードベースでの抽出を試行
      const ui_type = this.extractValue(text, 'ui_type') || 'その他';
      const structure_note = this.extractValue(text, 'structure_note') || '構造的特徴の分析が困難です';
      const review_text = this.extractValue(text, 'review_text') || '詳細な評価が困難です';
      const tags = this.extractTags(text);

      return { ui_type, structure_note, review_text, tags };
    } catch (error) {
      console.error('Alternative format parsing error:', error);
      return this.createDefaultResult('不明', 1);
    }
  }

  /**
   * テキストから特定のキーの値を抽出
   * @param text テキスト
   * @param key キー
   * @returns 抽出された値
   */
  private static extractValue(text: string, key: string): string | null {
    const regex = new RegExp(`${key}[:\\s]*([^\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim().replace(/["\'],?$/, '') : null;
  }

  /**
   * テキストからタグを抽出
   * @param text テキスト
   * @returns タグ配列
   */
  private static extractTags(text: string): string[] {
    const tagMatch = text.match(/tags[:\s]*\[([\s\S]*?)\]/);
    if (tagMatch) {
      return tagMatch[1]
        .split(',')
        .map(tag => tag.trim().replace(/["\\']/g, ''))
        .filter(tag => tag.length > 0);
    }
    return ['自動分析'];
  }

  /**
   * 文字列のクリーニング
   * @param str 文字列
   * @returns クリーニング済み文字列
   */
  private static cleanString(str: string): string {
    return str.trim().replace(/^["']|["']$/g, '').substring(0, 500);
  }

  /**
   * タグ配列のクリーニング
   * @param tags タグ配列
   * @returns クリーニング済みタグ配列
   */
  private static cleanTags(tags: any[]): string[] {
    if (!Array.isArray(tags)) return ['自動分析'];
    
    return tags
      .filter(tag => typeof tag === 'string')
      .map(tag => this.cleanString(tag))
      .filter(tag => tag.length > 0)
      .slice(0, 5); // 最大5個
  }

  /**
   * デフォルト評価結果を作成
   * @param projectName プロジェクト名
   * @param index インデックス
   * @returns デフォルト結果
   */
  private static createDefaultResult(projectName: string, index: number): ClaudeEvaluationResult {
    return {
      ui_type: 'その他',
      structure_note: `${projectName} - 画像 ${index} の自動分析`,
      review_text: 'AI評価が困難でしたが、教師データとして保存されました。',
      tags: ['要確認', '手動評価推奨']
    };
  }

  /**
   * 待機処理
   * @param ms ミリ秒
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * APIキーの有効性をチェック
   * @returns API利用可能性
   */
  static async checkAPIAvailability(): Promise<boolean> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        return false;
      }

      // 簡単なテストリクエストでAPIキーをテスト
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      });

      return response.content.length > 0;
    } catch (error) {
      console.error('API availability check error:', error);
      return false;
    }
  }
}

/**
 * 便利関数：単一画像の評価
 * @param imageUrl 画像URL
 * @param projectName プロジェクト名
 * @returns 評価結果
 */
export async function evaluateUIImage(
  imageUrl: string, 
  projectName: string
): Promise<ClaudeEvaluationResult> {
  return await ClaudeEvaluationService.evaluateSingleImage({ imageUrl, projectName });
}

/**
 * 便利関数：複数画像の評価
 * @param imageUrls 画像URL配列
 * @param projectName プロジェクト名
 * @param onProgress 進捗コールバック
 * @returns 評価結果
 */
export async function evaluateMultipleUIImages(
  imageUrls: string[], 
  projectName: string,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchEvaluationResult> {
  const inputs = imageUrls.map(url => ({ imageUrl: url, projectName }));
  return await ClaudeEvaluationService.evaluateMultipleImages(inputs, onProgress);
}