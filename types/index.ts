export interface UISubmission {
  id: string;
  created_at: string;
  user_id: string;
  title: string;
  description: string;
  figma_link?: string;
  image_url?: string;
  scores: UIScore;
  feedback: string;
  total_score: number;
}

export interface UIScore {
  color_contrast: number;
  information_organization: number;
  visual_guidance: number;
  accessibility: number;
  ui_consistency: number;
  visual_impact: number;
  cta_clarity: number;
}

export interface EvaluationCriteria {
  name: string;
  description: string;
  maxScore: number;
  weight: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface DashboardStats {
  totalSubmissions: number;
  averageScore: number;
  improvementRate: number;
  topCategory: string;
}

export interface ExternalUIData {
  id: string;
  source: string;
  title: string;
  url: string;
  image_url: string;
  scores: UIScore;
  collected_at: string;
}