import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateDesign } from '@/services/ai-evaluation';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

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
      const fileName = `${user.id}/${uuidv4()}.${fileExt}`;
      
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

    // ui_submissionsテーブルに保存
    const { data: submission, error: submissionError } = await supabase
      .from('ui_submissions')
      .insert({
        user_id: user.id,
        project_name: projectName,
        description: description || null,
        structure_note: structureNote || null,
        figma_url: submitType === 'figma' ? figmaUrl : null,
        image_url: imageUrl
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

    // ui_scoresテーブルに評価結果を保存
    const { data: score, error: scoreError } = await supabase
      .from('ui_scores')
      .insert({
        submission_id: submission.id,
        ui_type: evaluationResult.ui_type,
        score_aesthetic: evaluationResult.score_aesthetic,
        score_usability: evaluationResult.score_usability,
        score_alignment: evaluationResult.score_alignment,
        score_accessibility: evaluationResult.score_accessibility,
        score_consistency: evaluationResult.score_consistency,
        review_text: evaluationResult.review_text
      })
      .select()
      .single();

    if (scoreError) {
      console.error('Score save error:', scoreError);
      return NextResponse.json(
        { error: '評価結果の保存に失敗しました' }, 
        { status: 500 }
      );
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
      }
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