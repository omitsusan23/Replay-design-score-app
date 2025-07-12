'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import AuthGuard from '@/components/AuthGuard';
import DashboardLayout from '@/components/DashboardLayout';
import { 
  PlusIcon, 
  CalendarIcon, 
  ChartBarIcon,
  EyeIcon,
  LinkIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface UISubmission {
  id: string;
  title: string;
  description: string | null;
  figma_link: string | null;
  image_url: string | null;
  scores: {
    [key: string]: number;
  };
  feedback: string;
  total_score: number;
  created_at: string;
  updated_at: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<UISubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 提出履歴を取得
  useEffect(() => {
    const fetchSubmissions = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('ui_submissions')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        setSubmissions(data || []);
        
      } catch (error) {
        console.error('提出履歴取得エラー:', error);
        setError('提出履歴の取得に失敗しました');
        toast.error('提出履歴の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [user]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  ダッシュボード
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  あなたの UI/UX デザイン提出履歴
                </p>
              </div>
              <Link
                href="/dashboard/new"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                新規投稿
              </Link>
            </div>
          </div>

          {/* 統計カード */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ChartBarIcon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        総投稿数
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {submissions.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ChartBarIcon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        平均スコア
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {submissions.length > 0
                          ? Math.round(
                              submissions.reduce((sum, s) => sum + s.total_score, 0) /
                                submissions.length
                            )
                          : 0}
                        点
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ChartBarIcon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        最高スコア
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {submissions.length > 0
                          ? Math.max(...submissions.map(s => s.total_score))
                          : 0}
                        点
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 提出履歴一覧 */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                提出履歴
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                最新の投稿から順に表示されています
              </p>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
                <p className="text-gray-600">提出履歴を読み込み中...</p>
              </div>
            ) : error ? (
              <div className="p-12 text-center">
                <p className="text-red-600">{error}</p>
              </div>
            ) : submissions.length === 0 ? (
              <div className="p-12 text-center">
                <PhotoIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  まだ投稿がありません
                </h3>
                <p className="text-gray-500 mb-6">
                  最初の UI/UX デザインを投稿してみましょう
                </p>
                <Link
                  href="/dashboard/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  新規投稿
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {submissions.map((submission) => (
                  <li key={submission.id} className="px-4 py-6 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <h4 className="text-lg font-medium text-gray-900 truncate">
                            {submission.title}
                          </h4>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScoreColor(submission.total_score)}`}>
                            {submission.total_score}点
                          </span>
                        </div>
                        
                        {submission.description && (
                          <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                            {submission.description}
                          </p>
                        )}
                        
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            {formatDate(submission.created_at)}
                          </div>
                          
                          {submission.figma_link && (
                            <div className="flex items-center">
                              <LinkIcon className="h-4 w-4 mr-1" />
                              <a
                                href={submission.figma_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Figma で表示
                              </a>
                            </div>
                          )}
                          
                          {submission.image_url && (
                            <div className="flex items-center">
                              <PhotoIcon className="h-4 w-4 mr-1" />
                              <span>画像あり</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-6 flex-shrink-0">
                        <button
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            // 詳細表示の実装（将来的に追加）
                            toast('詳細表示機能は今後実装予定です', { icon: 'ℹ️' });
                          }}
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          詳細
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}