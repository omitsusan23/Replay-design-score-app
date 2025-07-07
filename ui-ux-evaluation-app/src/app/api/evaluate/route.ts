import { NextRequest, NextResponse } from 'next/server';
import { evaluateUI } from '../../../../../services/ai-evaluation';

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

    const result = await evaluateUI(evaluationRequest);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Evaluation error:', error);
    
    return NextResponse.json(
      { error: 'AI評価中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'AI評価APIエンドポイント',
    methods: ['POST'],
    parameters: {
      title: 'プロジェクト名 (必須)',
      description: '説明・意図 (必須)',
      submitType: 'image | figma',
      figmaLink: 'Figmaリンク (figma選択時)',
      image: '画像ファイル (image選択時)'
    }
  });
}