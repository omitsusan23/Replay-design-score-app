// /api/claude/analyze-design.ts
// Claude APIによるFigmaデザイン分析エンドポイント

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Claude API設定（Anthropic）
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

// 分析モード定義
type AnalysisMode = 'quick' | 'comprehensive' | 'detailed'

interface ClaudeAnalysisRequest {
  figma_url: string
  analysis_mode?: AnalysisMode
  custom_prompt?: string
}

interface ClaudeAnalysisResponse {
  genre: string
  ui_component_type: string
  scores: {
    aesthetic: number      // 0.0-1.0
    consistency: number    // 0.0-1.0
    hierarchy: number      // 0.0-1.0
    usability: number      // 0.0-1.0
    responsive: number     // 0.0-1.0
    accessibility: number  // 0.0-1.0
  }
  claude_summary: string
  claude_raw_response: string
  confidence_score: number
  processing_time_ms: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 認証確認
    if (!CLAUDE_API_KEY) {
      return NextResponse.json(
        { error: 'Claude API key not configured' },
        { status: 500 }
      )
    }

    // リクエストボディ解析
    const body: ClaudeAnalysisRequest = await request.json()
    const { figma_url, analysis_mode = 'comprehensive', custom_prompt } = body

    // URL検証
    if (!figma_url || !isValidFigmaUrl(figma_url)) {
      return NextResponse.json(
        { error: 'Valid Figma URL is required' },
        { status: 400 }
      )
    }

    // Claude分析プロンプト生成
    const analysisPrompt = generateAnalysisPrompt(figma_url, analysis_mode, custom_prompt)

    // Claude API呼び出し
    const claudeResponse = await callClaudeAPI(analysisPrompt)

    // レスポンス解析
    const analysisResult = parseClaudeResponse(claudeResponse)

    const processingTime = Date.now() - startTime

    const response: ClaudeAnalysisResponse = {
      ...analysisResult,
      claude_raw_response: claudeResponse,
      processing_time_ms: processingTime
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Claude analysis error:', error)
    
    return NextResponse.json(
      { 
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Figma URL検証
function isValidFigmaUrl(url: string): boolean {
  const figmaPattern = /^https:\/\/(?:www\.)?figma\.com\/(file|design|proto)\/[a-zA-Z0-9]+/
  return figmaPattern.test(url)
}

// 分析プロンプト生成
function generateAnalysisPrompt(
  figmaUrl: string, 
  mode: AnalysisMode, 
  customPrompt?: string
): string {
  const basePrompt = `
あなたはUI/UXデザインの専門家です。以下のFigma URLのデザインを分析し、JSON形式で回答してください。

Figma URL: ${figmaUrl}

以下の形式で分析結果を出力してください：

\`\`\`json
{
  "genre": "チャットUI|予約画面|ダッシュボード|フォーム|ナビゲーション|カード|モーダル|リスト|その他",
  "ui_component_type": "具体的なUIコンポーネント種別",
  "scores": {
    "aesthetic": 0.85,
    "consistency": 0.92,
    "hierarchy": 0.78,
    "usability": 0.88,
    "responsive": 0.75,
    "accessibility": 0.65
  },
  "summary": "デザインの簡潔なサマリー（1-2文）",
  "detailed_analysis": "詳細な分析結果",
  "confidence_score": 0.85
}
\`\`\`

評価基準：
- aesthetic: 視覚的魅力、色彩、レイアウトの美しさ
- consistency: デザインシステムの一貫性、統一感
- hierarchy: 情報階層の明確さ、視線誘導
- usability: 使いやすさ、直感性、操作性
- responsive: レスポンシブ対応、画面サイズ適応
- accessibility: アクセシビリティ、ユーザビリティ配慮

各スコアは0.0-1.0の範囲で評価してください。
confidence_scoreはあなたの分析の確信度です。
`

  // 分析モード別の追加指示
  const modeInstructions = {
    quick: `
簡潔な分析を行い、主要な要素のみを評価してください。
処理時間を優先し、基本的な項目に焦点を当てます。
`,
    comprehensive: `
包括的な分析を行い、すべての評価項目を詳細に検討してください。
デザインシステム、ユーザー体験、技術的実装の観点から評価します。
`,
    detailed: `
非常に詳細な分析を行い、以下の追加項目も含めてください：
- カラーパレット分析
- タイポグラフィ評価
- インタラクション設計
- 情報アーキテクチャ
- ブランド整合性
`
  }

  let fullPrompt = basePrompt + modeInstructions[mode]

  // カスタムプロンプト追加
  if (customPrompt) {
    fullPrompt += `\n\n追加指示：\n${customPrompt}`
  }

  return fullPrompt
}

// Claude API呼び出し
async function callClaudeAPI(prompt: string): Promise<string> {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,  // 一貫した分析のため低温度
      top_p: 0.9
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Claude API error: ${response.statusText} - ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  
  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error('Invalid Claude API response format')
  }

  return data.content[0].text
}

// Claude レスポンス解析
function parseClaudeResponse(rawResponse: string): Omit<ClaudeAnalysisResponse, 'claude_raw_response' | 'processing_time_ms'> {
  try {
    // JSON部分を抽出
    const jsonMatch = rawResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/)
    
    if (!jsonMatch) {
      // JSONブロックがない場合、直接解析を試行
      const fallbackResult = extractDataFromText(rawResponse)
      return fallbackResult
    }

    const jsonString = jsonMatch[1]
    const parsed = JSON.parse(jsonString)

    // データ検証と正規化
    return {
      genre: parsed.genre || 'その他',
      ui_component_type: parsed.ui_component_type || '不明',
      scores: {
        aesthetic: normalizeScore(parsed.scores?.aesthetic),
        consistency: normalizeScore(parsed.scores?.consistency),
        hierarchy: normalizeScore(parsed.scores?.hierarchy),
        usability: normalizeScore(parsed.scores?.usability),
        responsive: normalizeScore(parsed.scores?.responsive),
        accessibility: normalizeScore(parsed.scores?.accessibility)
      },
      claude_summary: parsed.summary || parsed.detailed_analysis?.substring(0, 200) + '...' || 'サマリーが生成されませんでした',
      confidence_score: normalizeScore(parsed.confidence_score) || 0.7
    }

  } catch (error) {
    console.warn('Failed to parse Claude JSON response, using fallback:', error)
    
    // フォールバック解析
    return extractDataFromText(rawResponse)
  }
}

// スコア正規化（0.0-1.0範囲）
function normalizeScore(score: any): number {
  if (typeof score !== 'number') return 0.5
  
  // 10点満点の場合は10で割る
  if (score > 1) score = score / 10
  
  return Math.max(0, Math.min(1, score))
}

// テキストからデータ抽出（フォールバック）
function extractDataFromText(text: string): Omit<ClaudeAnalysisResponse, 'claude_raw_response' | 'processing_time_ms'> {
  // ジャンル抽出
  const genrePatterns = [
    /(?:ジャンル|genre)[：:]?\s*([^\\n]+)/i,
    /(?:分類|category)[：:]?\s*([^\\n]+)/i
  ]
  
  let genre = 'その他'
  for (const pattern of genrePatterns) {
    const match = text.match(pattern)
    if (match) {
      genre = match[1].trim()
      break
    }
  }

  // スコア抽出
  const scores = {
    aesthetic: extractScoreFromText(text, ['aesthetic', '美観', '見た目']),
    consistency: extractScoreFromText(text, ['consistency', '一貫性']),
    hierarchy: extractScoreFromText(text, ['hierarchy', 'ヒエラルキー', '階層']),
    usability: extractScoreFromText(text, ['usability', 'ユーザビリティ', '使いやすさ']),
    responsive: extractScoreFromText(text, ['responsive', 'レスポンシブ']),
    accessibility: extractScoreFromText(text, ['accessibility', 'アクセシビリティ'])
  }

  return {
    genre,
    ui_component_type: 'その他',
    scores,
    claude_summary: text.substring(0, 200) + '...',
    confidence_score: 0.6  // フォールバック時は低め
  }
}

// テキストからスコア抽出
function extractScoreFromText(text: string, keywords: string[]): number {
  for (const keyword of keywords) {
    const patterns = [
      new RegExp(`${keyword}[：:]?\\s*([0-9.]+)`, 'i'),
      new RegExp(`${keyword}[：:]?\\s*([0-9.]+)\\s*[/／]\\s*10`, 'i'),
      new RegExp(`${keyword}[：:]?\\s*([0-9.]+)\\s*点`, 'i')
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        return normalizeScore(parseFloat(match[1]))
      }
    }
  }
  
  return 0.5  // デフォルト値
}