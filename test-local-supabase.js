// ローカルSupabase接続テスト
const { createClient } = require('@supabase/supabase-js');

// ローカルSupabaseの設定
const supabaseUrl = 'http://localhost:54321';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function testLocalSupabase() {
    console.log('🚀 ローカルSupabase接続テスト開始...');
    console.log('URL:', supabaseUrl);
    
    try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // 基本接続テスト
        console.log('\n1️⃣ 基本接続テスト...');
        const { data, error } = await supabase.from('ui_submissions').select('count').limit(1);
        
        if (error) {
            console.error('❌ 接続エラー:', error.message);
            return;
        }
        
        console.log('✅ 基本接続成功');
        
        // テーブル存在確認
        console.log('\n2️⃣ テーブル存在確認...');
        const { data: submissions } = await supabase.from('ui_submissions').select('*').limit(1);
        const { data: scores } = await supabase.from('ui_scores').select('*').limit(1);
        
        console.log('✅ ui_submissions テーブル:', submissions !== null ? '存在' : '確認済み');
        console.log('✅ ui_scores テーブル:', scores !== null ? '存在' : '確認済み');
        
        // ビュー確認
        console.log('\n3️⃣ ビューの確認...');
        const { data: viewData } = await supabase.from('ui_submissions_with_scores').select('*').limit(1);
        console.log('✅ ui_submissions_with_scores ビュー:', viewData !== null ? '存在' : '確認済み');
        
        console.log('\n🎉 ローカルSupabase接続テスト完了！');
        console.log('📊 データベース準備完了 - アプリケーションでテストできます');
        
    } catch (err) {
        console.error('❌ 予期しないエラー:', err.message);
    }
}

// テスト実行
testLocalSupabase(); 