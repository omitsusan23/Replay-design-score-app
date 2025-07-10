'use client';

import { createClient } from '@supabase/supabase-js';
import { extractImagesFromZip } from './zip-extractor';

// クライアント側のSupabaseクライアント（シングルトン）
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabase;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  fileName?: string;
  error?: string;
}

export interface BatchUploadResult {
  success: boolean;
  results: UploadResult[];
  successCount: number;
  failureCount: number;
  imageUrls: string[];
  errors: string[];
}

export interface ZipUploadResult extends BatchUploadResult {
  zipExtractionInfo: {
    totalFiles: number;
    extractedCount: number;
    skippedCount: number;
    extractionErrors: string[];
  };
}

export class ClientUploadService {
  private static readonly BUCKET_NAME = 'training-images';
  
  /**
   * 単一ファイルをSupabase Storageに直接アップロード
   * @param file アップロードするファイル
   * @param userId ユーザーID
   * @param customFileName カスタムファイル名（オプション）
   * @returns アップロード結果
   */
  static async uploadSingleFile(
    file: File, 
    userId: string,
    customFileName?: string
  ): Promise<UploadResult> {
    try {
      // ファイル名を生成（重複回避）
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const extension = file.name.split('.').pop();
      const fileName = customFileName || `${userId}/${timestamp}_${randomId}.${extension}`;

      // Supabase Storageにアップロード
      const { data, error } = await getSupabaseClient().storage
        .from(this.BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return {
          success: false,
          error: `アップロードエラー: ${error.message}`
        };
      }

      // パブリックURLを取得
      const { data: publicData } = getSupabaseClient().storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);

      return {
        success: true,
        url: publicData.publicUrl,
        fileName: fileName
      };

    } catch (error) {
      console.error('Upload service error:', error);
      return {
        success: false,
        error: `アップロード処理エラー: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 複数画像ファイルを並列アップロード
   * @param files 画像ファイル配列
   * @param userId ユーザーID
   * @param onProgress 進捗コールバック
   * @returns バッチアップロード結果
   */
  static async uploadMultipleImages(
    files: File[],
    userId: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<BatchUploadResult> {
    const results: UploadResult[] = [];
    const imageUrls: string[] = [];
    const errors: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    console.log(`Starting upload of ${files.length} images to Supabase Storage`);

    // 並列アップロード（3つずつのバッチ）
    const batchSize = 3;
    const batches = this.chunkArray(files, batchSize);
    let completedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        // バッチ内で並列処理
        const batchPromises = batch.map(async (file, indexInBatch) => {
          const globalIndex = batchIndex * batchSize + indexInBatch;
          return await this.uploadSingleFile(file, userId, 
            `${userId}/${Date.now()}_${globalIndex}_${file.name}`
          );
        });

        // バッチ処理実行
        const batchResults = await Promise.all(batchPromises);
        
        // 結果を集計
        batchResults.forEach((result) => {
          results.push(result);
          if (result.success && result.url) {
            imageUrls.push(result.url);
            successCount++;
          } else {
            failureCount++;
            if (result.error) errors.push(result.error);
          }
        });

        completedCount += batch.length;

        // 進捗報告
        if (onProgress) {
          onProgress(completedCount, files.length);
        }

        console.log(`Batch ${batchIndex + 1}/${batches.length} uploaded: ${batch.length} images`);

        // バッチ間の短い待機
        if (batchIndex < batches.length - 1) {
          await this.delay(500);
        }

      } catch (error) {
        console.error(`Upload batch ${batchIndex + 1} error:`, error);
        
        // バッチ全体がエラーの場合
        batch.forEach((file) => {
          results.push({
            success: false,
            error: `バッチアップロードエラー: ${file.name}`
          });
          errors.push(`${file.name}: バッチアップロードエラー`);
          failureCount++;
        });

        completedCount += batch.length;
        if (onProgress) {
          onProgress(completedCount, files.length);
        }
      }
    }

    console.log(`Upload completed: ${successCount} successful, ${failureCount} failed`);

    return {
      success: successCount > 0,
      results,
      successCount,
      failureCount,
      imageUrls,
      errors
    };
  }

  /**
   * Zipファイルを解凍してSupabase Storageにアップロード
   * @param zipFile Zipファイル
   * @param userId ユーザーID
   * @param onProgress 進捗コールバック
   * @returns Zipアップロード結果
   */
  static async uploadZipFile(
    zipFile: File,
    userId: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<ZipUploadResult> {
    try {
      console.log(`Processing zip file: ${zipFile.name} (${zipFile.size} bytes)`);

      // フロントエンドでZipファイルを解凍
      const { files: extractedFiles, result: extractionResult } = await extractImagesFromZip(zipFile);

      if (!extractionResult.success || extractedFiles.length === 0) {
        return {
          success: false,
          results: [],
          successCount: 0,
          failureCount: 0,
          imageUrls: [],
          errors: extractionResult.errors,
          zipExtractionInfo: {
            totalFiles: extractionResult.totalFiles,
            extractedCount: extractionResult.extractedCount,
            skippedCount: extractionResult.skippedCount,
            extractionErrors: extractionResult.errors
          }
        };
      }

      console.log(`Zip extraction successful: ${extractedFiles.length} images extracted`);

      // 抽出された画像をSupabase Storageにアップロード
      const uploadResult = await this.uploadMultipleImages(
        extractedFiles,
        userId,
        onProgress
      );

      // Zip情報を追加して返す
      return {
        ...uploadResult,
        zipExtractionInfo: {
          totalFiles: extractionResult.totalFiles,
          extractedCount: extractionResult.extractedCount,
          skippedCount: extractionResult.skippedCount,
          extractionErrors: extractionResult.errors
        }
      };

    } catch (error) {
      console.error('Zip upload error:', error);
      return {
        success: false,
        results: [],
        successCount: 0,
        failureCount: 1,
        imageUrls: [],
        errors: [`Zipファイル処理エラー: ${error instanceof Error ? error.message : 'Unknown error'}`],
        zipExtractionInfo: {
          totalFiles: 0,
          extractedCount: 0,
          skippedCount: 0,
          extractionErrors: [`処理エラー: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }
      };
    }
  }

  /**
   * ユーザー認証状態を確認
   * @returns ユーザー情報
   */
  static async getCurrentUser() {
    const { data: { user }, error } = await getSupabaseClient().auth.getUser();
    if (error) {
      console.error('Auth error:', error);
      return null;
    }
    return user;
  }

  /**
   * 現在のセッション情報を取得
   * @returns セッション情報
   */
  static async getCurrentSession() {
    const { data: { session }, error } = await getSupabaseClient().auth.getSession();
    if (error) {
      console.error('Session error:', error);
      return null;
    }
    return session;
  }

  /**
   * 配列を指定サイズのチャンクに分割
   * @param array 分割する配列
   * @param size チャンクサイズ
   * @returns チャンク配列
   */
  private static chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 待機処理
   * @param ms ミリ秒
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Supabase Storage接続テスト
   * @returns 接続可能かどうか
   */
  static async testStorageConnection(): Promise<boolean> {
    try {
      const { data, error } = await getSupabaseClient().storage.listBuckets();
      if (error) {
        console.error('Storage connection test failed:', error);
        return false;
      }
      return data.some(bucket => bucket.name === this.BUCKET_NAME);
    } catch (error) {
      console.error('Storage connection test error:', error);
      return false;
    }
  }
}

/**
 * 便利関数：複数画像の直接アップロード
 * @param files 画像ファイル配列
 * @param userId ユーザーID
 * @param onProgress 進捗コールバック
 * @returns アップロード結果
 */
export async function uploadImages(
  files: File[],
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchUploadResult> {
  return await ClientUploadService.uploadMultipleImages(files, userId, onProgress);
}

/**
 * 便利関数：Zipファイルの直接アップロード
 * @param zipFile Zipファイル
 * @param userId ユーザーID
 * @param onProgress 進捗コールバック
 * @returns アップロード結果
 */
export async function uploadZip(
  zipFile: File,
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<ZipUploadResult> {
  return await ClientUploadService.uploadZipFile(zipFile, userId, onProgress);
}