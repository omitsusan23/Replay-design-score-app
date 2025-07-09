'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { CloudArrowUpIcon, PhotoIcon, LinkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

interface UISubmissionFormProps {
  onSubmit?: (data: FormData) => void;
  isLoading?: boolean;
}

export default function UISubmissionForm({ 
  onSubmit, 
  isLoading = false
}: UISubmissionFormProps) {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [structureNote, setStructureNote] = useState(''); // 構造メモ（設計意図）
  const [figmaUrl, setFigmaUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [submitType, setSubmitType] = useState<'image' | 'figma'>('image');
  const [showPreview, setShowPreview] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      setUploadedFile(file);
      
      // プレビュー表示
      const reader = new FileReader();
      reader.onload = () => {
        setShowPreview(true);
      };
      reader.readAsDataURL(file);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('projectName', projectName);
    formData.append('description', description);
    formData.append('structureNote', structureNote);
    formData.append('submitType', submitType);
    
    if (submitType === 'figma') {
      formData.append('figmaUrl', figmaUrl);
    } else if (uploadedFile) {
      formData.append('image', uploadedFile);
    }

    if (onSubmit) {
      onSubmit(formData);
    } else {
      // デフォルトの処理: APIを呼び出す
      try {
        const token = localStorage.getItem('supabase.auth.token');
        const response = await fetch('/api/evaluate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error('評価に失敗しました');
        }

        const result = await response.json();
        console.log('評価結果:', result);
        
        // 評価完了後、結果画面へ遷移
        if (result.submissionId) {
          window.location.href = `/evaluations/${result.submissionId}`;
        }
      } catch (error) {
        console.error('Error:', error);
        alert('評価中にエラーが発生しました。');
      }
    }
  };

  const isValid = projectName && (
    (submitType === 'figma' && figmaUrl) ||
    (submitType === 'image' && uploadedFile)
  );

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        UI/UX デザイン評価
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
            プロジェクト名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="例: ECサイトのランディングページ"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            説明・意図
            <span className="text-gray-500 text-xs ml-2">任意</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="このUIの目的、ターゲットユーザー、解決したい課題などを記載"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 構造メモ（設計意図） */}
        <div>
          <label htmlFor="structureNote" className="block text-sm font-medium text-gray-700 mb-2">
            <DocumentTextIcon className="inline w-4 h-4 mr-1" />
            構造メモ（設計意図）
            <span className="text-gray-500 text-xs ml-2">任意</span>
          </label>
          <textarea
            id="structureNote"
            value={structureNote}
            onChange={(e) => setStructureNote(e.target.value)}
            placeholder="レイアウトの設計意図、情報階層の考え方、配色の理由など、デザインの背景にある思考を記載"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            構造メモを記載すると、AIがより深い理解に基づいた評価を行えます
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            提出方法 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-4 mb-4">
            <button
              type="button"
              onClick={() => setSubmitType('image')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                submitType === 'image'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <PhotoIcon className="w-5 h-5 inline mr-2" />
              画像アップロード
            </button>
            <button
              type="button"
              onClick={() => setSubmitType('figma')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                submitType === 'figma'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <LinkIcon className="w-5 h-5 inline mr-2" />
              Figmaリンク
            </button>
          </div>

          {submitType === 'image' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <CloudArrowUpIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              {uploadedFile ? (
                <div>
                  <p className="text-sm text-gray-900">{uploadedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-700">
                    ドラッグ&ドロップまたはクリックして画像を選択
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    JPEG, PNG, GIF, WebP 形式対応
                  </p>
                </div>
              )}
            </div>
          )}

          {submitType === 'figma' && (
            <div>
              <input
                type="url"
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://www.figma.com/file/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={submitType === 'figma'}
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!isValid || isLoading}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isValid && !isLoading
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              評価中...
            </span>
          ) : (
            'AI評価を開始'
          )}
        </button>
      </form>

      {/* 評価基準の説明 */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">評価基準</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          <div>• 視覚的インパクト（美的感覚）</div>
          <div>• 使いやすさ（ユーザビリティ）</div>
          <div>• グリッド/整列（整合性）</div>
          <div>• アクセシビリティ（利用しやすさ）</div>
          <div>• 一貫性（デザイン言語）</div>
        </div>
      </div>
    </div>
  );
}