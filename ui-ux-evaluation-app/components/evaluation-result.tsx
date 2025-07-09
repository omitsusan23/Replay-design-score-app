'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  ChartBarIcon, 
  SparklesIcon, 
  EyeIcon, 
  CursorArrowRaysIcon,
  ViewfinderCircleIcon,
  ShieldCheckIcon,
  SwatchIcon
} from '@heroicons/react/24/outline';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EvaluationData {
  submission: {
    id: string;
    project_name: string;
    description: string;
    structure_note?: string;
    figma_url?: string;
    image_url?: string;
    created_at: string;
  };
  score: {
    ui_type: string;
    score_aesthetic: number;
    score_usability: number;
    score_alignment: number;
    score_accessibility: number;
    score_consistency: number;
    total_score: number;
    review_text: string;
  };
}

interface EvaluationResultProps {
  submissionId: string;
}

export default function EvaluationResult({ submissionId }: EvaluationResultProps) {
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // 提出データの取得
        const { data: submission, error: subError } = await supabase
          .from('ui_submissions')
          .select('*')
          .eq('id', submissionId)
          .single();

        if (subError) throw subError;

        // スコアデータの取得
        const { data: score, error: scoreError } = await supabase
          .from('ui_scores')
          .select('*')
          .eq('submission_id', submissionId)
          .single();

        if (scoreError) throw scoreError;

        // total_scoreを計算
        const totalScore = (
          score.score_aesthetic +
          score.score_usability +
          score.score_alignment +
          score.score_accessibility +
          score.score_consistency
        ) / 5;

        setData({
          submission,
          score: {
            ...score,
            total_score: Number(totalScore.toFixed(2))
          }
        });
      } catch (error) {
        console.error('Error fetching evaluation:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [submissionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">評価結果が見つかりませんでした。</p>
      </div>
    );
  }

  const scoreItems = [
    { 
      name: '視覚的インパクト', 
      score: data.score.score_aesthetic, 
      icon: SparklesIcon,
      color: 'text-purple-600'
    },
    { 
      name: '使いやすさ', 
      score: data.score.score_usability, 
      icon: CursorArrowRaysIcon,
      color: 'text-blue-600'
    },
    { 
      name: 'グリッド/整列', 
      score: data.score.score_alignment, 
      icon: ViewfinderCircleIcon,
      color: 'text-green-600'
    },
    { 
      name: 'アクセシビリティ', 
      score: data.score.score_accessibility, 
      icon: ShieldCheckIcon,
      color: 'text-yellow-600'
    },
    { 
      name: '一貫性', 
      score: data.score.score_consistency, 
      icon: SwatchIcon,
      color: 'text-pink-600'
    },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getUITypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'LP': 'ランディングページ',
      'Dashboard': 'ダッシュボード',
      'Form': 'フォーム',
      'Mobile App': 'モバイルアプリ',
      'E-commerce': 'ECサイト',
      'その他': 'その他'
    };
    return labels[type] || type;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {data.submission.project_name}
        </h1>
        <p className="text-gray-600 mb-4">{data.submission.description}</p>
        
        {data.submission.structure_note && (
          <div className="bg-gray-50 rounded p-4 mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">構造メモ（設計意図）</h3>
            <p className="text-gray-600 text-sm">{data.submission.structure_note}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
            {getUITypeLabel(data.score.ui_type)}
          </span>
          <span className="text-sm text-gray-500">
            評価日時: {new Date(data.submission.created_at).toLocaleString('ja-JP')}
          </span>
        </div>
      </div>

      {/* 総合スコア */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-8 mb-6 text-white">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">総合スコア</h2>
          <div className="text-6xl font-bold mb-2">{data.score.total_score}</div>
          <div className="text-lg opacity-90">/ 10.0</div>
        </div>
      </div>

      {/* 詳細スコア */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <ChartBarIcon className="w-6 h-6 mr-2" />
          詳細評価
        </h2>
        <div className="space-y-4">
          {scoreItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.name} className="flex items-center">
                <Icon className={`w-5 h-5 mr-3 ${item.color}`} />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-700 font-medium">{item.name}</span>
                    <span className={`font-bold ${getScoreColor(item.score)}`}>
                      {item.score.toFixed(1)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(item.score / 10) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI評価コメント */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <EyeIcon className="w-6 h-6 mr-2" />
          AI評価コメント
        </h2>
        <div className="prose max-w-none">
          <p className="text-gray-700 whitespace-pre-wrap">{data.score.review_text}</p>
        </div>
      </div>

      {/* アクション */}
      <div className="mt-6 flex justify-center space-x-4">
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          新しい評価を開始
        </button>
        {data.submission.figma_url && (
          <a
            href={data.submission.figma_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Figmaで開く
          </a>
        )}
      </div>
    </div>
  );
}