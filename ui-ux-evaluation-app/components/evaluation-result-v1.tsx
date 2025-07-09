'use client';

import { useState } from 'react';
import { V1EvaluationResponse, V1EvaluationScores } from '@/services/ai-evaluation-v1';
import { EvaluationComparison } from '@/services/evaluation-history.service';
import { 
  ChartBarIcon, 
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface EvaluationResultV1Props {
  evaluation: V1EvaluationResponse;
  comparison?: EvaluationComparison | null;
  onReevaluate?: () => void;
  version?: number;
}

export default function EvaluationResultV1({
  evaluation,
  comparison,
  onReevaluate,
  version = 1
}: EvaluationResultV1Props) {
  const [activeTab, setActiveTab] = useState<'scores' | 'feedback' | 'history'>('scores');

  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 8) return 'bg-green-100';
    if (score >= 6) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const renderScoreBar = (score: number): JSX.Element => (
    <div className="relative w-full bg-gray-200 rounded-full h-2">
      <div
        className={`absolute top-0 left-0 h-full rounded-full transition-all ${
          score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-yellow-500' : 'bg-red-500'
        }`}
        style={{ width: `${(score / 10) * 100}%` }}
      />
    </div>
  );

  const renderScoreComparison = (current: number, previous?: number): JSX.Element | null => {
    if (!previous) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 0.1) return null;

    return (
      <span className={`text-xs ml-2 ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
        {diff > 0 ? (
          <ArrowTrendingUpIcon className="inline w-3 h-3" />
        ) : (
          <ArrowTrendingDownIcon className="inline w-3 h-3" />
        )}
        {Math.abs(diff).toFixed(1)}
      </span>
    );
  };

  const scoreLabels: Record<keyof V1EvaluationScores, string> = {
    visual_hierarchy: '視覚的階層',
    color_harmony: '色彩調和',
    typography: 'タイポグラフィ',
    layout_balance: 'レイアウトバランス',
    consistency: '一貫性',
    usability: '使いやすさ',
    accessibility: 'アクセシビリティ',
    innovation: '革新性',
    brand_alignment: 'ブランド整合性',
    emotional_impact: '感情的インパクト'
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              UI/UX評価結果 v1.0
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center">
                <ClockIcon className="w-4 h-4 mr-1" />
                {new Date(evaluation.timestamp).toLocaleString('ja-JP')}
              </span>
              {version > 1 && (
                <span className="flex items-center text-blue-600">
                  <DocumentDuplicateIcon className="w-4 h-4 mr-1" />
                  Version {version}
                </span>
              )}
            </div>
          </div>
          {onReevaluate && (
            <button
              onClick={onReevaluate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              再評価
            </button>
          )}
        </div>

        {/* 総合スコアとUIタイプ */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className={`p-4 rounded-lg ${getScoreBgColor(evaluation.totalScore)}`}>
            <div className="text-3xl font-bold mb-1">
              <span className={getScoreColor(evaluation.totalScore)}>
                {evaluation.totalScore}
              </span>
              <span className="text-gray-600 text-lg"> / 100</span>
              {comparison?.improvement && (
                <span className={`text-base ml-2 ${
                  comparison.improvement.totalScore > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ({comparison.improvement.totalScore > 0 ? '+' : ''}{comparison.improvement.totalScore.toFixed(1)})
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700">総合スコア</p>
          </div>
          <div className="p-4 bg-gray-100 rounded-lg">
            <div className="text-xl font-semibold text-gray-900 mb-1">
              {evaluation.uiType}
            </div>
            <p className="text-sm text-gray-700">UIタイプ</p>
          </div>
        </div>

        {/* 小講評 */}
        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-900">{evaluation.shortReview}</p>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('scores')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'scores'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <ChartBarIcon className="inline w-4 h-4 mr-2" />
              詳細スコア
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'feedback'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <ExclamationTriangleIcon className="inline w-4 h-4 mr-2" />
              フィードバック
            </button>
            {comparison && (
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <ClockIcon className="inline w-4 h-4 mr-2" />
                履歴比較
              </button>
            )}
          </nav>
        </div>

        <div className="p-6">
          {/* 詳細スコアタブ */}
          {activeTab === 'scores' && (
            <div className="space-y-4">
              {Object.entries(evaluation.scores).map(([key, score]) => {
                const previousScore = comparison?.previous?.scores[key as keyof V1EvaluationScores];
                return (
                  <div key={key} className="flex items-center gap-4">
                    <div className="w-40 text-sm font-medium text-gray-700">
                      {scoreLabels[key as keyof V1EvaluationScores]}
                    </div>
                    <div className="flex-1">
                      {renderScoreBar(score)}
                    </div>
                    <div className="w-20 text-right">
                      <span className={`font-semibold ${getScoreColor(score)}`}>
                        {score.toFixed(1)}
                      </span>
                      {renderScoreComparison(score, previousScore)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* フィードバックタブ */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  辛口フィードバック
                </h3>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-900 whitespace-pre-wrap">
                    {evaluation.criticalFeedback}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  改善提案
                </h3>
                <ul className="space-y-2">
                  {evaluation.improvements.map((improvement, index) => (
                    <li key={index} className="flex items-start">
                      <span className="inline-block w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span className="ml-3 text-sm text-gray-700">{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 履歴比較タブ */}
          {activeTab === 'history' && comparison && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">前回評価</h3>
                  <div className="p-4 bg-gray-100 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">
                      {comparison.previous?.totalScore.toFixed(1)}点
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(comparison.previous?.timestamp || '').toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">今回評価</h3>
                  <div className="p-4 bg-blue-100 rounded-lg">
                    <p className="text-2xl font-bold text-blue-900">
                      {comparison.current.totalScore.toFixed(1)}点
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {comparison.improvement && comparison.improvement.totalScore > 0 ? '改善' : '低下'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  項目別改善度
                </h3>
                <div className="space-y-2">
                  {comparison.improvement && Object.entries(comparison.improvement.categoryImprovements)
                    .sort(([, a], [, b]) => b - a)
                    .map(([key, diff]) => (
                      <div key={key} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50">
                        <span className="text-sm text-gray-700">
                          {scoreLabels[key as keyof V1EvaluationScores]}
                        </span>
                        <span className={`text-sm font-medium ${
                          diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}