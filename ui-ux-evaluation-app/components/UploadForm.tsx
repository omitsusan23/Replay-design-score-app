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

interface UploadedImage {
  file: File;
  preview: string;
  id: string;
}

interface UploadFormProps {
  onSubmit?: (data: { projectName: string; images: File[] }) => void;
  isLoading?: boolean;
}

export default function UploadForm({ onSubmit, isLoading = false }: UploadFormProps) {
  const [projectName, setProjectName] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // ファイルサイズとタイプの検証
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
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    multiple: true,
    maxFiles: 10 // 最大10枚
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      toast.error('プロジェクト名を入力してください');
      return;
    }

    if (uploadedImages.length === 0) {
      toast.error('少なくとも1枚の画像をアップロードしてください');
      return;
    }

    setSubmitStatus('uploading');
    
    if (onSubmit) {
      try {
        await onSubmit({ 
          projectName: projectName.trim(), 
          images: uploadedImages.map(img => img.file) 
        });
        setSubmitStatus('completed');
        toast.success('教師データの保存が完了しました！');
        
        // フォームをリセット
        setProjectName('');
        setUploadedImages([]);
      } catch (error) {
        setSubmitStatus('error');
        toast.error('保存中にエラーが発生しました');
        console.error('Upload error:', error);
      }
    } else {
      // デフォルトの処理: APIを呼び出す
      try {
        const formData = new FormData();
        formData.append('projectName', projectName.trim());
        uploadedImages.forEach((img, index) => {
          formData.append(`images[${index}]`, img.file);
        });

        const response = await fetch('/api/training-examples/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('アップロードに失敗しました');
        }

        const result = await response.json();
        setSubmitStatus('completed');
        toast.success(`${result.savedCount}件の教師データを保存しました！`);
        
        // フォームをリセット
        setProjectName('');
        setUploadedImages([]);
      } catch (error) {
        setSubmitStatus('error');
        toast.error('保存中にエラーが発生しました');
        console.error('Upload error:', error);
      }
    }
  };

  const isValid = projectName.trim() && uploadedImages.length > 0;
  const isSubmitting = isLoading || submitStatus === 'uploading' || submitStatus === 'processing';

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

        {/* 画像アップロードエリア */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            画像アップロード <span className="text-red-500">*</span>
            <span className="text-gray-500 text-xs ml-2">最大10枚、各10MB以下</span>
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
              <p className="text-blue-600 text-lg">画像をここにドロップしてください</p>
            ) : (
              <div>
                <p className="text-gray-700 text-lg mb-2">
                  ドラッグ&ドロップまたはクリックして画像を選択
                </p>
                <p className="text-gray-500 text-sm">
                  JPEG, PNG, GIF, WebP 形式対応
                </p>
              </div>
            )}
          </div>
        </div>

        {/* アップロード済み画像のプレビュー */}
        {uploadedImages.length > 0 && (
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
                {submitStatus === 'uploading' ? 'アップロード中...' : 
                 submitStatus === 'processing' ? 'AI評価中...' : '処理中...'}
              </span>
            ) : (
              'AI評価を開始'
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