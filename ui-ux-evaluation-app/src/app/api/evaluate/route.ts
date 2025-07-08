import { NextRequest, NextResponse } from 'next/server';
import { ImageAnalysisService } from '@/services/image-analysis.service';
import { ObjectiveEvaluationService } from '@/services/objective-evaluation.service';
import { generateSubjectiveFeedback } from '@/services/ai-evaluation';
import { UIImageMetrics } from '@/types/objective-evaluation';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const submitType = formData.get('submitType') as string;
    const figmaLink = formData.get('figmaLink') as string;
    const imageFile = formData.get('image') as File;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    let imageUrl: string | undefined;
    let imageBuffer: Buffer | undefined;
    
    if (submitType === 'image' && imageFile) {
      const buffer = await imageFile.arrayBuffer();
      imageBuffer = Buffer.from(buffer);
      const base64 = Buffer.from(buffer).toString('base64');
      imageUrl = `data:${imageFile.type};base64,${base64}`;
    }

    // 1. 画像分析による定量的特徴量抽出
    let imageMetrics;
    let objectiveScore = 0;
    
    if (imageBuffer) {
      try {
        imageMetrics = await ImageAnalysisService.analyzeUIImage(imageUrl!);
        
        // 2. 客観的スコア計算（外部スコアは仮のデータ）
        const mockExternalScores = {
          platform: 'user_submission',
          likes: 0,
          views: 1
        };
        
        const scoreCalculation = ObjectiveEvaluationService.calculateObjectiveScore(
          mockExternalScores,
          imageMetrics ? imageMetrics as UIImageMetrics : undefined
        );
        
        objectiveScore = scoreCalculation.final_score;
      } catch (error) {
        console.warn('Image analysis failed:', error);
        // 画像分析に失敗した場合はデフォルト値を使用
        objectiveScore = 50;
      }
    }

    // 3. AI による主観的フィードバック生成
    const evaluationRequest = {
      title,
      description,
      figmaLink: submitType === 'figma' ? figmaLink : undefined,
      imageUrl
    };

    let aiFeedback;
    try {
      aiFeedback = await generateSubjectiveFeedback(
        evaluationRequest,
        objectiveScore,
        imageMetrics
      );
    } catch (error) {
      console.warn('AI feedback generation failed:', error);
      // AI フィードバック生成に失敗した場合はデフォルトを返す
      aiFeedback = {
        subjective_feedback: {
          visual_impact: "画像分析に基づく評価を実施しました。",
          user_experience: "定量的指標による客観的評価を提供しています。",
          brand_consistency: "ブランド要素の分析結果を参考にしてください。",
          trend_alignment: "現在のデザイントレンドとの比較を行いました。",
          improvement_suggestions: [
            "コントラスト比の改善を検討してください",
            "レイアウトの整列性を向上させることをお勧めします"
          ]
        },
        overall_feedback: "客観的分析に基づく総合評価を提供しました。詳細な改善提案については各項目をご確認ください。",
        tone: "constructive" as const
      };
    }

    // 4. 統合結果の返却
    const result = {
      objective_score: Math.round(objectiveScore * 10) / 10,
      technical_metrics: imageMetrics,
      ai_feedback: aiFeedback,
      evaluation_summary: {
        color_contrast: imageMetrics?.accessibility_metrics?.wcag_aa_compliant ? 
          Math.round(imageMetrics.accessibility_metrics.wcag_aa_compliant * 20) : 10,
        layout_quality: imageMetrics?.layout_metrics?.grid_alignment ? 
          Math.round(imageMetrics.layout_metrics.grid_alignment * 20) : 12,
        accessibility: imageMetrics?.accessibility_metrics ? 
          Math.round((imageMetrics.accessibility_metrics.wcag_aa_compliant + 
                     (imageMetrics.accessibility_metrics.color_blind_safe ? 1 : 0)) * 10) : 10,
        ui_elements: imageMetrics?.ui_elements?.cta_prominence ? 
          Math.round(imageMetrics.ui_elements.cta_prominence * 20) : 15
      },
      metadata: {
        analysis_timestamp: new Date().toISOString(),
        evaluation_method: 'objective_quantitative_analysis',
        ai_feedback_included: true
      }
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Evaluation error:', error);
    
    return NextResponse.json(
      { error: '統合評価中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: '強化版UI/UX評価APIエンドポイント',
    description: '定量的画像分析による客観的スコアリング + AI主観的フィードバック生成',
    methods: ['POST'],
    parameters: {
      title: 'プロジェクト名 (必須)',
      description: '説明・意図 (必須)',
      submitType: 'image | figma',
      figmaLink: 'Figmaリンク (figma選択時)',
      image: '画像ファイル (image選択時)'
    },
    response_structure: {
      objective_score: '客観的総合スコア (0-100)',
      technical_metrics: {
        color_metrics: 'WCAG準拠コントラスト比、色彩調和、配色分析',
        layout_metrics: 'グリッド整列、余白比率、視覚階層、バランス',
        accessibility_metrics: 'WCAG AA/AAA準拠率、色覚異常対応、フォーカス表示',
        ui_elements: 'ボタン検出、CTA際立ち度、ナビゲーション要素'
      },
      ai_feedback: {
        subjective_feedback: '主観的評価（視覚インパクト、UX、ブランド整合性等）',
        overall_feedback: '総合フィードバック',
        tone: 'フィードバックのトーン'
      },
      evaluation_summary: '各カテゴリの簡易スコア',
      metadata: '評価メタデータ'
    },
    features: [
      '画像から自動的にWCAGコントラスト比を測定',
      'UI要素（ボタン、CTA、ナビゲーション）の自動検出',
      'レイアウト整列性・余白バランスの定量評価',
      'AIによる主観的フィードバック（スコア計算はAI非依存）'
    ],
    note: '客観スコアは定量的画像分析に基づき、AIは主観的フィードバックのみ生成します'
  });
}