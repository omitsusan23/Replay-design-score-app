import JSZip from 'jszip';

export interface ExtractedImage {
  fileName: string;
  fileBlob: Blob;
  fileType: string;
}

export interface ZipExtractionResult {
  success: boolean;
  images: ExtractedImage[];
  totalFiles: number;
  extractedCount: number;
  skippedCount: number;
  errors: string[];
}

export class ZipExtractorService {
  private static readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp'
  ];

  private static readonly SUPPORTED_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp'
  ];

  /**
   * Zipファイルから画像ファイルを抽出
   * @param zipFile Zipファイル
   * @returns 抽出結果
   */
  static async extractImagesFromZip(zipFile: File): Promise<ZipExtractionResult> {
    const result: ZipExtractionResult = {
      success: false,
      images: [],
      totalFiles: 0,
      extractedCount: 0,
      skippedCount: 0,
      errors: []
    };

    try {
      // JSZipでZipファイルを読み込み
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      
      const allFiles = Object.keys(zipContent.files);
      result.totalFiles = allFiles.length;

      console.log(`Zip file contains ${result.totalFiles} files`);

      // 各ファイルを処理
      for (const fileName of allFiles) {
        const file = zipContent.files[fileName];
        
        // ディレクトリは無視
        if (file.dir) {
          continue;
        }

        // 隠しファイルやシステムファイルは無視
        if (this.isSystemFile(fileName)) {
          result.skippedCount++;
          continue;
        }

        // 画像ファイルかどうかチェック
        if (!this.isImageFile(fileName)) {
          result.skippedCount++;
          console.log(`Skipping non-image file: ${fileName}`);
          continue;
        }

        try {
          // ファイル内容を取得
          const fileBlob = await file.async('blob');
          
          // ファイルサイズチェック（10MB制限）
          if (fileBlob.size > 10 * 1024 * 1024) {
            result.errors.push(`${fileName}: ファイルサイズが大きすぎます（10MB以下にしてください）`);
            result.skippedCount++;
            continue;
          }

          // MIMEタイプを推定
          const fileType = this.getMimeTypeFromExtension(fileName);
          
          result.images.push({
            fileName: this.sanitizeFileName(fileName),
            fileBlob,
            fileType
          });
          
          result.extractedCount++;
          console.log(`Extracted image: ${fileName} (${fileBlob.size} bytes)`);

        } catch (error) {
          result.errors.push(`${fileName}: 抽出エラー - ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.skippedCount++;
        }
      }

      result.success = result.extractedCount > 0;
      
      console.log(`Extraction completed: ${result.extractedCount} images extracted, ${result.skippedCount} files skipped`);
      
      return result;

    } catch (error) {
      result.errors.push(`Zip解凍エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * ファイル名から画像ファイルかどうかを判定
   * @param fileName ファイル名
   * @returns 画像ファイルかどうか
   */
  private static isImageFile(fileName: string): boolean {
    const extension = this.getFileExtension(fileName).toLowerCase();
    return this.SUPPORTED_EXTENSIONS.includes(extension);
  }

  /**
   * ファイル拡張子を取得
   * @param fileName ファイル名
   * @returns 拡張子（ドット付き）
   */
  private static getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex >= 0 ? fileName.substring(lastDotIndex) : '';
  }

  /**
   * ファイル拡張子からMIMEタイプを推定
   * @param fileName ファイル名
   * @returns MIMEタイプ
   */
  private static getMimeTypeFromExtension(fileName: string): string {
    const extension = this.getFileExtension(fileName).toLowerCase();
    
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg'; // デフォルト
    }
  }

  /**
   * システムファイルかどうかを判定
   * @param fileName ファイル名
   * @returns システムファイルかどうか
   */
  private static isSystemFile(fileName: string): boolean {
    const name = fileName.toLowerCase();
    const systemPatterns = [
      '__macosx/',
      '.ds_store',
      'thumbs.db',
      'desktop.ini',
      '.git/',
      '.svn/',
      'node_modules/'
    ];
    
    return systemPatterns.some(pattern => name.includes(pattern));
  }

  /**
   * ファイル名をサニタイズ
   * @param fileName 元のファイル名
   * @returns サニタイズ済みファイル名
   */
  private static sanitizeFileName(fileName: string): string {
    // パス区切り文字を除去し、ファイル名のみ抽出
    const nameOnly = fileName.split('/').pop() || fileName;
    
    // 無効な文字を除去
    return nameOnly.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  }

  /**
   * 抽出された画像をFileオブジェクトに変換
   * @param extractedImages 抽出された画像配列
   * @returns Fileオブジェクト配列
   */
  static convertToFileObjects(extractedImages: ExtractedImage[]): File[] {
    return extractedImages.map(img => {
      return new File([img.fileBlob], img.fileName, {
        type: img.fileType,
        lastModified: Date.now()
      });
    });
  }

  /**
   * 抽出結果の統計を取得
   * @param result 抽出結果
   * @returns 統計情報
   */
  static getExtractionStats(result: ZipExtractionResult): {
    totalSize: number;
    averageSize: number;
    maxSize: number;
    minSize: number;
  } {
    if (result.images.length === 0) {
      return { totalSize: 0, averageSize: 0, maxSize: 0, minSize: 0 };
    }

    const sizes = result.images.map(img => img.fileBlob.size);
    const totalSize = sizes.reduce((sum, size) => sum + size, 0);
    const averageSize = Math.round(totalSize / sizes.length);
    const maxSize = Math.max(...sizes);
    const minSize = Math.min(...sizes);

    return { totalSize, averageSize, maxSize, minSize };
  }
}

/**
 * 便利関数：Zipファイルから画像を抽出してFileオブジェクトとして返す
 * @param zipFile Zipファイル
 * @returns Fileオブジェクト配列と抽出結果
 */
export async function extractImagesFromZip(zipFile: File): Promise<{
  files: File[];
  result: ZipExtractionResult;
}> {
  const result = await ZipExtractorService.extractImagesFromZip(zipFile);
  const files = ZipExtractorService.convertToFileObjects(result.images);
  
  return { files, result };
}