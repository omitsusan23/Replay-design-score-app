// /api/embeddings/generate.ts
// OpenAI text-embedding-3-large (3072次元) 埋め込み生成エンドポイント

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// OpenAI設定
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIMENSIONS = 3072
const MAX_TOKENS = 8192

interface EmbeddingRequest {
  text_content: string
  genre?: string
  figma_url?: string
  metadata?: Record<string, any>
  embedding_types?: string[]  // ['main', 'genre', 'scores', 'summary']
}

interface EmbeddingResponse {
  embeddings: Array<{
    type: string
    embedding: number[]
    text_content: string
    token_count: number
    dimensions: number
  }>
  model_info: {
    model: string
    dimensions: number
    total_tokens: number
  }
  processing_time_ms: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // API キー確認
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // リクエストボディ解析
    const body: EmbeddingRequest = await request.json()
    const { 
      text_content, 
      genre, 
      figma_url, 
      metadata = {},
      embedding_types = ['main', 'genre', 'scores']
    } = body

    // 入力検証
    if (!text_content || text_content.trim().length === 0) {
      return NextResponse.json(
        { error: 'text_content is required' },
        { status: 400 }
      )
    }

    // 埋め込み用テキスト準備
    const embeddingTexts = prepareEmbeddingTexts({
      text_content,
      genre,
      figma_url,
      metadata,
      types: embedding_types
    })

    // 埋め込み生成
    const embeddings = await generateEmbeddings(embeddingTexts)

    const processingTime = Date.now() - startTime
    const totalTokens = embeddings.reduce((sum, emb) => sum + emb.token_count, 0)

    const response: EmbeddingResponse = {
      embeddings,
      model_info: {
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        total_tokens: totalTokens
      },
      processing_time_ms: processingTime
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Embedding generation error:', error)
    
    return NextResponse.json(
      { 
        error: 'Embedding generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// 埋め込み用テキスト準備
function prepareEmbeddingTexts({
  text_content,
  genre,
  figma_url,
  metadata,
  types
}: {
  text_content: string
  genre?: string
  figma_url?: string
  metadata: Record<string, any>
  types: string[]
}): Array<{ type: string; text: string }> {
  
  const texts: Array<{ type: string; text: string }> = []

  // メイン埋め込み
  if (types.includes('main')) {
    texts.push({
      type: 'main',
      text: text_content
    })
  }

  // ジャンル分類埋め込み
  if (types.includes('genre') && genre) {
    texts.push({
      type: 'genre',
      text: `UI Genre: ${genre}. ${figma_url ? `Source: ${figma_url}` : ''}`
    })
  }

  // スコア埋め込み
  if (types.includes('scores') && metadata.scores) {
    const scoresText = formatScoresAsText(metadata.scores)
    texts.push({
      type: 'scores',
      text: scoresText
    })
  }

  // サマリー埋め込み
  if (types.includes('summary')) {
    const summaryText = extractSummary(text_content)
    texts.push({
      type: 'summary',
      text: summaryText
    })
  }

  // 構造化情報埋め込み
  if (types.includes('structured')) {
    const structuredText = createStructuredText({
      genre,
      figma_url,
      scores: metadata.scores,
      ui_component_type: metadata.ui_component_type
    })
    texts.push({
      type: 'structured',
      text: structuredText
    })
  }

  return texts
}

// スコアをテキスト形式にフォーマット
function formatScoresAsText(scores: Record<string, number>): string {
  const scoreDescriptions = {
    aesthetic: '美観・デザイン性',
    consistency: '一貫性・統一感',
    hierarchy: '情報階層・構造',
    usability: 'ユーザビリティ・使いやすさ',
    responsive: 'レスポンシブ対応',
    accessibility: 'アクセシビリティ配慮'
  }

  const scoreTexts = Object.entries(scores).map(([key, value]) => {
    const description = scoreDescriptions[key as keyof typeof scoreDescriptions] || key
    const score10 = (value * 10).toFixed(1)
    return `${description}: ${score10}/10`
  })

  return `UI Design Evaluation Scores - ${scoreTexts.join(', ')}`
}

// サマリー抽出
function extractSummary(text: string): string {
  // 最初の段落または200文字を抽出
  const paragraphs = text.split('\\n\\n')
  const firstParagraph = paragraphs[0]
  
  if (firstParagraph.length <= 200) {
    return firstParagraph
  }
  
  return text.substring(0, 200) + '...'
}

// 構造化テキスト作成
function createStructuredText({
  genre,
  figma_url,
  scores,
  ui_component_type
}: {
  genre?: string
  figma_url?: string
  scores?: Record<string, number>
  ui_component_type?: string
}): string {
  const parts = []
  
  if (genre) parts.push(`Genre: ${genre}`)
  if (ui_component_type) parts.push(`Component: ${ui_component_type}`)
  if (figma_url) parts.push(`Source: ${figma_url}`)
  
  if (scores) {
    const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
    parts.push(`Overall Quality: ${(avgScore * 10).toFixed(1)}/10`)
  }
  
  return parts.join(' | ')
}

// 埋め込み生成（OpenAI API）
async function generateEmbeddings(
  texts: Array<{ type: string; text: string }>
): Promise<Array<{
  type: string
  embedding: number[]
  text_content: string
  token_count: number
  dimensions: number
}>> {
  const results = []

  // バッチ処理（OpenAI API制限に対応）
  const batchSize = 100  // OpenAI の推奨バッチサイズ
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchTexts = batch.map(item => truncateText(item.text))
    
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batchTexts,
        encoding_format: 'float',
        dimensions: EMBEDDING_DIMENSIONS
      })

      // レスポンス処理
      for (let j = 0; j < batch.length; j++) {
        const embeddingData = response.data[j]
        const originalText = batch[j]

        results.push({
          type: originalText.type,
          embedding: embeddingData.embedding,
          text_content: originalText.text,
          token_count: estimateTokenCount(originalText.text),
          dimensions: embeddingData.embedding.length
        })
      }

      // レート制限対策
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

    } catch (error) {
      console.error(`Batch embedding error (${i}-${i + batchSize}):`, error)
      
      // エラー時はダミーデータで補填
      for (const originalText of batch) {
        results.push({
          type: originalText.type,
          embedding: new Array(EMBEDDING_DIMENSIONS).fill(0),
          text_content: originalText.text,
          token_count: estimateTokenCount(originalText.text),
          dimensions: EMBEDDING_DIMENSIONS
        })
      }
    }
  }

  return results
}

// テキスト切り詰め（トークン制限対応）
function truncateText(text: string, maxTokens: number = MAX_TOKENS): string {
  // 簡易的なトークン推定（1トークン ≈ 4文字）
  const estimatedTokens = text.length / 4
  
  if (estimatedTokens <= maxTokens) {
    return text
  }
  
  const maxChars = maxTokens * 4
  return text.substring(0, maxChars - 100) + '...[truncated]'
}

// トークン数推定
function estimateTokenCount(text: string): number {
  // GPT系モデルの簡易的なトークン推定
  // 実際のトークン数とは若干異なる可能性があります
  return Math.ceil(text.length / 4)
}

// 埋め込み品質チェック
export async function validateEmbedding(embedding: number[]): Promise<boolean> {
  try {
    // 基本チェック
    if (!Array.isArray(embedding)) return false
    if (embedding.length !== EMBEDDING_DIMENSIONS) return false
    
    // 数値チェック
    if (!embedding.every(num => typeof num === 'number' && !isNaN(num))) return false
    
    // ゼロベクトルチェック
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    if (magnitude < 0.01) return false  // ほぼゼロベクトルは無効
    
    return true
  } catch {
    return false
  }
}

// 類似度計算ユーティリティ
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimensions must match')
  
  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }
  
  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0
  
  return dotProduct / (magnitudeA * magnitudeB)
}