'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import DashboardLayout from '@/components/DashboardLayout';
import { toast } from 'react-hot-toast';
import { 
  CloudArrowUpIcon, 
  PhotoIcon, 
  LinkIcon, 
  DocumentTextIcon,
  ArrowLeftIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function NewSubmissionPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [structureNote, setStructureNote] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [submitType, setSubmitType] = useState<'image' | 'figma'>('image');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      setUploadedFile(file);
      
      // プレビュー用URL作成
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('ログインが必要です');
      return;
    }

    if (!projectName.trim()) {
      toast.error('プロジェクト名を入力してください');
      return;
    }

    if (submitType === 'figma' && !figmaUrl.trim()) {
      toast.error('FigmaのURLを入力してください');
      return;
    }

    if (submitType === 'image' && !uploadedFile) {
      toast.error('画像ファイルをアップロードしてください');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('projectName', projectName.trim());
      formData.append('description', description.trim());
      formData.append('structureNote', structureNote.trim());
      formData.append('submitType', submitType);
      
      if (submitType === 'figma') {
        formData.append('figmaUrl', figmaUrl.trim());
      } else if (uploadedFile) {
        formData.append('image', uploadedFile);
      }

      const response = await fetch('/api/evaluate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '評価に失敗しました');
      }

      const result = await response.json();
      
      toast.success('評価が完了しました！');
      
      // ダッシュボードに戻る
      router.push('/dashboard');
      
    } catch (error) {
      console.error('Submission error:', error);
      toast.error(error instanceof Error ? error.message : '投稿中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = projectName.trim() && (
    (submitType === 'figma' && figmaUrl.trim()) ||
    (submitType === 'image' && uploadedFile)
  );

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-1" />
                ダッシュボードに戻る
              </Link>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              新規 UI/UX デザイン投稿
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              あなたのデザインをAIが評価し、フィードバックを提供します
            </p>
          </div>

          {/* メインフォーム */}
          <div className="bg-white shadow-lg rounded-lg overflow-hidden">
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              
              {/* プロジェクト名 */}
              <div>
                <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
                  プロジェクト名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: ECサイトのランディングページ"
                  disabled={isSubmitting}
                  required
                />
              </div>

              {/* 説明 */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  プロジェクトの説明
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="プロジェクトの目的や背景について簡潔に説明してください"
                  disabled={isSubmitting}
                />
              </div>

              {/* 構造メモ */}
              <div>
                <label htmlFor="structureNote" className="block text-sm font-medium text-gray-700 mb-2">
                  設計意図・構造メモ
                </label>
                <textarea
                  id="structureNote"
                  value={structureNote}
                  onChange={(e) => setStructureNote(e.target.value)}
                  rows={4}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="デザインの意図や構造について詳しく説明してください。この情報はAI評価の精度向上に役立ちます。"
                  disabled={isSubmitting}
                />
              </div>

              {/* 提出方法選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  提出方法 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setSubmitType('image')}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      submitType === 'image'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={isSubmitting}
                  >
                    <PhotoIcon className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                    <p className="font-medium">画像アップロード</p>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF, WebP</p>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setSubmitType('figma')}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      submitType === 'figma'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={isSubmitting}
                  >
                    <LinkIcon className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                    <p className="font-medium">Figma リンク</p>
                    <p className="text-xs text-gray-500">共有リンクを貼り付け</p>
                  </button>
                </div>
              </div>

              {/* 画像アップロード */}
              {submitType === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    デザイン画像 <span className="text-red-500">*</span>
                  </label>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isDragActive
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input {...getInputProps()} disabled={isSubmitting} />
                    <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    {uploadedFile ? (
                      <div>
                        <p className="text-sm font-medium text-green-600 mb-2">
                          ✓ {uploadedFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          ファイルサイズ: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          ファイルをドラッグ＆ドロップ
                        </p>
                        <p className="text-xs text-gray-500">
                          または クリックしてファイルを選択
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* プレビュー */}
                  {previewUrl && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">プレビュー:</p>
                      <img
                        src={previewUrl}
                        alt="アップロード画像のプレビュー"
                        className="max-w-full h-auto max-h-64 rounded-lg shadow-sm border"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Figma URL */}
              {submitType === 'figma' && (
                <div>
                  <label htmlFor="figmaUrl" className="block text-sm font-medium text-gray-700 mb-2">
                    Figma 共有リンク <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    id="figmaUrl"
                    value={figmaUrl}
                    onChange={(e) => setFigmaUrl(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://www.figma.com/file/..."
                    disabled={isSubmitting}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Figmaファイルの共有リンクを貼り付けてください（閲覧権限が必要です）
                  </p>
                </div>
              )}

              {/* 送信ボタン */}
              <div className="pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={!isValid || isSubmitting}
                  className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      評価中...
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                      評価を開始
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}