import OpenAI from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// text-embedding-3-small を使用した埋め込み生成（1536次元）
async function generateEmbeddings(texts: string[]) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
      encoding_format: "float"
    });
    
    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('OpenAI API エラー:', error);
    throw new Error('埋め込み生成に失敗しました');
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 認証確認
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      projectName, 
      imageUrls, 
      uploadMode,
      additionalContext,
      evaluationData  // Claude評価結果を直接受け取る
    } = body;

    if (!projectName || !imageUrls || !Array.isArray(imageUrls)) {
      return NextResponse.json({ 
        error: 'プロジェクト名と画像URLが必要です' 
      }, { status: 400 });
    }

    console.log(`🚀 RAGベクトル化開始: ${projectName} (${imageUrls.length}枚)`);
    console.log(`📊 評価データ受信: ${evaluationData ? evaluationData.length : 0}件`);

    const results = [];
    const errors = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      
      try {
        console.log(`📷 処理中 ${i + 1}/${imageUrls.length}: ${imageUrl}`);

        // 1. 既存の評価データを使用（Claude評価済み）
        let evaluation = null;
        
        if (evaluationData && evaluationData[i]) {
          // Claude評価結果が既に存在する場合
          evaluation = evaluationData[i];
          console.log(`✅ 既存評価データを使用: ${evaluation.ui_type || 'unknown'}`);
        } else {
          // 評価データがない場合は新規分析（フォールバック）
          console.log(`⚠️ 評価データなし、新規分析実行中...`);
          
          const analysisResponse = await fetch(`${request.nextUrl.origin}/api/evaluate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': request.headers.get('Authorization') || '',
            },
            body: JSON.stringify({
              projectName,
              imageUrls: [imageUrl],
              uploadMode: 'single_for_rag'
            }),
          });

          if (!analysisResponse.ok) {
            throw new Error(`画像分析失敗: ${analysisResponse.statusText}`);
          }

          const analysisData = await analysisResponse.json();
          evaluation = analysisData.evaluations?.[0];

          if (!evaluation) {
            throw new Error('評価データが取得できませんでした');
          }
        }

        // 2. テキストコンテンツの作成（ベクトル化用）
        const textContents = [
          // メイン埋め込み用
          `${projectName} ${evaluation.ui_type || ''} ${evaluation.design_features?.join(' ') || ''} ${evaluation.design_notes || ''}`,
          
          // コンテンツ埋め込み用  
          `UIタイプ: ${evaluation.ui_type || 'unknown'}
           設計特徴: ${evaluation.design_features?.join(', ') || 'なし'}
           構造分析: ${evaluation.structural_analysis || ''}
           設計ノート: ${evaluation.design_notes || ''}
           タグ: ${evaluation.tags?.join(', ') || ''}`,
           
          // タイトル埋め込み用
          `${projectName} - ${evaluation.ui_type || 'UI要素'}`
        ];

        // 3. OpenAI埋め込み生成
        console.log('🧠 OpenAI埋め込み生成中...');
        const embeddings = await generateEmbeddings(textContents);

        // 4. Claude評価をJSONB形式で準備
        const claudeEvaluation = {
          consistency_score: evaluation.design_score || 0.5,
          quality: {
            reusability: evaluation.reusability || '中',
            maintainability: evaluation.maintainability || '中', 
            accessibility: evaluation.accessibility || '中'
          },
          improvements: evaluation.improvement_suggestions || [],
          ui_classification: {
            primary_type: evaluation.ui_type || 'unknown',
            secondary_types: evaluation.tags || []
          },
          structural_analysis: evaluation.structural_analysis,
          design_features: evaluation.design_features,
          original_evaluation: evaluation
        };

        // 5. RAGドキュメントとしてSupabaseに保存
        const { data: docData, error: docError } = await supabase
          .from('rag_documents')
          .insert({
            title: `${projectName} - 画像${i + 1}`,
            ui_type: evaluation.ui_type || 'unknown',
            description: evaluation.design_notes || `${projectName}のUI要素 - 画像${i + 1}`,
            copied_content: `<!-- 画像URL: ${imageUrl} -->
            <!-- UI分析結果 -->
            UIタイプ: ${evaluation.ui_type || 'unknown'}
            設計特徴: ${evaluation.design_features?.join(', ') || 'なし'}
            構造分析: ${evaluation.structural_analysis || ''}`,
            paste_context: {
              source: 'upload_form',
              project_name: projectName,
              upload_mode: uploadMode,
              image_url: imageUrl,
              image_index: i + 1,
              total_images: imageUrls.length,
              additional_context: additionalContext
            },
            keywords: [
              projectName,
              ...(evaluation.ui_type ? [evaluation.ui_type] : []),
              ...(evaluation.tags || []),
              ...(evaluation.design_features || [])
            ],
            claude_evaluation: claudeEvaluation,
            evaluation_score: evaluation.design_score || 0.5,
            improvement_notes: evaluation.improvement_suggestions || [],
            embedding: embeddings[0],
            content_embedding: embeddings[1], 
            title_embedding: embeddings[2],
            source_url: imageUrl,
            embedding_model: 'text-embedding-3-large',
            embedding_generated_at: new Date().toISOString(),
            is_approved: (evaluation.design_score || 0) > 0.7,
            review_count: 0
          })
          .select()
          .single();

        if (docError) {
          throw new Error(`RAGドキュメント保存エラー: ${docError.message}`);
        }

        console.log(`✅ RAGドキュメント保存成功: ${docData.id}`);

        // 6. 評価テーブルにも保存
        const { data: evalData, error: evalError } = await supabase
          .from('ui_learning_evaluations')
          .insert({
            document_id: docData.id,
            app_name: projectName,
            app_category: evaluation.app_category || 'general',
            design_system: {
              color_scheme: {
                primary_colors: evaluation.color_analysis?.primary || [],
                secondary_colors: evaluation.color_analysis?.secondary || [],
                dark_mode_support: evaluation.dark_mode_detected || false
              },
              typography: {
                font_families: evaluation.typography_analysis?.fonts || [],
                readability_score: evaluation.readability_score || 0.5
              }
            },
            ux_patterns: {
              navigation: {
                pattern_type: evaluation.navigation_pattern || 'unknown',
                consistency: evaluation.consistency_score || 0.5
              },
              interaction: {
                gesture_support: evaluation.supported_gestures || [],
                feedback_types: evaluation.feedback_types || []
              }
            },
            overall_score: evaluation.design_score || 0.5,
            learning_priority: (evaluation.design_score || 0) > 0.8 ? 'high' : 'medium',
            implementation_difficulty: evaluation.complexity || 'medium'
          })
          .select()
          .single();

        if (evalError) {
          console.warn(`評価データ保存警告: ${evalError.message}`);
        } else {
          console.log(`✅ 評価データ保存成功: ${evalData.id}`);
        }

        results.push({
          imageUrl,
          documentId: docData.id,
          evaluationId: evalData?.id,
          uiType: evaluation.ui_type,
          score: evaluation.design_score,
          embeddingGenerated: true
        });

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ 画像処理エラー (${imageUrl}):`, error);
        errors.push({
          imageUrl,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`✨ RAGベクトル化完了: 成功${results.length}件, エラー${errors.length}件`);

    return NextResponse.json({
      success: true,
      message: `${results.length}件のRAGドキュメントを生成しました`,
      results,
      errors,
      summary: {
        total: imageUrls.length,
        success: results.length,
        failed: errors.length,
        embeddingModel: 'text-embedding-3-large'
      }
    });

  } catch (error) {
    console.error('RAGベクトル化エラー:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'RAGベクトル化に失敗しました',
      success: false
    }, { status: 500 });
  }
}