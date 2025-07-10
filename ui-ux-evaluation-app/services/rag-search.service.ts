import { createClient } from '@supabase/supabase-js';

export interface TrainingExample {
  id: string;
  figma_url?: string;
  image_url?: string;
  structure_note: string;
  ui_type: string;
  score_aesthetic: number;
  score_usability: number;
  score_alignment: number;
  score_accessibility: number;
  score_consistency: number;
  total_score: number;
  review_text: string;
  created_at: string;
}

export interface RAGSearchCriteria {
  ui_type?: string;
  structure_keywords?: string[];
  score_range?: {
    min: number;
    max: number;
  };
  limit?: number;
}

export class RAGSearchService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * キーワード一致による類似教師データ検索
   * @param criteria 検索条件
   * @returns 類似教師データ配列
   */
  async searchSimilarExamplesByKeywords(criteria: RAGSearchCriteria): Promise<TrainingExample[]> {
    try {
      let query = this.supabase
        .from('training_examples')
        .select('*')
        .eq('is_approved', true);

      // UI Type フィルタ
      if (criteria.ui_type) {
        query = query.eq('ui_type', criteria.ui_type);
      }

      // 構造メモのキーワード検索
      if (criteria.structure_keywords && criteria.structure_keywords.length > 0) {
        const keywords = criteria.structure_keywords.join(' | ');
        query = query.textSearch('structure_note', keywords);
      }

      // スコア範囲フィルタ
      if (criteria.score_range) {
        query = query
          .gte('total_score', criteria.score_range.min)
          .lte('total_score', criteria.score_range.max);
      }

      // 結果件数制限とソート
      query = query
        .order('total_score', { ascending: false })
        .limit(criteria.limit || 3);

      const { data, error } = await query;

      if (error) {
        console.error('RAG search error:', error);
        return [];
      }

      return data as TrainingExample[];
    } catch (error) {
      console.error('RAG search service error:', error);
      return [];
    }
  }

  /**
   * 全文検索による類似教師データ検索
   * @param searchText 検索テキスト
   * @param ui_type UIタイプフィルタ（任意）
   * @param limit 結果件数制限
   * @returns 類似教師データ配列
   */
  async searchByFullText(
    searchText: string, 
    ui_type?: string, 
    limit: number = 3
  ): Promise<TrainingExample[]> {
    try {
      let query = this.supabase
        .from('training_examples')
        .select('*')
        .eq('is_approved', true)
        .textSearch('structure_note,review_text', searchText);

      if (ui_type) {
        query = query.eq('ui_type', ui_type);
      }

      const { data, error } = await query
        .order('total_score', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Full text search error:', error);
        return [];
      }

      return data as TrainingExample[];
    } catch (error) {
      console.error('Full text search service error:', error);
      return [];
    }
  }

  /**
   * UIタイプ別の高評価教師データを取得
   * @param ui_type UIタイプ
   * @param limit 結果件数
   * @returns 高評価教師データ配列
   */
  async getTopScoredExamplesByType(ui_type: string, limit: number = 3): Promise<TrainingExample[]> {
    try {
      const { data, error } = await this.supabase
        .from('training_examples')
        .select('*')
        .eq('ui_type', ui_type)
        .eq('is_approved', true)
        .gte('total_score', 7.0) // 高評価のみ
        .order('total_score', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Top scored examples error:', error);
        return [];
      }

      return data as TrainingExample[];
    } catch (error) {
      console.error('Top scored examples service error:', error);
      return [];
    }
  }

  /**
   * 提出UIに基づいて最適な教師データを検索
   * @param submissionData 提出UI情報
   * @returns 最適な教師データ配列
   */
  async findRelevantExamplesForSubmission(submissionData: {
    ui_type?: string;
    structure_note?: string;
    description?: string;
  }): Promise<TrainingExample[]> {
    try {
      // 1. UIタイプが一致する高評価例を優先取得
      let examples: TrainingExample[] = [];
      
      if (submissionData.ui_type) {
        examples = await this.getTopScoredExamplesByType(submissionData.ui_type, 2);
      }

      // 2. 構造メモまたは説明からキーワード抽出して検索
      if (examples.length < 3 && (submissionData.structure_note || submissionData.description)) {
        const searchText = [submissionData.structure_note, submissionData.description]
          .filter(Boolean)
          .join(' ');
        
        const textSearchResults = await this.searchByFullText(
          searchText, 
          submissionData.ui_type, 
          3 - examples.length
        );
        
        // 重複除去して追加
        textSearchResults.forEach(example => {
          if (!examples.find(ex => ex.id === example.id)) {
            examples.push(example);
          }
        });
      }

      // 3. まだ足りない場合は、同じUIタイプの任意の例を追加
      if (examples.length < 3 && submissionData.ui_type) {
        const additionalExamples = await this.searchSimilarExamplesByKeywords({
          ui_type: submissionData.ui_type,
          limit: 3 - examples.length
        });
        
        additionalExamples.forEach(example => {
          if (!examples.find(ex => ex.id === example.id)) {
            examples.push(example);
          }
        });
      }

      return examples.slice(0, 3); // 最大3件
    } catch (error) {
      console.error('Find relevant examples error:', error);
      return [];
    }
  }

  /**
   * 将来のベクトル検索用プレースホルダー
   * @param embedding ベクトル表現
   * @param limit 結果件数
   * @returns 類似教師データ配列
   */
  async searchByEmbedding(embedding: number[], limit: number = 3): Promise<TrainingExample[]> {
    // TODO: pgvectorを使用したベクトル検索の実装
    // 現在はプレースホルダー
    console.log('Vector search not implemented yet');
    return [];
  }
}

/**
 * RAG検索サービスのファクトリー関数
 * @param supabaseUrl Supabase URL
 * @param supabaseKey Supabase Key
 * @returns RAGSearchServiceインスタンス
 */
export function createRAGSearchService(supabaseUrl: string, supabaseKey: string): RAGSearchService {
  return new RAGSearchService(supabaseUrl, supabaseKey);
}

/**
 * SQL例：手動でのキーワード検索クエリ
 */
export const RAG_SEARCH_QUERIES = {
  // UI Type + キーワード検索
  keywordSearch: `
    SELECT * FROM training_examples 
    WHERE is_approved = TRUE 
    AND ui_type = $1 
    AND (
      structure_note ILIKE '%' || $2 || '%' 
      OR review_text ILIKE '%' || $2 || '%'
    )
    ORDER BY total_score DESC 
    LIMIT $3;
  `,

  // 全文検索（PostgreSQL標準）
  fullTextSearch: `
    SELECT *, 
           ts_rank(to_tsvector('simple', structure_note || ' ' || review_text), 
                   plainto_tsquery('simple', $1)) AS rank
    FROM training_examples 
    WHERE is_approved = TRUE 
    AND to_tsvector('simple', structure_note || ' ' || review_text) @@ plainto_tsquery('simple', $1)
    ORDER BY rank DESC, total_score DESC 
    LIMIT $2;
  `,

  // 将来のベクトル検索
  vectorSearch: `
    SELECT *, 
           1 - (embedding <=> $1::vector) AS similarity
    FROM training_examples 
    WHERE is_approved = TRUE 
    AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector 
    LIMIT $2;
  `
};