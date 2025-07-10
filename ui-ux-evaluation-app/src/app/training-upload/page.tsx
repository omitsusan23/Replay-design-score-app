'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Toaster } from 'react-hot-toast';
import UploadForm from '@/components/UploadForm';
import AuthComponent from '@/components/AuthComponent';

export default function TrainingUploadPage() {
  const [user, setUser] = useState<User | null>(null);

  const handleAuthStateChange = (user: User | null) => {
    setUser(user);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            教師データ収集システム
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            UI/UXデザインの画像をアップロードすると、AIが自動で評価・分析を行い、
            システムの学習データとして活用されます。
          </p>
        </div>

        {/* 認証コンポーネント */}
        <div className="mb-8">
          <AuthComponent onAuthStateChange={handleAuthStateChange} />
        </div>

        {/* アップロードフォーム（ログイン時のみ表示） */}
        {user && <UploadForm />}
        
        <div className="mt-12 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              📊 システムの仕組み
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  1
                </div>
                <h3 className="font-medium text-gray-900 mb-2">画像アップロード</h3>
                <p className="text-sm text-gray-600">
                  複数のUIスクリーンショットを一括でアップロード
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  2
                </div>
                <h3 className="font-medium text-gray-900 mb-2">AI自動評価</h3>
                <p className="text-sm text-gray-600">
                  Claude AIが構造分析、UIタイプ分類、タグ付けを実行
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  3
                </div>
                <h3 className="font-medium text-gray-900 mb-2">学習データ化</h3>
                <p className="text-sm text-gray-600">
                  評価結果が教師データとして保存され、システムが改善
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">
                  ご注意
                </h3>
                <div className="mt-1 text-sm text-amber-700">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>アップロードした画像は管理者の承認後に教師データとして利用されます</li>
                    <li>個別モード: 1日最大50枚、1回最大10枚まで</li>
                    <li>ZIPモード: 1日最大200枚、1回の枚数制限なし</li>
                    <li>機密情報や著作権のある画像のアップロードはお控えください</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
          },
          error: {
            duration: 5000,
          },
        }}
      />
    </div>
  );
}