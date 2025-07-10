import { Database } from './database';

// 既存のDatabase型にtraining_examplesを追加
export interface TrainingExample {
  id: string;
  added_by: string;
  figma_url?: string;
  image_url?: string;
  structure_note: string;
  ui_type: string;
  score_aesthetic: number;
  score_usability: number;
  score_alignment: number;
  score_accessibility: number;
  score_consistency: number;
  total_score: number; // GENERATED ALWAYS AS計算値
  review_text: string;
  embedding?: number[]; // 将来のベクトル検索用
  is_approved: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface TrainingExampleStats {
  ui_type: string;
  total_count: number;
  approved_count: number;
  avg_total_score: number;
  avg_aesthetic: number;
  avg_usability: number;
  avg_alignment: number;
  avg_accessibility: number;
  avg_consistency: number;
}

// 拡張されたDatabase型
export interface RAGDatabase extends Database {
  public: Database['public'] & {
    Tables: Database['public']['Tables'] & {
      training_examples: {
        Row: TrainingExample;
        Insert: Omit<TrainingExample, 'id' | 'total_score' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<TrainingExample, 'id' | 'total_score' | 'created_at' | 'updated_at'>>;
      };
    };
    Views: {
      training_examples_stats: {
        Row: TrainingExampleStats;
      };
    };
  };
}