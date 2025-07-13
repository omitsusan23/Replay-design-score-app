import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// OpenAI クライアント
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase クライアント
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
);

// text-embedding-3-small を使用した埋め込み生成（1536次元）
async function generateEmbeddings(texts) {
  try {
    console.log(`🧠 OpenAI埋め込み生成中（${texts.length}件）...`);
    
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

// サンプルデータ（有名アプリのUIパターン）
const sampleUIPatterns = [
  {
    title: 'Spotify - 音楽プレイヤーバー',
    ui_type: 'player',
    description: 'Spotifyの常時表示される音楽プレイヤーバー。再生コントロール、進行状況、音量調整を統合したUI',
    copied_content: `<div class="player-bar fixed bottom-0 w-full bg-black text-white p-4 flex items-center justify-between">
      <!-- 現在再生中の情報 -->
      <div class="now-playing flex items-center space-x-4 w-1/4">
        <img src="album-cover.jpg" alt="Album Cover" class="w-14 h-14 rounded" />
        <div class="track-info">
          <div class="track-name text-sm font-medium hover:underline cursor-pointer">Shape of You</div>
          <div class="artist-name text-xs text-gray-400 hover:underline cursor-pointer">Ed Sheeran</div>
        </div>
        <button class="heart-button text-green-500 hover:scale-110 transition-transform">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>
      
      <!-- プレイヤーコントロール -->
      <div class="player-controls flex flex-col items-center w-2/4">
        <div class="control-buttons flex items-center space-x-6 mb-2">
          <button class="shuffle text-gray-400 hover:text-white transition-colors">
            <svg class="w-4 h-4" />
          </button>
          <button class="previous hover:scale-110 transition-transform">
            <svg class="w-5 h-5" />
          </button>
          <button class="play-pause bg-white text-black rounded-full p-2 hover:scale-105 transition-transform">
            <svg class="w-4 h-4" />
          </button>
          <button class="next hover:scale-110 transition-transform">
            <svg class="w-5 h-5" />
          </button>
          <button class="repeat text-gray-400 hover:text-white transition-colors">
            <svg class="w-4 h-4" />
          </button>
        </div>
        
        <!-- プログレスバー -->
        <div class="progress-container flex items-center space-x-2 w-full">
          <span class="text-xs text-gray-400">1:23</span>
          <div class="progress-bar bg-gray-600 h-1 rounded-full flex-1 relative group cursor-pointer">
            <div class="progress-fill bg-white h-1 rounded-full w-1/3 relative">
              <div class="progress-handle absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          </div>
          <span class="text-xs text-gray-400">3:42</span>
        </div>
      </div>
      
      <!-- 音量・その他のコントロール -->
      <div class="extra-controls flex items-center space-x-4 w-1/4 justify-end">
        <button class="queue text-gray-400 hover:text-white">
          <svg class="w-4 h-4" />
        </button>
        <button class="devices text-gray-400 hover:text-white">
          <svg class="w-4 h-4" />
        </button>
        <div class="volume-control flex items-center space-x-2">
          <button class="volume-icon text-gray-400 hover:text-white">
            <svg class="w-4 h-4" />
          </button>
          <input type="range" class="volume-slider w-20 h-1" min="0" max="100" />
        </div>
        <button class="fullscreen text-gray-400 hover:text-white">
          <svg class="w-4 h-4" />
        </button>
      </div>
    </div>`,
    keywords: ['音楽', 'プレイヤー', 'メディアコントロール', 'Spotify', '再生バー', 'オーディオ'],
    app_name: 'Spotify',
    app_category: 'music',
    design_features: ['固定位置', 'グローバルコントロール', 'プログレスバー', '音量調整', 'アルバムアート'],
    structural_analysis: '画面下部に固定配置されたグローバル音楽プレイヤー。3つのセクション（現在再生中、コントロール、音量）に分割され、レスポンシブ対応。'
  },
  {
    title: 'Netflix - コンテンツカルーセル',
    ui_type: 'carousel',
    description: 'Netflixの水平スクロール可能なコンテンツカルーセル。ホバーエフェクトと動的読み込み対応',
    copied_content: `<div class="content-carousel py-6">
      <h2 class="carousel-title text-white text-xl font-bold mb-4 px-12">今話題の作品</h2>
      
      <div class="carousel-container relative group">
        <!-- 左ナビゲーション -->
        <button class="carousel-nav prev absolute left-2 z-10 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-3 rounded opacity-0 group-hover:opacity-100 transition-all duration-300">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
        
        <!-- カルーセルアイテム -->
        <div class="carousel-items flex space-x-2 overflow-hidden px-12">
          <div class="content-card group relative cursor-pointer transform transition-all duration-300 hover:scale-110 hover:z-10">
            <img src="movie-thumbnail-1.jpg" 
                 alt="Movie Title" 
                 class="w-48 h-72 object-cover rounded-md shadow-lg" />
                 
            <!-- ホバーオーバーレイ -->
            <div class="content-overlay absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all duration-300 flex items-end p-4 opacity-0 group-hover:opacity-100">
              <div class="overlay-content">
                <h3 class="movie-title text-white font-bold text-sm mb-2">映画タイトル</h3>
                <div class="action-buttons flex space-x-2">
                  <button class="play-button bg-white text-black rounded-full p-2 hover:bg-gray-200 transition-colors">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                  <button class="add-list border-2 border-white text-white rounded-full p-2 hover:bg-white hover:text-black transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                  </button>
                  <button class="thumbs-up border-2 border-white text-white rounded-full p-2 hover:bg-white hover:text-black transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/>
                    </svg>
                  </button>
                </div>
                <div class="movie-meta mt-2">
                  <div class="match-score text-green-400 text-xs font-bold">98% マッチ</div>
                  <div class="movie-info text-gray-300 text-xs mt-1">
                    <span class="duration">2時間13分</span>
                    <span class="rating ml-2 border border-gray-500 px-1">PG-13</span>
                    <span class="year ml-2">2023</span>
                  </div>
                  <div class="genres text-gray-400 text-xs mt-1">アクション • アドベンチャー • SF</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 追加のカードアイテム... -->
          
        </div>
        
        <!-- 右ナビゲーション -->
        <button class="carousel-nav next absolute right-2 z-10 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-3 rounded opacity-0 group-hover:opacity-100 transition-all duration-300">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
      </div>
    </div>`,
    keywords: ['動画', 'カルーセル', 'コンテンツ表示', 'Netflix', 'スクロール', 'ホバーエフェクト'],
    app_name: 'Netflix',
    app_category: 'video',
    design_features: ['水平スクロール', 'ホバー拡大', 'オーバーレイUI', 'ナビゲーション矢印', 'レスポンシブ'],
    structural_analysis: '水平方向にスクロール可能なコンテンツグリッド。ホバー時の拡大エフェクトとオーバーレイ情報表示で直感的な操作性を実現。'
  },
  {
    title: 'Notion - 階層型サイドバーナビゲーション',
    ui_type: 'navigation',
    description: 'Notionの折りたたみ可能な階層型サイドバー。ワークスペース管理と検索機能を統合',
    copied_content: `<nav class="sidebar w-64 bg-gray-50 border-r border-gray-200 h-full flex flex-col">
      <!-- ワークスペースヘッダー -->
      <div class="workspace-header p-3 border-b border-gray-200">
        <button class="workspace-switcher w-full flex items-center justify-between p-2 hover:bg-gray-100 rounded-md transition-colors group">
          <div class="flex items-center space-x-3">
            <div class="workspace-icon w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded text-white text-xs font-bold flex items-center justify-center">
              MW
            </div>
            <span class="workspace-name font-medium text-gray-900">My Workspace</span>
          </div>
          <svg class="w-4 h-4 text-gray-500 group-hover:text-gray-700 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>
      </div>
      
      <!-- 検索ボックス -->
      <div class="search-section p-3">
        <div class="search-box relative">
          <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input 
            type="text" 
            placeholder="検索..." 
            class="w-full pl-10 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <kbd class="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">⌘K</kbd>
        </div>
      </div>
      
      <!-- ナビゲーション項目 -->
      <div class="nav-content flex-1 overflow-y-auto p-3 space-y-1">
        <!-- 新規作成ボタン -->
        <button class="new-page-btn w-full flex items-center space-x-2 p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
          </svg>
          <span>新しいページ</span>
        </button>
        
        <!-- フォルダ/ページ階層 -->
        <div class="nav-hierarchy">
          <div class="nav-item">
            <div class="nav-item-header flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer group">
              <button class="expand-toggle p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-3 h-3 transform rotate-0 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              </button>
              <span class="page-icon mr-2 text-lg">📁</span>
              <span class="page-title flex-1 text-sm text-gray-700">プロジェクト</span>
              <button class="options-menu opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </button>
            </div>
            
            <!-- ネストしたページ -->
            <div class="nav-children ml-6 space-y-1">
              <div class="nav-item-child flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer group">
                <span class="page-icon mr-2">📄</span>
                <span class="page-title flex-1 text-sm text-gray-600">会議ノート</span>
                <span class="page-status opacity-0 group-hover:opacity-100 text-xs text-gray-400">編集中</span>
              </div>
              
              <div class="nav-item-child flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer group">
                <span class="page-icon mr-2">✅</span>
                <span class="page-title flex-1 text-sm text-gray-600">タスクリスト</span>
                <span class="task-count text-xs bg-red-500 text-white rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100">3</span>
              </div>
              
              <div class="nav-item-child flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer group">
                <span class="page-icon mr-2">📊</span>
                <span class="page-title flex-1 text-sm text-gray-600">データベース</span>
              </div>
            </div>
          </div>
          
          <!-- 個別ページ -->
          <div class="nav-item flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer group">
            <span class="page-icon mr-2 ml-4">📝</span>
            <span class="page-title flex-1 text-sm text-gray-700">個人メモ</span>
            <span class="last-edited opacity-0 group-hover:opacity-100 text-xs text-gray-400">1時間前</span>
          </div>
        </div>
      </div>
      
      <!-- フッター -->
      <div class="sidebar-footer p-3 border-t border-gray-200">
        <button class="w-full flex items-center space-x-2 p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          <span>ゴミ箱</span>
        </button>
      </div>
    </nav>`,
    keywords: ['生産性', 'ナビゲーション', 'サイドバー', 'Notion', 'ワークスペース', '階層構造'],
    app_name: 'Notion',
    app_category: 'productivity',
    design_features: ['折りたたみ可能', '階層表示', '検索統合', 'ホバーエフェクト', 'コンテキストメニュー'],
    structural_analysis: '左サイドバーによる階層型ナビゲーション。ワークスペース管理、検索、ページ階層を統合したインターフェース。'
  }
];

// メイン処理
async function insertSampleData() {
  console.log('🚀 RAGサンプルデータの投入を開始します...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [index, pattern] of sampleUIPatterns.entries()) {
    try {
      console.log(`\n📋 処理中 ${index + 1}/${sampleUIPatterns.length}: ${pattern.title}`);
      
      // 1. 埋め込み用テキストの準備
      const textsToEmbed = [
        // メイン埋め込み用
        `${pattern.title} ${pattern.description} ${pattern.design_features.join(' ')} ${pattern.structural_analysis}`,
        
        // コンテンツ埋め込み用  
        `UIタイプ: ${pattern.ui_type}
         アプリ: ${pattern.app_name} (${pattern.app_category})
         設計特徴: ${pattern.design_features.join(', ')}
         構造分析: ${pattern.structural_analysis}
         キーワード: ${pattern.keywords.join(', ')}
         HTML構造:
         ${pattern.copied_content}`,
         
        // タイトル埋め込み用
        `${pattern.title} - ${pattern.app_name} ${pattern.ui_type}パターン`
      ];
      
      // 2. OpenAI埋め込み生成
      console.log('🧠 OpenAI埋め込み生成中...');
      const embeddings = await generateEmbeddings(textsToEmbed);
      
      // 3. Claude評価のシミュレーション（実際のAPIを使用する場合は置き換え）
      const claudeEvaluation = {
        consistency_score: 0.85 + Math.random() * 0.15,
        quality: {
          reusability: ['高', '中'][Math.floor(Math.random() * 2)],
          maintainability: ['高', '中'][Math.floor(Math.random() * 2)], 
          accessibility: ['高', '中', '低'][Math.floor(Math.random() * 3)]
        },
        improvements: [
          "セマンティックHTMLの使用を推奨",
          "ARIAラベルの追加",
          "キーボードナビゲーションの強化",
          "カラーコントラストの改善",
          "レスポンシブデザインの最適化"
        ].slice(0, Math.floor(Math.random() * 3) + 2),
        ui_classification: {
          primary_type: pattern.ui_type,
          secondary_types: pattern.design_features.slice(0, 3)
        },
        structural_analysis: pattern.structural_analysis,
        design_features: pattern.design_features
      };

      // 4. RAGドキュメントをSupabaseに保存
      const { data: docData, error: docError } = await supabase
        .from('rag_documents')
        .insert({
          title: pattern.title,
          ui_type: pattern.ui_type,
          description: pattern.description,
          copied_content: pattern.copied_content,
          paste_context: {
            source: 'sample_data',
            app_name: pattern.app_name,
            app_category: pattern.app_category,
            design_features: pattern.design_features,
            structural_analysis: pattern.structural_analysis
          },
          keywords: pattern.keywords,
          claude_evaluation: claudeEvaluation,
          evaluation_score: claudeEvaluation.consistency_score,
          improvement_notes: claudeEvaluation.improvements,
          embedding: embeddings[0],
          content_embedding: embeddings[1],
          title_embedding: embeddings[2],
          embedding_model: 'text-embedding-3-small',
          embedding_generated_at: new Date().toISOString(),
          is_approved: claudeEvaluation.consistency_score > 0.9,
          review_count: 0
        })
        .select()
        .single();

      if (docError) {
        throw new Error(`RAGドキュメント保存エラー: ${docError.message}`);
      }

      console.log(`✅ RAGドキュメント保存成功: ${docData.id}`);

      // 5. 評価データの保存
      const { data: evalData, error: evalError } = await supabase
        .from('ui_learning_evaluations')
        .insert({
          document_id: docData.id,
          app_name: pattern.app_name,
          app_category: pattern.app_category,
          design_system: {
            color_scheme: {
              primary_colors: pattern.app_name === 'Spotify' ? ["#1DB954", "#191414"] : 
                             pattern.app_name === 'Netflix' ? ["#E50914", "#000000"] : 
                             ["#0066CC", "#F7F7F7"],
              dark_mode_support: pattern.app_name !== 'Notion'
            },
            typography: {
              font_families: pattern.app_name === 'Spotify' ? ["Circular", "Helvetica"] :
                            pattern.app_name === 'Netflix' ? ["Netflix Sans", "Arial"] :
                            ["Inter", "system-ui"],
              readability_score: 0.8 + Math.random() * 0.2
            },
            spacing: {
              base_unit: "4px",
              consistency_score: 0.8 + Math.random() * 0.2
            }
          },
          ux_patterns: {
            navigation: {
              pattern_type: pattern.ui_type,
              consistency: 0.8 + Math.random() * 0.2
            },
            interaction: {
              gesture_support: ["click", "hover", "keyboard"],
              feedback_types: ["visual", "auditory"]
            }
          },
          accessibility: {
            wcag_compliance: {
              level: "AA",
              violations: [],
              passes: ["color_contrast", "keyboard_navigation"]
            }
          },
          overall_score: claudeEvaluation.consistency_score,
          learning_priority: claudeEvaluation.consistency_score > 0.9 ? 'critical' : 'high',
          implementation_difficulty: 'medium'
        })
        .select()
        .single();

      if (evalError) {
        console.warn(`⚠️ 評価データ保存警告: ${evalError.message}`);
      } else {
        console.log(`✅ 評価データ保存成功: ${evalData.id}`);
      }

      successCount++;
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`❌ エラー (${pattern.title}):`, error);
      errorCount++;
    }
  }

  console.log('\n✨ サンプルデータ投入完了！');
  console.log(`成功: ${successCount}件, エラー: ${errorCount}件\n`);

  // 5. 投入結果の確認
  try {
    const { data: savedDocs, error: fetchError } = await supabase
      .from('ui_patterns_overview')
      .select('*')
      .order('evaluation_score', { ascending: false })
      .limit(10);

    if (!fetchError && savedDocs) {
      console.log('📊 保存されたRAGドキュメント:');
      savedDocs.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.title}`);
        console.log(`     スコア: ${(doc.evaluation_score * 100).toFixed(0)}% | タイプ: ${doc.ui_type} | アプリ: ${doc.app_name || 'N/A'}`);
      });
    }

    // 統計情報の表示
    const { data: stats } = await supabase
      .rpc('hybrid_search_ui_components', {
        search_query: 'プレイヤー',
        search_embedding: embeddings[0], // 最後に生成した埋め込みを使用
        limit_count: 3
      });

    if (stats) {
      console.log('\n🔍 検索テスト結果（クエリ: "プレイヤー"）:');
      stats.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (総合スコア: ${(result.combined_score * 100).toFixed(1)}%)`);
      });
    }

  } catch (error) {
    console.error('結果確認エラー:', error);
  }
}

// 実行
(async () => {
  try {
    await insertSampleData();
  } catch (error) {
    console.error('メイン処理エラー:', error);
    process.exit(1);
  }
})();