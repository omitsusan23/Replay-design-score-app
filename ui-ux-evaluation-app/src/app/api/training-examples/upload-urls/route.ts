import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateMultipleUIImages } from '@/libs/claude-eval';
import { saveClaudeEvaluationsToDatabase } from '@/libs/save-to-db';

interface URLUploadRequest {
  projectName: string;
  imageUrls: string[];
  uploadMode: 'images' | 'zip';
  uploadInfo?: {
    successCount: number;
    failureCount: number;
    errors: string[];
    zipExtractionInfo?: {
      totalFiles: number;
      extractedCount: number;
      skippedCount: number;
      extractionErrors: string[];
    };
  };
}

interface ProcessResult {
  success: boolean;
  savedCount: number;
  totalImages: number;
  uploadMode: string;
  evaluationResults?: any;
  saveResults?: any;
  errors: string[];
}

export async function POST(request: NextRequest) {
  const errors: string[] = [];
  
  try {
    // 環境変数チェック
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    // デバッグ用ログ（本番環境では削除）
    console.log('Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasAnthropicKey: !!anthropicApiKey
    });
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Supabase設定が不完全です',
        debug: {
          hasSupabaseUrl: !!supabaseUrl,
          hasServiceKey: !!supabaseServiceKey
        }
      }, { status: 500 });
    }

    if (!anthropicApiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Claude API設定が不完全です' 
      }, { status: 500 });
    }

    // Supabaseクライアント初期化
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // リクエストボディの取得（JSON形式）
    const requestData: URLUploadRequest = await request.json();
    const { projectName, imageUrls, uploadMode, uploadInfo } = requestData;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    let user = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      
      if (!authError && authUser) {
        user = authUser;
      }
    }

    // 認証が必要
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: '認証が必要です。ログインしてください。' 
      }, { status: 401 });
    }

    // 入力検証
    if (!projectName || !projectName.trim()) {
      return NextResponse.json({ 
        success: false, 
        error: 'プロジェクト名が必要です' 
      }, { status: 400 });
    }

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: '画像URLが必要です' 
      }, { status: 400 });
    }

    // URL形式の検証
    const invalidUrls = imageUrls.filter(url => {
      try {
        new URL(url);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `無効なURL形式が含まれています: ${invalidUrls.slice(0, 3).join(', ')}${invalidUrls.length > 3 ? '...' : ''}` 
      }, { status: 400 });
    }

    // アップロード制限チェック
    const { createTrainingExampleSaveService } = await import('@/libs/save-to-db');
    const saveService = createTrainingExampleSaveService(supabaseUrl, supabaseServiceKey);
    const dailyLimit = uploadMode === 'zip' ? 200 : 50;
    const limitCheck = await saveService.checkUserUploadLimit(user.id, dailyLimit);
    
    if (!limitCheck.canUpload || limitCheck.remaining < imageUrls.length) {
      return NextResponse.json({ 
        success: false, 
        error: `1日のアップロード制限を超過しています。残り: ${limitCheck.remaining}枚（${uploadMode === 'zip' ? 'Zip' : '個別'}モード: ${dailyLimit}枚/日）` 
      }, { status: 429 });
    }

    const result: ProcessResult = {
      success: false,
      savedCount: 0,
      totalImages: imageUrls.length,
      uploadMode,
      errors: []
    };

    console.log(`Starting Claude evaluation of ${imageUrls.length} images (${uploadMode} mode)...`);

    // Claude APIで各画像を評価（並列処理）
    const evaluationResults = await evaluateMultipleUIImages(
      imageUrls,
      projectName.trim()
    );

    result.evaluationResults = evaluationResults;

    if (evaluationResults.successCount === 0) {
      errors.push('すべての画像のAI評価に失敗しました');
      // 評価失敗でも続行（デフォルト値で保存）
    }

    if (evaluationResults.failureCount > 0) {
      errors.push(`${evaluationResults.failureCount}枚の画像のAI評価に失敗しました`);
    }

    // 評価結果をtraining_examplesテーブルに保存
    console.log(`Saving ${evaluationResults.results.length} evaluation results...`);
    const saveResults = await saveClaudeEvaluationsToDatabase(
      evaluationResults.results,
      imageUrls,
      user.id,
      supabaseUrl,
      supabaseServiceKey
    );

    result.saveResults = saveResults;
    result.savedCount = saveResults.successCount;

    if (saveResults.successCount === 0) {
      errors.push('評価結果の保存に失敗しました');
      return NextResponse.json({ 
        success: false, 
        error: 'データベース保存に失敗しました',
        details: errors
      }, { status: 500 });
    }

    if (saveResults.failureCount > 0) {
      errors.push(`${saveResults.failureCount}件の評価結果の保存に失敗しました`);
    }

    // 処理完了
    result.success = true;
    result.errors = errors;

    // アップロード情報をレスポンスに含める
    let responseDetails: any = {
      evaluation: {
        success: evaluationResults.successCount,
        failed: evaluationResults.failureCount
      },
      save: {
        success: saveResults.successCount,
        failed: saveResults.failureCount
      }
    };

    // クライアント側のアップロード情報を追加
    if (uploadInfo) {
      responseDetails.clientUpload = {
        success: uploadInfo.successCount,
        failed: uploadInfo.failureCount,
        errors: uploadInfo.errors
      };

      if (uploadInfo.zipExtractionInfo) {
        responseDetails.zipExtraction = uploadInfo.zipExtractionInfo;
      }
    }

    return NextResponse.json({
      success: true,
      message: `${result.savedCount}件の教師データを保存しました`,
      savedCount: result.savedCount,
      totalImages: result.totalImages,
      uploadMode,
      details: responseDetails,
      warnings: errors.length > 0 ? errors : undefined,
      savedIds: saveResults.savedIds
    });

  } catch (error) {
    console.error('Training examples URL upload API error:', error);
    
    return NextResponse.json({
      success: false,
      error: '教師データ処理でエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: '教師データURL処理API',
    description: '画像URLを受信してClaude評価・データベース保存を行います',
    methods: ['POST'],
    requestFormat: {
      projectName: 'プロジェクト名 (必須)',
      imageUrls: ['画像URL配列 (必須)'],
      uploadMode: 'images | zip',
      uploadInfo: {
        successCount: 'number',
        failureCount: 'number', 
        errors: ['string[]'],
        zipExtractionInfo: {
          totalFiles: 'number',
          extractedCount: 'number',
          skippedCount: 'number',
          extractionErrors: ['string[]']
        }
      }
    },
    requirements: {
      authentication: 'Bearer token required',
      contentType: 'application/json',
      dailyLimit: '50-200 images per user (depending on mode)'
    },
    process: [
      '1. 画像URLを受信・検証',
      '2. Claude APIで各画像を自動評価（並列処理）',
      '3. 評価結果をtraining_examplesテーブルに保存',
      '4. 管理者承認待ちステータスで保存'
    ],
    response: {
      success: 'boolean',
      savedCount: 'number',
      totalImages: 'number',
      uploadMode: 'string',
      details: 'process details',
      warnings: 'array of warnings if any',
      savedIds: 'array of saved record IDs'
    }
  });
}