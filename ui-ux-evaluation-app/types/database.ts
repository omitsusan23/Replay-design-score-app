export interface UISubmission {
  id: string;
  user_id: string;
  project_name: string;
  description?: string;
  structure_note?: string;
  figma_url?: string;
  image_url?: string;
  created_at: string;
}

export interface UIScore {
  id: string;
  submission_id: string;
  ui_type: string;
  score_aesthetic: number;
  score_usability: number;
  score_alignment: number;
  score_accessibility: number;
  score_consistency: number;
  total_score: number; // GENERATED ALWAYS AS計算値
  review_text: string;
  created_at: string;
}

export interface UIFeedback {
  id: string;
  submission_id: string;
  visual_impact?: string;
  user_experience?: string;
  brand_consistency?: string;
  trend_alignment?: string;
  improvement_suggestions?: string[];
  overall_feedback?: string;
  tone?: 'positive' | 'neutral' | 'constructive';
  created_at: string;
}

export interface UISubmissionWithScore extends UISubmission {
  score?: UIScore;
}

export interface UISubmissionWithFeedback extends UISubmission {
  feedback?: UIFeedback;
}

export interface UISubmissionComplete extends UISubmission {
  score?: UIScore;
  feedback?: UIFeedback;
}

export type Database = {
  public: {
    Tables: {
      ui_submissions: {
        Row: UISubmission;
        Insert: Omit<UISubmission, 'id' | 'created_at'>;
        Update: Partial<Omit<UISubmission, 'id' | 'created_at'>>;
      };
      ui_scores: {
        Row: UIScore;
        Insert: Omit<UIScore, 'id' | 'total_score' | 'created_at'>;
        Update: Partial<Omit<UIScore, 'id' | 'total_score' | 'created_at'>>;
      };
      ui_feedbacks: {
        Row: UIFeedback;
        Insert: Omit<UIFeedback, 'id' | 'created_at'>;
        Update: Partial<Omit<UIFeedback, 'id' | 'created_at'>>;
      };
    };
  };
};