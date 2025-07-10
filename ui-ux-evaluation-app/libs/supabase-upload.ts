import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  fileName?: string;
}

export interface BatchUploadResult {
  success: boolean;
  results: UploadResult[];
  successCount: number;
  failureCount: number;
}

export class SupabaseUploadService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * 単一画像をSupabase Storageにアップロード
   * @param file アップロードするファイル
   * @param userId ユーザーID
   * @param bucketName バケット名（デフォルト: training-images）
   * @returns アップロード結果
   */
  async uploadSingleImage(
    file: File, 
    userId: string, 
    bucketName: string = 'training-images'
  ): Promise<UploadResult> {
    try {
      // ファイル名の生成（重複回避）
      const fileExt = file.name.split('.').pop();
      const fileName = `training_examples/${userId}/${randomUUID()}.${fileExt}`;

      // ファイルサイズ検証（10MB制限）
      if (file.size > 10 * 1024 * 1024) {
        return {
          success: false,
          error: 'ファイルサイズが10MBを超えています',
          fileName
        };
      }

      // ファイルタイプ検証
      if (!file.type.startsWith('image/')) {
        return {
          success: false,
          error: 'サポートされていないファイル形式です',
          fileName
        };
      }

      // Supabase Storageにアップロード
      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return {
          success: false,
          error: `アップロードエラー: ${error.message}`,
          fileName
        };
      }

      // 公開URLの取得
      const { data: { publicUrl } } = this.supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return {
        success: true,
        url: publicUrl,
        fileName
      };

    } catch (error) {
      console.error('Upload service error:', error);
      return {
        success: false,
        error: 'アップロード処理でエラーが発生しました',
        fileName: file.name
      };
    }
  }

  /**
   * 複数画像を並列でアップロード
   * @param files アップロードするファイル配列
   * @param userId ユーザーID
   * @param bucketName バケット名
   * @returns バッチアップロード結果
   */
  async uploadMultipleImages(
    files: File[], 
    userId: string, 
    bucketName: string = 'training-images'
  ): Promise<BatchUploadResult> {
    try {
      // 並列アップロード実行
      const uploadPromises = files.map(file => 
        this.uploadSingleImage(file, userId, bucketName)
      );

      const results = await Promise.all(uploadPromises);
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      return {
        success: successCount > 0,
        results,
        successCount,
        failureCount
      };

    } catch (error) {
      console.error('Batch upload error:', error);
      return {
        success: false,
        results: files.map(file => ({
          success: false,
          error: 'バッチアップロードでエラーが発生しました',
          fileName: file.name
        })),
        successCount: 0,
        failureCount: files.length
      };
    }
  }

  /**
   * ストレージからファイルを削除
   * @param fileName ファイル名（パス込み）
   * @param bucketName バケット名
   * @returns 削除結果
   */
  async deleteImage(fileName: string, bucketName: string = 'training-images'): Promise<boolean> {
    try {
      const { error } = await this.supabase.storage
        .from(bucketName)
        .remove([fileName]);

      if (error) {
        console.error('Delete error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Delete service error:', error);
      return false;
    }
  }

  /**
   * ユーザーのアップロード容量制限チェック
   * @param userId ユーザーID
   * @param bucketName バケット名
   * @returns 容量情報
   */
  async checkUserStorageUsage(userId: string, bucketName: string = 'training-images') {
    try {
      const { data: files, error } = await this.supabase.storage
        .from(bucketName)
        .list(`training_examples/${userId}`);

      if (error) {
        console.error('Storage usage check error:', error);
        return { totalSize: 0, fileCount: 0, error: error.message };
      }

      const totalSize = files?.reduce((sum, file) => sum + (file.metadata?.size || 0), 0) || 0;
      const fileCount = files?.length || 0;

      return {
        totalSize,
        fileCount,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
      };
    } catch (error) {
      console.error('Storage usage service error:', error);
      return { totalSize: 0, fileCount: 0, error: 'ストレージ使用量の確認に失敗しました' };
    }
  }

  /**
   * バケットが存在するかチェック
   * @param bucketName バケット名
   * @returns バケット存在状況
   */
  async checkBucketExists(bucketName: string = 'training-images'): Promise<boolean> {
    try {
      const { data: buckets, error } = await this.supabase.storage.listBuckets();
      
      if (error) {
        console.error('Bucket check error:', error);
        return false;
      }

      return buckets?.some(bucket => bucket.name === bucketName) || false;
    } catch (error) {
      console.error('Bucket check service error:', error);
      return false;
    }
  }

  /**
   * バケットを作成（必要に応じて）
   * @param bucketName バケット名
   * @returns 作成結果
   */
  async createBucketIfNotExists(bucketName: string = 'training-images'): Promise<boolean> {
    try {
      const exists = await this.checkBucketExists(bucketName);
      if (exists) return true;

      const { error } = await this.supabase.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        fileSizeLimit: 10 * 1024 * 1024 // 10MB
      });

      if (error) {
        console.error('Bucket creation error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Bucket creation service error:', error);
      return false;
    }
  }
}

/**
 * Supabaseアップロードサービスのファクトリー関数
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @returns SupabaseUploadServiceインスタンス
 */
export function createSupabaseUploadService(
  supabaseUrl: string, 
  supabaseKey: string
): SupabaseUploadService {
  return new SupabaseUploadService(supabaseUrl, supabaseKey);
}

/**
 * 便利関数：複数画像の一括アップロード
 * @param files ファイル配列
 * @param userId ユーザーID
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @returns アップロード結果
 */
export async function uploadTrainingImages(
  files: File[],
  userId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<BatchUploadResult> {
  const uploadService = createSupabaseUploadService(supabaseUrl, supabaseKey);
  
  // バケット存在確認・作成
  await uploadService.createBucketIfNotExists();
  
  return await uploadService.uploadMultipleImages(files, userId);
}

/**
 * アップロード進捗付きの複数画像アップロード
 * @param files ファイル配列
 * @param userId ユーザーID
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @param onProgress 進捗コールバック
 * @returns アップロード結果
 */
export async function uploadTrainingImagesWithProgress(
  files: File[],
  userId: string,
  supabaseUrl: string,
  supabaseKey: string,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchUploadResult> {
  const uploadService = createSupabaseUploadService(supabaseUrl, supabaseKey);
  
  // バケット存在確認・作成
  await uploadService.createBucketIfNotExists();
  
  const results: UploadResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const result = await uploadService.uploadSingleImage(files[i], userId);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return {
    success: successCount > 0,
    results,
    successCount,
    failureCount
  };
}