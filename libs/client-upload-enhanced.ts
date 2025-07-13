// Enhanced upload client with Claude evaluation and OpenAI vectorization
import { ClientUploadService } from './client-upload';

interface EnhancedUploadOptions {
  enableRAG?: boolean;
  enableVectorization?: boolean;
  onStageChange?: (stage: 'uploading' | 'evaluating' | 'vectorizing' | 'completed') => void;
  onProgress?: (completed: number, total: number, stage: string) => void;
}

interface EnhancedUploadResult {
  success: boolean;
  uploadResult: any;
  evaluationResult?: any;
  vectorizationResult?: any;
  errors: string[];
}

export class EnhancedUploadService {
  
  /**
   * 統合アップロード処理：アップロード → Claude評価 → OpenAIベクトル化
   */
  static async uploadWithEvaluationAndVectorization(
    files: File[],
    projectName: string,
    options: EnhancedUploadOptions = {}
  ): Promise<EnhancedUploadResult> {
    
    const {
      enableRAG = true,
      enableVectorization = true,
      onStageChange,
      onProgress
    } = options;

    const result: EnhancedUploadResult = {
      success: false,
      uploadResult: null,
      errors: []
    };

    try {
      // ユーザー認証確認
      const user = await ClientUploadService.getCurrentUser();
      if (!user) {
        throw new Error('ログインが必要です');
      }

      const session = await ClientUploadService.getCurrentSession();
      const token = session?.access_token;

      // Stage 1: ファイルアップロード
      onStageChange?.('uploading');
      onProgress?.(0, files.length, 'アップロード中');

      const { uploadImages } = await import('./client-upload');
      const uploadResult = await uploadImages(
        files,
        user.id,
        (completed, total) => onProgress?.(completed, total, 'アップロード中')
      );

      if (!uploadResult.success) {
        throw new Error(`アップロードエラー: ${uploadResult.errors.join(', ')}`);
      }

      result.uploadResult = uploadResult;
      const imageUrls = uploadResult.imageUrls;

      if (imageUrls.length === 0) {
        throw new Error('アップロードされた画像がありません');
      }

      // Stage 2: Claude AI評価
      onStageChange?.('evaluating');
      onProgress?.(0, imageUrls.length, 'Claude AI評価中');

      const evaluationResponse = await fetch('/api/training-examples/upload-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          projectName,
          imageUrls,
          uploadMode: 'images',
          uploadInfo: {
            successCount: uploadResult.successCount,
            failureCount: uploadResult.failureCount,
            errors: uploadResult.errors
          }
        })
      });

      if (!evaluationResponse.ok) {
        const errorData = await evaluationResponse.json();
        throw new Error(`Claude評価エラー: ${errorData.error}`);
      }

      const evaluationResult = await evaluationResponse.json();
      result.evaluationResult = evaluationResult;

      onProgress?.(imageUrls.length, imageUrls.length, 'Claude AI評価完了');

      // Stage 3: OpenAI ベクトル化（RAG有効時のみ）
      if (enableRAG && enableVectorization) {
        onStageChange?.('vectorizing');
        onProgress?.(0, imageUrls.length, 'OpenAI ベクトル化中');

        const vectorizationResponse = await fetch('/api/generate-embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({
            projectName,
            imageUrls,
            uploadMode: 'images',
            evaluationData: evaluationResult.evaluationData, // Claude評価結果を渡す
            additionalContext: {
              uploadResult,
              evaluationResult
            }
          })
        });

        if (!vectorizationResponse.ok) {
          const vectorError = await vectorizationResponse.json();
          // ベクトル化エラーは警告として処理（評価は成功しているため）
          result.errors.push(`ベクトル化警告: ${vectorError.error}`);
          console.warn('ベクトル化エラー:', vectorError);
        } else {
          const vectorizationResult = await vectorizationResponse.json();
          result.vectorizationResult = vectorizationResult;
          onProgress?.(imageUrls.length, imageUrls.length, 'ベクトル化完了');
        }
      }

      // Stage 4: 完了
      onStageChange?.('completed');
      result.success = true;

      return result;

    } catch (error) {
      console.error('Enhanced upload error:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Zipファイル用の統合アップロード処理
   */
  static async uploadZipWithEvaluationAndVectorization(
    zipFile: File,
    projectName: string,
    options: EnhancedUploadOptions = {}
  ): Promise<EnhancedUploadResult> {
    
    const {
      enableRAG = true,
      enableVectorization = true,
      onStageChange,
      onProgress
    } = options;

    const result: EnhancedUploadResult = {
      success: false,
      uploadResult: null,
      errors: []
    };

    try {
      // ユーザー認証確認
      const user = await ClientUploadService.getCurrentUser();
      if (!user) {
        throw new Error('ログインが必要です');
      }

      const session = await ClientUploadService.getCurrentSession();
      const token = session?.access_token;

      // Stage 1: Zipファイルアップロード・展開
      onStageChange?.('uploading');
      onProgress?.(0, 1, 'Zipファイル処理中');

      const { uploadZip } = await import('./client-upload');
      const uploadResult = await uploadZip(
        zipFile,
        user.id,
        (completed, total) => onProgress?.(completed, total, 'ZIP展開中')
      );

      if (!uploadResult.success) {
        throw new Error(`Zipアップロードエラー: ${uploadResult.errors.join(', ')}`);
      }

      result.uploadResult = uploadResult;
      const imageUrls = uploadResult.imageUrls;

      if (imageUrls.length === 0) {
        throw new Error('Zipから画像が抽出できませんでした');
      }

      // Stage 2: Claude AI評価
      onStageChange?.('evaluating');
      onProgress?.(0, imageUrls.length, 'Claude AI評価中');

      const evaluationResponse = await fetch('/api/training-examples/upload-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          projectName,
          imageUrls,
          uploadMode: 'zip',
          uploadInfo: {
            successCount: uploadResult.successCount,
            failureCount: uploadResult.failureCount,
            errors: uploadResult.errors,
            zipExtractionInfo: uploadResult.zipExtractionInfo
          }
        })
      });

      if (!evaluationResponse.ok) {
        const errorData = await evaluationResponse.json();
        throw new Error(`Claude評価エラー: ${errorData.error}`);
      }

      const evaluationResult = await evaluationResponse.json();
      result.evaluationResult = evaluationResult;

      // Stage 3: OpenAI ベクトル化（RAG有効時のみ）
      if (enableRAG && enableVectorization) {
        onStageChange?.('vectorizing');
        onProgress?.(0, imageUrls.length, 'OpenAI ベクトル化中');

        const vectorizationResponse = await fetch('/api/generate-embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({
            projectName,
            imageUrls,
            uploadMode: 'zip',
            evaluationData: evaluationResult.evaluationData,
            additionalContext: {
              uploadResult,
              evaluationResult
            }
          })
        });

        if (!vectorizationResponse.ok) {
          const vectorError = await vectorizationResponse.json();
          result.errors.push(`ベクトル化警告: ${vectorError.error}`);
        } else {
          const vectorizationResult = await vectorizationResponse.json();
          result.vectorizationResult = vectorizationResult;
        }
      }

      // Stage 4: 完了
      onStageChange?.('completed');
      result.success = true;

      return result;

    } catch (error) {
      console.error('Enhanced zip upload error:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }
}