// /api/data/save-complete.ts
// Supabase + Meilisearch 統合データ保存エンドポイント

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MeiliSearch } from 'meilisearch'

// Supabase設定
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:5432'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Meilisearch設定
const meilisearchUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700'
const meilisearchKey = process.env.MEILISEARCH_API_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)
const meiliSearch = new MeiliSearch({
  host: meilisearchUrl,
  apiKey: meilisearchKey,
})

interface SaveCompleteRequest {
  figma_url: string
  analysis: {
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
  embeddings: Array<{
    type: string
    embedding: number[]
    text_content: string
    token_count: number
    dimensions: number
  }>
  save_to_meilisearch?: boolean
  metadata?: Record<string, any>
}

interface SaveCompleteResponse {
  training_example_id: string
  embedding_ids: string[]
  meilisearch_id?: string
  processing_summary: {
    supabase_saved: boolean
    meilisearch_saved: boolean
    embeddings_count: number
    total_processing_time_ms: number
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // リクエストボディ解析
    const body: SaveCompleteRequest = await request.json()
    const { 
      figma_url, 
      analysis, 
      embeddings, 
      save_to_meilisearch = true,
      metadata = {}
    } = body

    // 入力検証
    if (!figma_url || !analysis || !embeddings || embeddings.length === 0) {
      return NextResponse.json(
        { error: 'figma_url, analysis, and embeddings are required' },
        { status: 400 }
      )
    }

    // 1. training_examples テーブルに保存
    const trainingExampleId = await saveTrainingExample(figma_url, analysis, metadata)

    // 2. design_embeddings テーブルに保存
    const embeddingIds = await saveDesignEmbeddings(trainingExampleId, embeddings)

    // 3. Meilisearch に保存（オプション）
    let meilisearchId: string | undefined
    if (save_to_meilisearch) {
      meilisearchId = await saveMeilisearchDocument(
        trainingExampleId,
        figma_url,
        analysis,
        embeddings,
        metadata
      )
    }

    const processingTime = Date.now() - startTime

    const response: SaveCompleteResponse = {
      training_example_id: trainingExampleId,
      embedding_ids: embeddingIds,
      meilisearch_id: meilisearchId,
      processing_summary: {
        supabase_saved: true,
        meilisearch_saved: !!meilisearchId,
        embeddings_count: embeddings.length,
        total_processing_time_ms: processingTime
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Complete save error:', error)
    
    return NextResponse.json(
      { 
        error: 'Data save failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// training_examples テーブル保存
async function saveTrainingExample(
  figmaUrl: string,
  analysis: SaveCompleteRequest['analysis'],
  metadata: Record<string, any>
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('training_examples')
      .insert({
        figma_url: figmaUrl,
        genre: analysis.genre,
        ui_component_type: analysis.ui_component_type,
        score_aesthetic: analysis.scores.aesthetic,
        score_consistency: analysis.scores.consistency,
        score_hierarchy: analysis.scores.hierarchy,
        score_usability: analysis.scores.usability,
        score_responsive: analysis.scores.responsive,
        score_accessibility: analysis.scores.accessibility,
        claude_raw_response: analysis.claude_raw_response,
        claude_summary: analysis.claude_summary,
        upload_source: 'upload_form',
        processing_status: 'completed',
        tags: extractTagsFromAnalysis(analysis)
      })
      .select('id')
      .single()

    if (error) {
      throw new Error(`Supabase training_examples error: ${error.message}`)
    }

    if (!data?.id) {
      throw new Error('Failed to get training_example ID')
    }

    return data.id

  } catch (error) {
    console.error('Save training example error:', error)
    throw error
  }
}

// design_embeddings テーブル保存
async function saveDesignEmbeddings(
  exampleId: string,
  embeddings: SaveCompleteRequest['embeddings']
): Promise<string[]> {
  try {
    const embeddingRecords = embeddings.map(emb => ({
      example_id: exampleId,
      embedding: emb.embedding,
      text_content: emb.text_content,
      embedding_type: emb.type,
      model_name: 'text-embedding-3-large',
      embedding_dimensions: emb.dimensions,
      token_count: emb.token_count,
      metadata: {
        embedding_type: emb.type,
        token_count: emb.token_count,
        generated_at: new Date().toISOString()
      }
    }))

    const { data, error } = await supabase
      .from('design_embeddings')
      .insert(embeddingRecords)
      .select('id')

    if (error) {
      throw new Error(`Supabase design_embeddings error: ${error.message}`)
    }

    if (!data || data.length === 0) {
      throw new Error('Failed to save embeddings')
    }

    return data.map(item => item.id)

  } catch (error) {
    console.error('Save design embeddings error:', error)
    throw error
  }
}

// Meilisearch ドキュメント保存
async function saveMeilisearchDocument(
  exampleId: string,
  figmaUrl: string,
  analysis: SaveCompleteRequest['analysis'],
  embeddings: SaveCompleteRequest['embeddings'],
  metadata: Record<string, any>
): Promise<string> {
  try {
    const index = meiliSearch.index('design-embeddings')

    // Meilisearch用ドキュメント構築
    const document = {
      id: exampleId,
      figma_url: figmaUrl,
      title: `${analysis.genre} - ${analysis.ui_component_type}`,
      description: analysis.claude_summary,
      content: analysis.claude_raw_response,
      genre: analysis.genre,
      ui_component_type: analysis.ui_component_type,
      
      // スコア（検索・フィルタ用）
      total_score: Object.values(analysis.scores).reduce((a, b) => a + b, 0) / Object.values(analysis.scores).length,
      score_aesthetic: analysis.scores.aesthetic,
      score_consistency: analysis.scores.consistency,
      score_hierarchy: analysis.scores.hierarchy,
      score_usability: analysis.scores.usability,
      score_responsive: analysis.scores.responsive,
      score_accessibility: analysis.scores.accessibility,
      
      // 検索用タグ
      tags: extractTagsFromAnalysis(analysis),
      
      // メタデータ
      confidence_score: analysis.confidence_score,
      processing_status: 'completed',
      created_at: new Date().toISOString(),
      
      // 埋め込み情報（検索用）
      embedding_types: embeddings.map(emb => emb.type),
      embedding_count: embeddings.length,
      
      // 追加メタデータ
      ...metadata
    }

    // ドキュメント追加
    const result = await index.addDocuments([document])
    
    // インデックス更新完了まで待機（オプション）
    if (result.taskUid) {
      await index.waitForTask(result.taskUid, {
        timeOutMs: 10000,  // 10秒タイムアウト
        intervalMs: 100    // 100ms間隔でチェック
      })
    }

    return exampleId

  } catch (error) {
    console.error('Save Meilisearch document error:', error)
    // Meilisearch エラーは非致命的として処理を続行
    throw error
  }
}

// 分析結果からタグ抽出
function extractTagsFromAnalysis(analysis: SaveCompleteRequest['analysis']): string[] {
  const tags: string[] = []

  // ジャンルベースタグ
  tags.push(analysis.genre)
  
  // コンポーネントタイプ
  if (analysis.ui_component_type) {
    tags.push(analysis.ui_component_type)
  }

  // スコアベースタグ
  const scores = analysis.scores
  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length

  if (avgScore >= 0.8) tags.push('high-quality')
  else if (avgScore >= 0.6) tags.push('medium-quality')
  else tags.push('needs-improvement')

  // 特定スコアの高い項目
  Object.entries(scores).forEach(([key, value]) => {
    if (value >= 0.8) {
      tags.push(`excellent-${key}`)
    }
  })

  // 信頼度ベース
  if (analysis.confidence_score >= 0.8) {
    tags.push('high-confidence')
  }

  return [...new Set(tags)]  // 重複除去
}

// データ検索用ヘルパー関数
export async function searchDesignData(
  query: string,
  filters: {
    genre?: string
    minScore?: number
    limit?: number
  } = {}
) {
  try {
    const index = meiliSearch.index('design-embeddings')
    
    const searchParams: any = {
      q: query,
      limit: filters.limit || 20,
      attributesToHighlight: ['title', 'description', 'content'],
      attributesToCrop: ['content:200'],
    }

    // フィルター構築
    const filterConditions: string[] = []
    
    if (filters.genre) {
      filterConditions.push(`genre = "${filters.genre}"`)
    }
    
    if (filters.minScore) {
      filterConditions.push(`total_score >= ${filters.minScore}`)
    }

    if (filterConditions.length > 0) {
      searchParams.filter = filterConditions.join(' AND ')
    }

    const results = await index.search(query, searchParams)
    return results

  } catch (error) {
    console.error('Search design data error:', error)
    throw error
  }
}

// Meilisearch インデックス初期化
export async function initializeMeilisearchIndex() {
  try {
    const index = meiliSearch.index('design-embeddings')
    
    // 設定ファイルから設定を読み込み（設定ファイルが存在する場合）
    const settings = {
      searchableAttributes: [
        'title',
        'description', 
        'content',
        'genre',
        'tags',
        'claude_summary',
        'ui_component_type'
      ],
      filterableAttributes: [
        'genre',
        'ui_component_type',
        'total_score',
        'score_aesthetic',
        'score_consistency', 
        'score_hierarchy',
        'score_usability',
        'score_accessibility',
        'created_at',
        'processing_status',
        'tags'
      ],
      sortableAttributes: [
        'total_score',
        'score_aesthetic',
        'score_consistency',
        'score_hierarchy', 
        'score_usability',
        'score_accessibility',
        'created_at'
      ]
    }

    await index.updateSettings(settings)
    console.log('Meilisearch index initialized successfully')

  } catch (error) {
    console.error('Initialize Meilisearch index error:', error)
    throw error
  }
}