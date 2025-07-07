import { NextRequest, NextResponse } from 'next/server';
import { IntegratedEvaluationService } from '@/services/integrated-evaluation.service';

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
    
    if (submitType === 'image' && imageFile) {
      const buffer = await imageFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      imageUrl = base64;
    }

    const evaluationRequest = {
      title,
      description,
      figmaLink: submitType === 'figma' ? figmaLink : undefined,
      imageUrl
    };

    const result = await IntegratedEvaluationService.evaluateUI(evaluationRequest);

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
    message: '統合UI評価APIエンドポイント（客観的スコアリング + AI説明文生成）',
    methods: ['POST'],
    parameters: {
      title: 'プロジェクト名 (必須)',
      description: '説明・意図 (必須)',
      submitType: 'image | figma',
      figmaLink: 'Figmaリンク (figma選択時)',
      image: '画像ファイル (image選択時)'
    },
    note: 'スコアリングは客観的データに基づき、AIは説明文生成のみを担当します'
  });
}