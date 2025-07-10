'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  CloudArrowUpIcon, 
  PhotoIcon, 
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { ClientUploadService, uploadImages, uploadZip } from '@/libs/client-upload';

interface UploadedImage {
  file: File;
  preview: string;
  id: string;
}

interface UploadedZip {
  file: File;
  id: string;
}

interface UploadFormProps {
  onSubmit?: (data: { projectName: string; imageUrls: string[]; uploadMode: string }) => void;
  isLoading?: boolean;
}

export default function UploadForm({ onSubmit, isLoading = false }: UploadFormProps) {
  const [projectName, setProjectName] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadedZip, setUploadedZip] = useState<UploadedZip | null>(null);
  const [uploadMode, setUploadMode] = useState<'images' | 'zip'>('images');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'uploading' | 'processing' | 'evaluating' | 'completed' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (uploadMode === 'zip') {
      // Zipモード: 1つのzipファイルのみ
      const zipFile = acceptedFiles.find(file => file.type === 'application/zip' || file.name.endsWith('.zip'));
      if (zipFile) {
        const isSizeValid = zipFile.size <= 100 * 1024 * 1024; // 100MB制限
        if (!isSizeValid) {
          toast.error(`${zipFile.name}のサイズが大きすぎます（100MB以下にしてください）`);
          return;
        }
        setUploadedZip({
          file: zipFile,
          id: Math.random().toString(36).substr(2, 9)
        });
        toast.success(`Zipファイル「${zipFile.name}」をアップロードしました`);
      } else {
        toast.error('Zipファイルを選択してください');
      }
    } else {
      // 画像モード: 複数画像ファイル
      const validFiles = acceptedFiles.filter(file => {
        const isImage = file.type.startsWith('image/');
        const isSizeValid = file.size <= 10 * 1024 * 1024; // 10MB制限
        
        if (!isImage) {
          toast.error(`${file.name}は画像ファイルではありません`);
          return false;
        }
        if (!isSizeValid) {
          toast.error(`${file.name}のサイズが大きすぎます（10MB以下にしてください）`);
          return false;
        }
        return true;
      });

      const newImages: UploadedImage[] = validFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        id: Math.random().toString(36).substr(2, 9)
      }));

      setUploadedImages(prev => [...prev, ...newImages]);
    }
  }, [uploadMode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: uploadMode === 'zip' 
      ? { 'application/zip': ['.zip'] }
      : { 
          'image/jpeg': ['.jpeg', '.jpg'],
          'image/png': ['.png'],
          'image/webp': ['.webp']
        },
    multiple: uploadMode === 'images',
    maxFiles: uploadMode === 'images' ? undefined : 1 // zip: 1つ, images: 制限なし
  });

  const removeImage = (id: string) => {
    setUploadedImages(prev => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const removeZip = () => {
    setUploadedZip(null);
  };

  const switchMode = (mode: 'images' | 'zip') => {
    setUploadMode(mode);
    // モード切り替え時はアップロード済みファイルをクリア
    setUploadedImages([]);
    setUploadedZip(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      toast.error('プロジェクト名を入力してください');
      return;
    }

    if (uploadMode === 'images' && uploadedImages.length === 0) {
      toast.error('少なくとも1枚の画像をアップロードしてください');
      return;
    }

    if (uploadMode === 'zip' && !uploadedZip) {
      toast.error('Zipファイルをアップロードしてください');
      return;
    }

    try {
      // 1. ユーザー認証確認
      const user = await ClientUploadService.getCurrentUser();
      if (!user) {
        toast.error('ログインが必要です');
        return;
      }

      setSubmitStatus('uploading');
      setUploadProgress(null);

      let imageUrls: string[] = [];
      let uploadInfo: any = {};

      // 2. Supabase Storageに直接アップロード
      if (uploadMode === 'images') {
        toast.loading('画像をアップロード中...', { id: 'upload' });
        
        const uploadResult = await uploadImages(
          uploadedImages.map(img => img.file),
          user.id,
          (completed, total) => {
            setUploadProgress({ completed, total });
          }
        );

        if (!uploadResult.success) {
          throw new Error(`画像アップロードに失敗しました: ${uploadResult.errors.join(', ')}`);
        }

        imageUrls = uploadResult.imageUrls;
        uploadInfo = {
          successCount: uploadResult.successCount,
          failureCount: uploadResult.failureCount,
          errors: uploadResult.errors
        };

        toast.success(`${uploadResult.successCount}枚の画像をアップロードしました`, { id: 'upload' });

      } else if (uploadMode === 'zip' && uploadedZip) {
        toast.loading('Zipファイルを処理中...', { id: 'upload' });
        
        const zipResult = await uploadZip(
          uploadedZip.file,
          user.id,
          (completed, total) => {
            setUploadProgress({ completed, total });
          }
        );

        if (!zipResult.success) {
          throw new Error(`Zipファイル処理に失敗しました: ${zipResult.errors.join(', ')}`);
        }

        imageUrls = zipResult.imageUrls;
        uploadInfo = {
          successCount: zipResult.successCount,
          failureCount: zipResult.failureCount,
          errors: zipResult.errors,
          zipExtractionInfo: zipResult.zipExtractionInfo
        };

        toast.success(`${zipResult.successCount}枚の画像を抽出・アップロードしました`, { id: 'upload' });
      }

      if (imageUrls.length === 0) {
        throw new Error('アップロードされた画像がありません');
      }

      setSubmitStatus('evaluating');
      toast.loading('AI評価を実行中...', { id: 'evaluate' });

      // 3. カスタムhandlerがある場合
      if (onSubmit) {
        await onSubmit({
          projectName: projectName.trim(),
          imageUrls,
          uploadMode
        });
      } else {
        // 4. デフォルト処理: APIにURLのみ送信
        const session = await ClientUploadService.getCurrentSession();
        const token = session?.access_token;
        
        const response = await fetch('/api/training-examples/upload-urls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({
            projectName: projectName.trim(),
            imageUrls,
            uploadMode,
            uploadInfo
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'AI評価に失敗しました');
        }

        const result = await response.json();
        toast.success(`${result.savedCount}件の教師データを保存しました！`, { id: 'evaluate' });
      }

      setSubmitStatus('completed');
      toast.success('教師データの保存が完了しました！');
      
      // フォームをリセット
      setProjectName('');
      setUploadedImages([]);
      setUploadedZip(null);
      setUploadProgress(null);

    } catch (error) {
      setSubmitStatus('error');
      toast.dismiss();
      toast.error(`処理中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Submit error:', error);
    }
  };

  const isValid = projectName.trim() && (
    (uploadMode === 'images' && uploadedImages.length > 0) ||
    (uploadMode === 'zip' && uploadedZip !== null)
  );
  const isSubmitting = isLoading || submitStatus === 'uploading' || submitStatus === 'processing' || submitStatus === 'evaluating';

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          教師データアップロード
        </h2>
        <p className="text-gray-600 text-sm">
          UI/UXデザインの画像をアップロードして、AIが自動で評価・分析を行います
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* プロジェクト名入力 */}
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
            プロジェクト名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="例: ECサイトのUI改善案"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-gray-500">
            評価時の参考情報として使用されます
          </p>
        </div>

        {/* アップロードモード選択 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            アップロード方法 <span className="text-red-500">*</span>
          </label>
          <div className="flex space-x-4 mb-4">
            <button
              type="button"
              onClick={() => switchMode('images')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                uploadMode === 'images'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              disabled={isSubmitting}
            >
              📷 個別画像アップロード
            </button>
            <button
              type="button"
              onClick={() => switchMode('zip')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                uploadMode === 'zip'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              disabled={isSubmitting}
            >
              📦 Zipファイル一括アップロード
            </button>
          </div>
        </div>

        {/* ファイルアップロードエリア */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {uploadMode === 'images' ? '画像ファイル' : 'Zipファイル'} <span className="text-red-500">*</span>
            <span className="text-gray-500 text-xs ml-2">
              {uploadMode === 'images' 
                ? '制限なし、各10MB以下' 
                : '1ファイル、100MB以下'
              }
            </span>
          </label>
          
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input {...getInputProps()} disabled={isSubmitting} />
            <CloudArrowUpIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            {isDragActive ? (
              <p className="text-blue-600 text-lg">
                {uploadMode === 'images' ? '画像' : 'Zipファイル'}をここにドロップしてください
              </p>
            ) : (
              <div>
                <p className="text-gray-700 text-lg mb-2">
                  ドラッグ&ドロップまたはクリックして
                  {uploadMode === 'images' ? '画像' : 'Zipファイル'}を選択
                </p>
                <p className="text-gray-500 text-sm">
                  {uploadMode === 'images' 
                    ? 'JPEG, PNG, WebP 形式対応'
                    : 'ZIP 形式のみ対応'
                  }
                </p>
              </div>
            )}
          </div>
        </div>

        {/* アップロード済みファイルのプレビュー */}
        {uploadMode === 'images' && uploadedImages.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              アップロード済み画像 ({uploadedImages.length}枚)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {uploadedImages.map((image) => (
                <div key={image.id} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={image.preview}
                      alt="プレビュー"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isSubmitting}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {image.file.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* アップロード済みZipファイルの表示 */}
        {uploadMode === 'zip' && uploadedZip && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              アップロード済みZipファイル
            </h3>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 text-lg">📦</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {uploadedZip.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadedZip.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeZip}
                  className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  disabled={isSubmitting}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 進捗表示 */}
        {uploadProgress && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700">
                アップロード進捗: {uploadProgress.completed} / {uploadProgress.total}
              </span>
              <span className="text-sm text-blue-600">
                {Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 送信ボタン */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {submitStatus === 'completed' && (
              <div className="flex items-center text-green-600">
                <CheckCircleIcon className="w-5 h-5 mr-1" />
                <span className="text-sm">保存完了</span>
              </div>
            )}
            {submitStatus === 'error' && (
              <div className="flex items-center text-red-600">
                <ExclamationCircleIcon className="w-5 h-5 mr-1" />
                <span className="text-sm">エラーが発生しました</span>
              </div>
            )}
          </div>
          
          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`px-6 py-3 rounded-md font-medium transition-colors ${
              isValid && !isSubmitting
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {submitStatus === 'uploading' ? 'Supabaseにアップロード中...' : 
                 submitStatus === 'evaluating' ? 'Claude AI評価中...' :
                 submitStatus === 'processing' ? '処理中...' : '実行中...'}
              </span>
            ) : (
              `${uploadMode === 'zip' ? 'ZIP解凍＆' : ''}AI評価を開始`
            )}
          </button>
        </div>
      </form>

      {/* 評価項目の説明 */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">AI評価項目</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
          <div>• UIタイプ分類（LP、ダッシュボード等）</div>
          <div>• 構造的特徴の分析</div>
          <div>• 設計優位性の評価</div>
          <div>• 分類タグの自動付与</div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          ※ 評価結果は管理者承認後に教師データとして活用されます
        </p>
      </div>
    </div>
  );
}