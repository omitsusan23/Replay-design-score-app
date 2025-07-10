import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadTrainingImagesWithProgress } from '@/libs/supabase-upload';
import { evaluateMultipleUIImages } from '@/libs/claude-eval';
import { saveClaudeEvaluationsToDatabase } from '@/libs/save-to-db';

interface UploadProcessResult {
  success: boolean;
  savedCount: number;
  totalImages: number;
  uploadResults?: any;
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
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Supabase設定が不完全です' 
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

    // 認証が必要（ゲストアップロードは許可しない）
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: '認証が必要です。ログインしてください。' 
      }, { status: 401 });
    }

    // フォームデータの取得
    const formData = await request.formData();
    const projectName = formData.get('projectName') as string;
    
    // 画像ファイルを取得
    const imageFiles: File[] = [];
    let index = 0;
    while (true) {
      const file = formData.get(`images[${index}]`) as File;
      if (!file) break;
      imageFiles.push(file);
      index++;
    }

    // 入力検証
    if (!projectName || !projectName.trim()) {
      return NextResponse.json({ 
        success: false, 
        error: 'プロジェクト名が必要です' 
      }, { status: 400 });
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: '少なくとも1枚の画像が必要です' 
      }, { status: 400 });
    }

    if (imageFiles.length > 10) {
      return NextResponse.json({ 
        success: false, 
        error: '一度にアップロードできる画像は最大10枚です' 
      }, { status: 400 });
    }

    // アップロード制限チェック
    const { createTrainingExampleSaveService } = await import('@/libs/save-to-db');
    const saveService = createTrainingExampleSaveService(supabaseUrl, supabaseServiceKey);
    const limitCheck = await saveService.checkUserUploadLimit(user.id, 50);
    
    if (!limitCheck.canUpload || limitCheck.remaining < imageFiles.length) {
      return NextResponse.json({ 
        success: false, 
        error: `1日のアップロード制限を超過しています。残り: ${limitCheck.remaining}枚` 
      }, { status: 429 });
    }

    const result: UploadProcessResult = {
      success: false,
      savedCount: 0,
      totalImages: imageFiles.length,
      errors: []
    };

    // 1. 画像をSupabase Storageにアップロード
    console.log(`Starting upload of ${imageFiles.length} images...`);
    const uploadResults = await uploadTrainingImagesWithProgress(
      imageFiles,
      user.id,
      supabaseUrl,
      supabaseServiceKey
    );

    result.uploadResults = uploadResults;

    if (uploadResults.successCount === 0) {
      errors.push('すべての画像のアップロードに失敗しました');
      return NextResponse.json({ 
        success: false, 
        error: '画像のアップロードに失敗しました',
        details: uploadResults.results.map(r => r.error).filter(Boolean)
      }, { status: 500 });
    }

    // アップロード成功した画像のURLを取得
    const successfulUploads = uploadResults.results.filter(r => r.success && r.url);
    const imageUrls = successfulUploads.map(r => r.url!);

    if (uploadResults.failureCount > 0) {
      errors.push(`${uploadResults.failureCount}枚の画像のアップロードに失敗しました`);
    }

    // 2. Claude APIで各画像を評価
    console.log(`Starting Claude evaluation of ${imageUrls.length} images...`);
    const evaluationResults = await evaluateMultipleUIImages(
      imageUrls,
      projectName.trim()
    );

    result.evaluationResults = evaluationResults;

    if (evaluationResults.successCount === 0) {
      errors.push('すべての画像のAI評価に失敗しました');
      // 画像は既にアップロード済みなので、デフォルト評価で進める
    }

    if (evaluationResults.failureCount > 0) {
      errors.push(`${evaluationResults.failureCount}枚の画像のAI評価に失敗しました`);
    }

    // 3. 評価結果をtraining_examplesテーブルに保存
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

    return NextResponse.json({
      success: true,
      message: `${result.savedCount}件の教師データを保存しました`,
      savedCount: result.savedCount,
      totalImages: result.totalImages,
      details: {
        upload: {
          success: uploadResults.successCount,
          failed: uploadResults.failureCount
        },
        evaluation: {
          success: evaluationResults.successCount,
          failed: evaluationResults.failureCount
        },
        save: {
          success: saveResults.successCount,
          failed: saveResults.failureCount
        }
      },
      warnings: errors.length > 0 ? errors : undefined,
      savedIds: saveResults.savedIds
    });

  } catch (error) {
    console.error('Training examples upload API error:', error);
    
    return NextResponse.json({
      success: false,
      error: '教師データアップロード処理でエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: '教師データアップロードAPI',
    description: '複数画像の一括アップロード、Claude評価、データベース保存を行います',
    methods: ['POST'],
    parameters: {
      projectName: 'プロジェクト名 (必須)',
      'images[0]': '画像ファイル1 (必須)',
      'images[1]': '画像ファイル2 (任意)',
      '...': '最大10枚まで'
    },
    requirements: {
      authentication: 'Bearer token required',
      fileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxFileSize: '10MB per image',
      maxFiles: 10,
      dailyLimit: '50 images per user'
    },
    process: [
      '1. 画像をSupabase Storageにアップロード',
      '2. Claude APIで各画像を自動評価',
      '3. 評価結果をtraining_examplesテーブルに保存',
      '4. 管理者承認待ちステータスで保存'
    ],
    response: {
      success: 'boolean',
      savedCount: 'number',
      totalImages: 'number',
      details: 'process details',
      warnings: 'array of warnings if any',
      savedIds: 'array of saved record IDs'
    }
  });
}