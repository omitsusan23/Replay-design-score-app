import { NextRequest, NextResponse } from 'next/server';
import { evaluateUIV1, V1EvaluationRequest } from '@/services/ai-evaluation-v1';
import { EvaluationHistoryService } from '@/services/evaluation-history.service';
import { N8nWebhookService } from '@/services/n8n-webhook.service';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // リクエストデータの取得
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const structureNote = formData.get('structureNote') as string | null;
    const figmaLink = formData.get('figmaLink') as string | null;
    const imageFile = formData.get('image') as File | null;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    if (!imageFile && !figmaLink) {
      return NextResponse.json(
        { error: '画像またはFigmaリンクのいずれかが必要です' },
        { status: 400 }
      );
    }

    // 画像をBase64に変換
    let imageUrl: string | undefined;
    if (imageFile) {
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      imageUrl = buffer.toString('base64');
    }

    // 評価リクエストの作成
    const evaluationRequest: V1EvaluationRequest = {
      title,
      description,
      structureNote: structureNote || undefined,
      figmaLink: figmaLink || undefined,
      imageUrl
    };

    // AI評価の実行
    const evaluation = await evaluateUIV1(evaluationRequest);

    // 評価結果の保存
    const evaluationId = await EvaluationHistoryService.saveEvaluation(
      user.id,
      evaluationRequest,
      evaluation
    );

    // バージョン情報の取得
    let version = 1;
    if (figmaLink) {
      const history = await EvaluationHistoryService.getEvaluationHistory(
        figmaLink,
        user.id
      );
      version = history.length;
    }

    // n8nに通知（非同期で実行）
    N8nWebhookService.notifyEvaluationCompleted(
      evaluationId,
      user.id,
      title,
      evaluation,
      version,
      figmaLink || undefined,
      user.user_metadata?.full_name || user.email
    ).catch(error => {
      console.error('N8N notification failed:', error);
    });

    // 前回との比較情報を取得
    let comparison = null;
    if (figmaLink && version > 1) {
      comparison = await EvaluationHistoryService.compareWithPrevious(
        figmaLink,
        user.id,
        evaluation
      );
    }

    return NextResponse.json({
      success: true,
      evaluationId,
      evaluation,
      version,
      comparison,
      message: '評価が完了しました'
    });

  } catch (error) {
    console.error('Evaluation API error:', error);
    return NextResponse.json(
      { error: '評価処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 評価履歴の取得
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const figmaLink = searchParams.get('figmaLink');

    if (figmaLink) {
      // 特定のFigmaリンクの履歴を取得
      const history = await EvaluationHistoryService.getEvaluationHistory(
        figmaLink,
        user.id
      );
      return NextResponse.json({ history });
    } else {
      // ユーザーの統計情報を取得
      const statistics = await EvaluationHistoryService.getStatistics(user.id);
      return NextResponse.json({ statistics });
    }

  } catch (error) {
    console.error('Get evaluation history error:', error);
    return NextResponse.json(
      { error: '履歴の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}