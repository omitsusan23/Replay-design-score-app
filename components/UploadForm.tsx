'use client'

import React, { useState, useRef } from 'react'
import { Upload, Send, AlertCircle, CheckCircle, Loader2, Link, Image, FileText } from 'lucide-react'

// 型定義
interface ClaudeAnalysisResult {
  genre: string
  ui_component_type: string
  scores: {
    aesthetic: number
    consistency: number
    hierarchy: number
    usability: number
    responsive: number
    accessibility: number
  }
  claude_summary: string
  claude_raw_response: string
  confidence_score: number
}

interface ProcessingStatus {
  step: 'uploading' | 'analyzing' | 'embedding' | 'saving' | 'completed' | 'error'
  message: string
  progress: number
}

interface UploadResult {
  training_example_id: string
  embedding_ids: string[]
  meilisearch_id: string
  analysis: ClaudeAnalysisResult
  figma_url: string
}

const UploadForm: React.FC = () => {
  // ステート管理
  const [figmaUrl, setFigmaUrl] = useState('')
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<ProcessingStatus | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // UI設定
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [urls, setUrls] = useState<string[]>([''])
  
  // Ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // URL検証
  const validateFigmaUrl = (url: string): boolean => {
    const figmaPattern = /^https:\/\/(?:www\.)?figma\.com\/(file|design|proto)\/[a-zA-Z0-9]+/
    return figmaPattern.test(url)
  }

  // バッチURLs管理
  const addUrlField = () => {
    setUrls([...urls, ''])
  }

  const removeUrlField = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index))
  }

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls]
    newUrls[index] = value
    setUrls(newUrls)
  }

  // CSVアップロード処理
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\\n').filter(line => line.trim())
      const csvUrls = lines.map(line => line.split(',')[0].trim()).filter(url => url)
      setUrls(csvUrls)
      setBatchMode(true)
    }
    reader.readAsText(file)
  }

  // メイン処理関数
  const processDesignAnalysis = async () => {
    const urlsToProcess = batchMode ? urls.filter(url => url.trim()) : [figmaUrl]
    
    if (urlsToProcess.length === 0) {
      setError('最低1つのFigma URLを入力してください')
      return
    }

    // URL検証
    const invalidUrls = urlsToProcess.filter(url => !validateFigmaUrl(url))
    if (invalidUrls.length > 0) {
      setError(`無効なFigma URL: ${invalidUrls.join(', ')}`)
      return
    }

    setProcessing(true)
    setError(null)
    setResults([])

    try {
      for (let i = 0; i < urlsToProcess.length; i++) {
        const currentUrl = urlsToProcess[i]
        
        // ステップ1: アップロード開始
        setStatus({
          step: 'uploading',
          message: `Figma URLを処理中... (${i + 1}/${urlsToProcess.length})`,
          progress: (i / urlsToProcess.length) * 100
        })

        // ステップ2: Claude分析
        setStatus({
          step: 'analyzing',
          message: 'Claude APIでデザイン分析中...',
          progress: ((i + 0.3) / urlsToProcess.length) * 100
        })

        const analysisResponse = await fetch('/api/claude/analyze-design', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            figma_url: currentUrl,
            analysis_mode: 'comprehensive'
          }),
        })

        if (!analysisResponse.ok) {
          throw new Error(`Claude分析エラー: ${analysisResponse.statusText}`)
        }

        const analysisData = await analysisResponse.json()

        // ステップ3: 埋め込み生成
        setStatus({
          step: 'embedding',
          message: 'OpenAI Embeddingでベクトル化中...',
          progress: ((i + 0.6) / urlsToProcess.length) * 100
        })

        const embeddingResponse = await fetch('/api/embeddings/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text_content: analysisData.claude_raw_response,
            genre: analysisData.genre,
            figma_url: currentUrl,
            metadata: {
              scores: analysisData.scores,
              ui_component_type: analysisData.ui_component_type
            }
          }),
        })

        if (!embeddingResponse.ok) {
          throw new Error(`埋め込み生成エラー: ${embeddingResponse.statusText}`)
        }

        const embeddingData = await embeddingResponse.json()

        // ステップ4: データ保存（Supabase + Meilisearch）
        setStatus({
          step: 'saving',
          message: 'データベースに保存中...',
          progress: ((i + 0.9) / urlsToProcess.length) * 100
        })

        const saveResponse = await fetch('/api/data/save-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            figma_url: currentUrl,
            analysis: analysisData,
            embeddings: embeddingData.embeddings,
            save_to_meilisearch: true
          }),
        })

        if (!saveResponse.ok) {
          throw new Error(`データ保存エラー: ${saveResponse.statusText}`)
        }

        const saveData = await saveResponse.json()

        // 結果追加
        setResults(prev => [...prev, {
          training_example_id: saveData.training_example_id,
          embedding_ids: saveData.embedding_ids,
          meilisearch_id: saveData.meilisearch_id,
          analysis: analysisData,
          figma_url: currentUrl
        }])
      }

      // 完了
      setStatus({
        step: 'completed',
        message: `${urlsToProcess.length}件のデザイン分析が完了しました！`,
        progress: 100
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
      setStatus({
        step: 'error',
        message: 'エラーが発生しました',
        progress: 0
      })
    } finally {
      setProcessing(false)
    }
  }

  // 結果表示用コンポーネント
  const ResultCard: React.FC<{ result: UploadResult }> = ({ result }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">
            {result.analysis.genre} - {result.analysis.ui_component_type}
          </h3>
          <p className="text-sm text-gray-500 break-all">{result.figma_url}</p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            完了
          </span>
        </div>
      </div>

      {/* スコア表示 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {Object.entries(result.analysis.scores).map(([key, value]) => (
          <div key={key} className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {(value * 10).toFixed(1)}
            </div>
            <div className="text-sm text-gray-600 capitalize">
              {key === 'aesthetic' && '美観'}
              {key === 'consistency' && '一貫性'}
              {key === 'hierarchy' && '階層'}
              {key === 'usability' && '使いやすさ'}
              {key === 'responsive' && 'レスポンシブ'}
              {key === 'accessibility' && 'アクセシビリティ'}
            </div>
          </div>
        ))}
      </div>

      {/* サマリー */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">Claude分析サマリー</h4>
        <p className="text-sm text-gray-700">{result.analysis.claude_summary}</p>
      </div>

      {/* 技術情報 */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>埋め込みID: {result.embedding_ids.length}件</span>
        <span>信頼度: {(result.analysis.confidence_score * 100).toFixed(1)}%</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🎨 Figma デザイン分析システム
        </h1>
        <p className="text-gray-600">
          FigmaのUIデザインをClaude APIで分析し、OpenAI埋め込みでベクトル検索可能にします
        </p>
      </div>

      {/* メインフォーム */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">デザイン分析</h2>
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">詳細設定</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => setBatchMode(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">バッチ処理</span>
            </label>
          </div>
        </div>

        {/* 単一URL入力 */}
        {!batchMode && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Link className="inline mr-2" size={16} />
              Figma URL
            </label>
            <input
              type="url"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/design/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={processing}
            />
            {figmaUrl && !validateFigmaUrl(figmaUrl) && (
              <p className="mt-1 text-sm text-red-600">有効なFigma URLを入力してください</p>
            )}
          </div>
        )}

        {/* バッチ入力 */}
        {batchMode && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                <FileText className="inline mr-2" size={16} />
                複数のFigma URL
              </label>
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  CSVアップロード
                </button>
                <button
                  type="button"
                  onClick={addUrlField}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + URL追加
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <div className="space-y-2">
              {urls.map((url, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateUrl(index, e.target.value)}
                    placeholder={`Figma URL ${index + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={processing}
                  />
                  {urls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUrlField(index)}
                      className="text-red-600 hover:text-red-800"
                      disabled={processing}
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 詳細設定 */}
        {showAdvanced && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-3">詳細設定</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">分析モード</label>
                <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
                  <option value="comprehensive">包括的分析</option>
                  <option value="quick">クイック分析</option>
                  <option value="detailed">詳細分析</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">信頼度閾値</label>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.1"
                  defaultValue="0.7"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* 実行ボタン */}
        <button
          onClick={processDesignAnalysis}
          disabled={processing || (!batchMode && !figmaUrl) || (batchMode && urls.every(url => !url.trim()))}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {processing ? (
            <>
              <Loader2 className="animate-spin mr-2" size={20} />
              処理中...
            </>
          ) : (
            <>
              <Send className="mr-2" size={20} />
              デザイン分析開始
            </>
          )}
        </button>
      </div>

      {/* ステータス表示 */}
      {status && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center mb-4">
            {status.step === 'error' ? (
              <AlertCircle className="text-red-500 mr-2" size={20} />
            ) : status.step === 'completed' ? (
              <CheckCircle className="text-green-500 mr-2" size={20} />
            ) : (
              <Loader2 className="animate-spin text-blue-500 mr-2" size={20} />
            )}
            <span className="font-medium">{status.message}</span>
          </div>
          
          {/* プログレスバー */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* 結果表示 */}
      {results.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            分析結果 ({results.length}件)
          </h2>
          <div className="space-y-6">
            {results.map((result, index) => (
              <ResultCard key={index} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default UploadForm