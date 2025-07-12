import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateDesign, generateSubjectiveFeedback } from '@/services/ai-evaluation';
import { createFeedbackService } from '@/services/feedback.service';
import { randomUUID } from 'crypto';

// Supabaseクライアントは関数内で初期化

export async function POST(request: NextRequest) {
  try {
    // 環境変数チェック
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase設定が不完全です' }, { status: 500 });
    }

    // Supabaseクライアント初期化
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // セッションベースの認証チェック
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session || !session.user) {
      // リクエストヘッダーからセッションを取得
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
      }
      
      // userを設定
      session = { user };
    }

    const user = session.user;

    // フォームデータの取得
    const formData = await request.formData();
    const projectName = formData.get('projectName') as string;
    const description = formData.get('description') as string || '';
    const structureNote = formData.get('structureNote') as string || '';
    const submitType = formData.get('submitType') as string;
    const figmaUrl = formData.get('figmaUrl') as string;
    const imageFile = formData.get('image') as File;

    // 入力検証
    if (!projectName) {
      return NextResponse.json(
        { error: 'プロジェクト名は必須です' }, 
        { status: 400 }
      );
    }

    if (submitType === 'figma' && !figmaUrl) {
      return NextResponse.json(
        { error: 'Figma URLは必須です' }, 
        { status: 400 }
      );
    }

    if (submitType === 'image' && !imageFile) {
      return NextResponse.json(
        { error: '画像ファイルは必須です' }, 
        { status: 400 }
      );
    }

    let imageUrl = null;
    
    // 画像アップロード処理
    if (submitType === 'image' && imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}/${randomUUID()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('ui-designs')
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return NextResponse.json(
          { error: '画像のアップロードに失敗しました' }, 
          { status: 500 }
        );
      }

      const { data: { publicUrl } } = supabase.storage
        .from('ui-designs')
        .getPublicUrl(fileName);
      
      imageUrl = publicUrl;
    }

    // ui_submissionsテーブルに保存（データベーススキーマに合わせて列名を修正）
    const { data: submission, error: submissionError } = await supabase
      .from('ui_submissions')
      .insert({
        user_id: user.id,
        title: projectName,
        description: description || null,
        figma_link: submitType === 'figma' ? figmaUrl : null,
        image_url: imageUrl,
        scores: {}, // 仮のスコア（後で更新）
        feedback: '', // 仮のフィードバック（後で更新）
        total_score: 0 // 仮の合計スコア（後で更新）
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { error: 'データの保存に失敗しました' }, 
        { status: 500 }
      );
    }

    // Claude APIで評価
    const evaluationResult = await evaluateDesign({
      title: projectName,
      description: description || '',
      structureNote: structureNote || '',
      figmaLink: submitType === 'figma' ? figmaUrl : undefined,
      imageUrl: imageUrl || undefined
    });

    // ui_submissionsテーブルに評価結果を更新
    const scores = {
      aesthetic: evaluationResult.score_aesthetic,
      usability: evaluationResult.score_usability,
      alignment: evaluationResult.score_alignment,
      accessibility: evaluationResult.score_accessibility,
      consistency: evaluationResult.score_consistency
    };

    const { data: updatedSubmission, error: updateError } = await supabase
      .from('ui_submissions')
      .update({
        scores: scores,
        feedback: evaluationResult.review_text,
        total_score: evaluationResult.total_score
      })
      .eq('id', submission.id)
      .select()
      .single();

    if (updateError) {
      console.error('Submission update error:', updateError);
      return NextResponse.json(
        { error: '評価結果の保存に失敗しました' }, 
        { status: 500 }
      );
    }

    // 主観的フィードバックの生成と保存
    let feedbackData = null;
    try {
      const subjectiveFeedback = await generateSubjectiveFeedback({
        title: projectName,
        description: description || '',
        structureNote: structureNote,
        figmaLink: submitType === 'figma' ? figmaUrl : undefined,
        imageUrl: imageUrl || undefined
      }, evaluationResult.total_score);

      // FeedbackServiceを使用してui_feedbacksテーブルに保存
      const feedbackService = createFeedbackService(supabaseUrl, supabaseServiceKey);
      feedbackData = await feedbackService.insertFeedback(submission.id, subjectiveFeedback);

      if (!feedbackData) {
        console.error('Feedback save failed');
        // フィードバックの保存に失敗してもエラーにはしない（主要機能ではないため）
      }
    } catch (error) {
      console.error('Subjective feedback generation error:', error);
      // フィードバックの生成に失敗してもエラーにはしない
    }

    // Slack通知（TODO: 実装予定）
    // await sendSlackNotification({
    //   userName: user.email || 'Unknown',
    //   projectName: projectName,
    //   totalScore: evaluationResult.total_score,
    //   reviewText: evaluationResult.review_text
    // });

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      evaluation: {
        ...evaluationResult,
        submissionId: submission.id
      },
      feedback: feedbackData
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: '評価処理中にエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'UI/UX評価API v1.0',
    description: 'Claude APIによる5項目評価 + 構造メモ対応',
    methods: ['POST'],
    parameters: {
      projectName: 'プロジェクト名 (必須)',
      description: '説明・意図 (必須)',
      structureNote: '構造メモ・設計意図 (任意)',
      submitType: 'image | figma',
      figmaUrl: 'Figmaリンク (figma選択時)',
      image: '画像ファイル (image選択時)'
    },
    response: {
      submissionId: '提出ID',
      evaluation: {
        ui_type: 'UIタイプ分類',
        score_aesthetic: '視覚的インパクト (0-10)',
        score_usability: '使いやすさ (0-10)',
        score_alignment: 'グリッド/整列 (0-10)',
        score_accessibility: 'アクセシビリティ (0-10)',
        score_consistency: '一貫性 (0-10)',
        total_score: '総合スコア (平均値)',
        review_text: '評価コメント'
      }
    }
  });
}