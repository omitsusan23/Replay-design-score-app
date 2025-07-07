'use client';

import { useState } from 'react';
import UISubmissionForm from '../../../../components/ui-submission-form';
import { EvaluationResponse } from '../../../../services/ai-evaluation';

export default function Home() {
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('評価に失敗しました');
      }

      const result = await response.json();
      setEvaluationResult(result);
    } catch (error) {
      console.error('Error:', error);
      alert('評価中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            UI/UX 評価アプリ
          </h1>
          <p className="text-lg text-gray-600">
            AIによる専門的なフィードバックで、あなたのデザインスキルを向上させましょう
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <UISubmissionForm onSubmit={handleSubmit} isLoading={isLoading} />
          </div>
          
          <div>
            {evaluationResult ? (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">評価結果</h3>
                
                <div className="mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <span className="text-3xl font-bold text-blue-600">
                      {evaluationResult.totalScore}
                    </span>
                    <span className="text-lg text-gray-600">/140点</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-800">項目別スコア</h4>
                  {Object.entries(evaluationResult.scores).map(([key, score]) => {
                    const categoryNames: Record<string, string> = {
                      color_contrast: '配色・コントラスト',
                      information_organization: '情報整理・密度',
                      visual_guidance: '視線誘導・ナビゲーション',
                      accessibility: 'アクセシビリティ',
                      ui_consistency: 'UIの一貫性・余白',
                      visual_impact: '第一印象・ビジュアルインパクト',
                      cta_clarity: 'CTAの明瞭さ'
                    };

                    return (
                      <div key={key} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{categoryNames[key]}</span>
                        <span className="font-semibold text-gray-900">{score}/20</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-2">詳細フィードバック</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {evaluationResult.feedback}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-6 text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">評価結果</h3>
                <p className="text-gray-600">
                  左側のフォームからUIを提出すると、AIによる詳細な評価結果がここに表示されます。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
