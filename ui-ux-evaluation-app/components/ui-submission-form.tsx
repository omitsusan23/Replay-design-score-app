'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { CloudArrowUpIcon, PhotoIcon, LinkIcon } from '@heroicons/react/24/outline';

interface UISubmissionFormProps {
  onSubmit?: (data: FormData) => void;
  isLoading?: boolean;
}

export default function UISubmissionForm({ onSubmit, isLoading = false }: UISubmissionFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [figmaLink, setFigmaLink] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [submitType, setSubmitType] = useState<'image' | 'figma'>('image');

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      setUploadedFile(acceptedFiles[0]);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('submitType', submitType);
    
    if (submitType === 'figma') {
      formData.append('figmaLink', figmaLink);
    } else if (uploadedFile) {
      formData.append('image', uploadedFile);
    }

    if (onSubmit) {
      onSubmit(formData);
    } else {
      // デフォルトの処理: 直接APIを呼び出す
      try {
        const response = await fetch('/api/evaluate', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('評価に失敗しました');
        }

        const result = await response.json();
        // 結果をコンソールに出力（後でUI表示に変更可能）
        console.log('評価結果:', result);
        alert('評価が完了しました。結果をコンソールで確認してください。');
      } catch (error) {
        console.error('Error:', error);
        alert('評価中にエラーが発生しました。');
      }
    }
  };

  const isValid = title && description && (
    (submitType === 'figma' && figmaLink) ||
    (submitType === 'image' && uploadedFile)
  );

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">UI/UX 提出フォーム</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            プロジェクト名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: ECサイトのランディングページ"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            説明・意図 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="デザインの意図、ターゲットユーザー、重視したポイントなどを記入してください"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            提出方法を選択 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setSubmitType('image')}
              className={`p-4 border-2 rounded-lg transition-all ${
                submitType === 'image'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400'
              }`}
            >
              <PhotoIcon className="h-8 w-8 mx-auto mb-2" />
              <span className="font-medium">画像アップロード</span>
            </button>
            <button
              type="button"
              onClick={() => setSubmitType('figma')}
              className={`p-4 border-2 rounded-lg transition-all ${
                submitType === 'figma'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400'
              }`}
            >
              <LinkIcon className="h-8 w-8 mx-auto mb-2" />
              <span className="font-medium">Figmaリンク</span>
            </button>
          </div>
        </div>

        {submitType === 'image' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              画像ファイル <span className="text-red-500">*</span>
            </label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : uploadedFile
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              {uploadedFile ? (
                <div className="space-y-2">
                  <PhotoIcon className="h-12 w-12 mx-auto text-green-500" />
                  <p className="text-sm text-green-700 font-medium">{uploadedFile.name}</p>
                  <p className="text-xs text-gray-500">クリックして変更</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <CloudArrowUpIcon className="h-12 w-12 mx-auto text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {isDragActive ? 'ファイルをドロップしてください' : 'ファイルをドラッグ＆ドロップまたはクリックしてアップロード'}
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF, WebP (最大10MB)</p>
                </div>
              )}
            </div>
          </div>
        )}

        {submitType === 'figma' && (
          <div>
            <label htmlFor="figmaLink" className="block text-sm font-medium text-gray-700 mb-2">
              Figmaリンク <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              id="figmaLink"
              value={figmaLink}
              onChange={(e) => setFigmaLink(e.target.value)}
              placeholder="https://www.figma.com/file/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required={submitType === 'figma'}
            />
          </div>
        )}

        <div className="pt-4">
          <button
            type="submit"
            disabled={!isValid || isLoading}
            className={`w-full py-3 px-4 rounded-md font-medium transition-all ${
              isValid && !isLoading
                ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                AI評価中...
              </span>
            ) : (
              'AI評価を実行'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}