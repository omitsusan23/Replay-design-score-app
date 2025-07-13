'use client';

import { useState, useEffect } from 'react';
import { Search, Upload, Loader2, CheckCircle, AlertCircle, Copy, Eye } from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  ui_type: string;
  description: string;
  copied_content: string;
  app_name: string;
  text_score: number;
  vector_score: number;
  combined_score: number;
  evaluation_data: any;
}

interface EvaluationResult {
  consistency_score: number;
  quality: {
    reusability: string;
    maintainability: string;
    accessibility: string;
  };
  improvements: string[];
  ui_classification: {
    primary_type: string;
    secondary_types: string[];
  };
}

export default function UIRAGPage() {
  const [copiedContent, setCopiedContent] = useState('');
  const [appName, setAppName] = useState('');
  const [appCategory, setAppCategory] = useState('');
  const [screenContext, setScreenContext] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'paste' | 'search'>('paste');
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // コピペ内容の評価と保存
  const handleEvaluate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ui-rag/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copiedContent,
          appName,
          appCategory,
          screenContext: { description: screenContext }
        })
      });
      
      const data = await response.json();
      setEvaluationResult(data.evaluation);
      
      // 評価後、自動的に検索タブに切り替え
      setActiveTab('search');
      setSearchQuery(copiedContent.substring(0, 50));
    } catch (error) {
      console.error('評価エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ハイブリッド検索の実行
  const handleSearch = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ui-rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      
      const data = await response.json();
      setSearchResults(data.results);
    } catch (error) {
      console.error('検索エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">UI/UX RAG 学習システム</h1>
        
        {/* タブ切り替え */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab('paste')}
            className={`px-6 py-3 rounded-t-lg font-medium transition-colors ${
              activeTab === 'paste' 
                ? 'bg-white text-blue-600 border-b-2 border-blue-600' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Copy className="inline-block w-4 h-4 mr-2" />
            コピペ評価
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-6 py-3 rounded-t-lg font-medium transition-colors ${
              activeTab === 'search' 
                ? 'bg-white text-blue-600 border-b-2 border-blue-600' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Search className="inline-block w-4 h-4 mr-2" />
            パターン検索
          </button>
        </div>

        {/* コピペ評価タブ */}
        {activeTab === 'paste' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  アプリ名
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="例: Spotify, Netflix, Notion"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  カテゴリ
                </label>
                <select
                  value={appCategory}
                  onChange={(e) => setAppCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">選択してください</option>
                  <option value="music">音楽</option>
                  <option value="video">動画</option>
                  <option value="productivity">生産性</option>
                  <option value="social">ソーシャル</option>
                  <option value="ecommerce">Eコマース</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                画面コンテキスト
              </label>
              <input
                type="text"
                value={screenContext}
                onChange={(e) => setScreenContext(e.target.value)}
                placeholder="例: ログイン画面、ダッシュボード、プレイヤーUI"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                コピーしたUIコード
              </label>
              <textarea
                value={copiedContent}
                onChange={(e) => setCopiedContent(e.target.value)}
                placeholder="HTMLやJSXコードを貼り付けてください..."
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
            </div>

            <button
              onClick={handleEvaluate}
              disabled={!copiedContent || !appName || !appCategory || isLoading}
              className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-5 w-5" />
                  評価中...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  評価して保存
                </>
              )}
            </button>

            {/* 評価結果の表示 */}
            {evaluationResult && (
              <div className="mt-8 p-6 bg-blue-50 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-900 mb-4">評価結果</h3>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">整合性スコア</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {(evaluationResult.consistency_score * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">UI分類</div>
                    <div className="text-lg font-semibold text-gray-800">
                      {evaluationResult.ui_classification.primary_type}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">品質評価</div>
                    <div className="flex space-x-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        evaluationResult.quality.reusability === '高' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        再利用性: {evaluationResult.quality.reusability}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-2">改善提案</h4>
                  <ul className="space-y-2">
                    {evaluationResult.improvements.map((improvement, index) => (
                      <li key={index} className="flex items-start">
                        <AlertCircle className="w-4 h-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 検索タブ */}
        {activeTab === 'search' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex space-x-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="UIパターンを検索..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                disabled={!searchQuery || isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* 検索結果 */}
            <div className="mt-8 space-y-4">
              {searchResults.map((result) => (
                <div key={result.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{result.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{result.description}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {result.app_name && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                          {result.app_name}
                        </span>
                      )}
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                        {result.ui_type}
                      </span>
                    </div>
                  </div>

                  {/* スコア表示 */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">テキストスコア</div>
                      <div className="text-lg font-semibold text-orange-600">
                        {(result.text_score * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">ベクトルスコア</div>
                      <div className="text-lg font-semibold text-purple-600">
                        {(result.vector_score * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">総合スコア</div>
                      <div className="text-lg font-semibold text-green-600">
                        {(result.combined_score * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* 詳細表示ボタン */}
                  <button
                    onClick={() => setShowDetails(showDetails === result.id ? null : result.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {showDetails === result.id ? '詳細を隠す' : '詳細を表示'}
                  </button>

                  {/* 詳細コンテンツ */}
                  {showDetails === result.id && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <pre className="text-xs text-gray-700 overflow-x-auto">
                        {result.copied_content}
                      </pre>
                      {result.evaluation_data && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">評価データ</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">総合スコア:</span>
                              <span className="ml-2 font-medium">
                                {result.evaluation_data.overall_score}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">学習優先度:</span>
                              <span className="ml-2 font-medium">
                                {result.evaluation_data.learning_priority}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}