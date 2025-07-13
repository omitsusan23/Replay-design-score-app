import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase クライアントの初期化
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_ANON_KEY || 'your-anon-key'
);

// text-embedding-3-large を使用した埋め込み生成
async function generateEmbedding(text) {
  try {
    console.log(`Generating embedding for: ${text.substring(0, 50)}...`);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: text,
      encoding_format: "float"
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('埋め込み生成エラー:', error);
    throw error;
  }
}

// バッチ埋め込み生成
async function generateBatchEmbeddings(texts) {
  try {
    console.log(`Generating batch embeddings for ${texts.length} texts...`);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: texts,
      encoding_format: "float"
    });
    
    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('バッチ埋め込み生成エラー:', error);
    throw error;
  }
}

// サンプルデータ
const sampleUIPatterns = [
  {
    title: 'Spotify - プレイヤーバー',
    ui_type: 'player',
    description: 'Spotifyの常時表示される音楽プレイヤーバー。再生コントロール、曲情報、プログレスバーを含む',
    copied_content: `<div class="player-bar bg-black text-white p-4 fixed bottom-0 w-full">
      <div class="flex items-center justify-between">
        <div class="now-playing flex items-center space-x-4">
          <img src="album-art.jpg" alt="Album" class="w-14 h-14 rounded" />
          <div class="track-info">
            <div class="track-name font-medium">Song Title</div>
            <div class="artist-name text-sm opacity-70">Artist Name</div>
          </div>
        </div>
        <div class="player-controls flex items-center space-x-6">
          <button class="shuffle opacity-70 hover:opacity-100">
            <svg class="w-4 h-4" />
          </button>
          <button class="previous">
            <svg class="w-5 h-5" />
          </button>
          <button class="play-pause bg-white text-black rounded-full p-2">
            <svg class="w-4 h-4" />
          </button>
          <button class="next">
            <svg class="w-5 h-5" />
          </button>
          <button class="repeat opacity-70 hover:opacity-100">
            <svg class="w-4 h-4" />
          </button>
        </div>
        <div class="volume-controls flex items-center space-x-2">
          <button class="volume-icon">
            <svg class="w-5 h-5" />
          </button>
          <input type="range" class="volume-slider w-24" />
        </div>
      </div>
      <div class="progress-bar mt-2">
        <div class="bg-gray-600 h-1 rounded-full">
          <div class="bg-green-500 h-1 rounded-full w-1/3"></div>
        </div>
      </div>
    </div>`,
    paste_context: {
      component_type: 'player_bar',
      screen_name: 'Global Player',
      position: 'bottom_fixed',
      features: ['play_controls', 'volume_control', 'progress_bar']
    },
    keywords: ['音楽', 'プレイヤー', 'メディアコントロール', 'Spotify', '再生バー'],
    app_name: 'Spotify',
    app_category: 'music'
  },
  {
    title: 'Netflix - カルーセル',
    ui_type: 'carousel',
    description: 'Netflixのコンテンツカルーセルコンポーネント。水平スクロール可能なコンテンツリスト',
    copied_content: `<div class="content-carousel">
      <h2 class="carousel-title text-2xl font-bold mb-4">今話題の作品</h2>
      <div class="carousel-container relative">
        <button class="carousel-nav prev absolute left-0 z-10 bg-black bg-opacity-50 text-white p-2 rounded">
          <svg class="w-6 h-6" />
        </button>
        <div class="carousel-items flex space-x-2 overflow-x-hidden">
          <div class="content-card relative group cursor-pointer">
            <img src="thumbnail.jpg" class="w-48 h-72 object-cover rounded" />
            <div class="content-hover absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-end p-4 opacity-0 group-hover:opacity-100">
              <div class="flex space-x-2">
                <button class="play-button bg-white text-black rounded-full p-2">
                  <svg class="w-4 h-4" />
                </button>
                <button class="add-list border border-white text-white rounded-full p-2">
                  <svg class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <button class="carousel-nav next absolute right-0 z-10 bg-black bg-opacity-50 text-white p-2 rounded">
          <svg class="w-6 h-6" />
        </button>
      </div>
    </div>`,
    paste_context: {
      component_type: 'carousel',
      screen_name: 'Home Feed',
      interaction: 'horizontal_scroll',
      features: ['hover_preview', 'navigation_arrows', 'responsive_grid']
    },
    keywords: ['動画', 'カルーセル', 'コンテンツ表示', 'Netflix', 'スクロール'],
    app_name: 'Netflix',
    app_category: 'video'
  },
  {
    title: 'Notion - サイドバーナビゲーション',
    ui_type: 'navigation',
    description: 'Notionの階層型サイドバーナビゲーション。折りたたみ可能な入れ子構造',
    copied_content: `<nav class="sidebar w-64 bg-gray-50 h-full p-3">
      <div class="workspace-switcher mb-4">
        <button class="workspace-button w-full flex items-center justify-between p-2 hover:bg-gray-100 rounded">
          <div class="flex items-center space-x-2">
            <div class="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded"></div>
            <span class="font-medium">My Workspace</span>
          </div>
          <svg class="w-4 h-4 opacity-50" />
        </button>
      </div>
      <div class="search-box mb-4">
        <input type="text" placeholder="検索..." class="w-full px-3 py-2 bg-white border border-gray-200 rounded" />
      </div>
      <div class="nav-section">
        <div class="nav-item flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer">
          <button class="expand-toggle p-1">
            <svg class="w-3 h-3 transform rotate-0 transition-transform" />
          </button>
          <span class="page-icon mr-2">📄</span>
          <span class="page-title flex-1">Getting Started</span>
        </div>
        <div class="nav-children ml-6">
          <div class="nav-item nested flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer">
            <span class="page-icon mr-2">📝</span>
            <span class="page-title">Quick Notes</span>
          </div>
          <div class="nav-item nested flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer">
            <span class="page-icon mr-2">✅</span>
            <span class="page-title">Task List</span>
          </div>
        </div>
      </div>
    </nav>`,
    paste_context: {
      component_type: 'sidebar',
      screen_name: 'Main Layout',
      features: ['collapsible', 'nested', 'search', 'workspace_switcher']
    },
    keywords: ['生産性', 'ナビゲーション', 'サイドバー', 'Notion', 'ワークスペース'],
    app_name: 'Notion',
    app_category: 'productivity'
  }
];

// メイン処理
async function processUIPatterns() {
  console.log('🚀 UIパターンの埋め込み生成を開始します...\n');

  for (const pattern of sampleUIPatterns) {
    try {
      console.log(`\n📋 処理中: ${pattern.title}`);
      
      // 3つのテキストの埋め込みを生成
      const textsToEmbed = [
        `${pattern.title} ${pattern.description}`,           // メイン埋め込み
        pattern.copied_content,                              // コンテンツ埋め込み  
        pattern.title                                        // タイトル埋め込み
      ];
      
      const embeddings = await generateBatchEmbeddings(textsToEmbed);
      
      // Claude評価のシミュレーション
      const claudeEvaluation = {
        consistency_score: 0.85 + Math.random() * 0.15,
        quality: {
          reusability: ['高', '中', '低'][Math.floor(Math.random() * 2)],
          maintainability: ['高', '中', '低'][Math.floor(Math.random() * 2)],
          accessibility: ['高', '中', '低'][Math.floor(Math.random() * 3)]
        },
        improvements: [
          "セマンティックHTMLの使用を推奨",
          "ARIAラベルの追加",
          "キーボードナビゲーションの強化"
        ].slice(0, Math.floor(Math.random() * 3) + 1),
        ui_classification: {
          primary_type: pattern.ui_type,
          secondary_types: ["responsive", "interactive", "accessible"].slice(0, 2)
        }
      };

      // Supabaseに保存
      const { data: docData, error: docError } = await supabase
        .from('rag_documents')
        .insert({
          title: pattern.title,
          ui_type: pattern.ui_type,
          description: pattern.description,
          copied_content: pattern.copied_content,
          paste_context: pattern.paste_context,
          keywords: pattern.keywords,
          claude_evaluation: claudeEvaluation,
          evaluation_score: claudeEvaluation.consistency_score,
          improvement_notes: claudeEvaluation.improvements,
          embedding: embeddings[0],
          content_embedding: embeddings[1],
          title_embedding: embeddings[2],
          embedding_model: 'text-embedding-3-large',
          embedding_generated_at: new Date().toISOString(),
          is_approved: claudeEvaluation.consistency_score > 0.9
        })
        .select()
        .single();

      if (docError) {
        console.error('❌ ドキュメント保存エラー:', docError);
        continue;
      }

      console.log('✅ ドキュメント保存成功:', docData.id);

      // 評価データも保存
      const { data: evalData, error: evalError } = await supabase
        .from('ui_learning_evaluations')
        .insert({
          document_id: docData.id,
          app_name: pattern.app_name,
          app_category: pattern.app_category,
          design_system: {
            color_scheme: {
              primary_colors: ["#1DB954", "#191414"],
              dark_mode_support: true,
              contrast_ratio: 7.5
            },
            typography: {
              font_families: ["Circular", "Helvetica"],
              readability_score: 0.85
            }
          },
          ux_patterns: {
            navigation: {
              pattern_type: pattern.ui_type,
              consistency: 0.9
            },
            interaction: {
              gesture_support: ["tap", "swipe"],
              feedback_types: ["visual", "haptic"]
            }
          },
          overall_score: claudeEvaluation.consistency_score,
          learning_priority: claudeEvaluation.consistency_score > 0.9 ? 'critical' : 'high',
          implementation_difficulty: 'medium'
        })
        .select()
        .single();

      if (evalError) {
        console.error('❌ 評価データ保存エラー:', evalError);
      } else {
        console.log('✅ 評価データ保存成功:', evalData.id);
      }

      // レート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`❌ エラー (${pattern.title}):`, error);
    }
  }

  console.log('\n✨ すべての処理が完了しました！');
  
  // 保存されたデータの確認
  const { data: savedDocs, error: fetchError } = await supabase
    .from('rag_documents')
    .select('id, title, evaluation_score')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!fetchError && savedDocs) {
    console.log('\n📊 保存されたドキュメント:');
    savedDocs.forEach(doc => {
      console.log(`  - ${doc.title} (スコア: ${(doc.evaluation_score * 100).toFixed(0)}%)`);
    });
  }
}

// ハイブリッド検索のテスト
async function testHybridSearch(query) {
  console.log(`\n🔍 ハイブリッド検索テスト: "${query}"`);
  
  // 検索クエリの埋め込みを生成
  const queryEmbedding = await generateEmbedding(query);
  
  // Supabaseで検索（実際のハイブリッド検索関数がある場合）
  // ここでは簡易的にベクトル類似度のみで検索
  const { data, error } = await supabase
    .rpc('hybrid_search_ui_components', {
      search_query: query,
      search_embedding: queryEmbedding,
      limit_count: 5
    });

  if (error) {
    console.error('検索エラー:', error);
    return;
  }

  console.log('\n検索結果:');
  data?.forEach((result, index) => {
    console.log(`${index + 1}. ${result.title}`);
    console.log(`   スコア: ${(result.combined_score * 100).toFixed(1)}%`);
    console.log(`   UIタイプ: ${result.ui_type}`);
  });
}

// 実行
(async () => {
  try {
    // UIパターンの処理
    await processUIPatterns();
    
    // 検索テスト
    await testHybridSearch('音楽プレイヤー');
    await testHybridSearch('カルーセル スクロール');
    
  } catch (error) {
    console.error('メイン処理エラー:', error);
  }
})();