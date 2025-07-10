// Supabase Database Connection Test
// このスクリプトでデータベース接続と構造をテストします
// 
// 実行方法: node test-database-connection.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testDatabaseConnection() {
  console.log('=== Supabase Database Connection Test ===\n');
  
  try {
    // 環境変数の確認
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing environment variables:');
      console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
      console.error('SUPABASE_SERVICE_KEY:', !!supabaseServiceKey);
      return;
    }
    
    console.log('✅ Environment variables found');
    console.log('Supabase URL:', supabaseUrl);
    console.log('Service Key:', supabaseServiceKey.substring(0, 20) + '...\n');
    
    // Supabaseクライアント作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 1. 基本的な接続テスト
    console.log('1. Testing basic connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('training_examples')
      .select('*')
      .limit(1);
    
    if (connectionError) {
      console.error('❌ Connection failed:', connectionError.message);
      
      // より詳細なエラー情報
      if (connectionError.code) {
        console.error('Error code:', connectionError.code);
      }
      if (connectionError.details) {
        console.error('Error details:', connectionError.details);
      }
      if (connectionError.hint) {
        console.error('Error hint:', connectionError.hint);
      }
      
      return;
    }
    
    console.log('✅ Basic connection successful\n');
    
    // 2. training_examplesテーブル構造の確認
    console.log('2. Checking training_examples table structure...');
    let tableInfo = null;
    let tableError = null;
    
    try {
      const rpcResult = await supabase.rpc('get_table_structure', { table_name: 'training_examples' });
      tableInfo = rpcResult.data;
      tableError = rpcResult.error;
    } catch (rpcError) {
      // RPCが利用できない場合は、直接SQLクエリを試す
      const columnResult = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_name', 'training_examples')
        .eq('table_schema', 'public');
      
      tableInfo = columnResult.data;
      tableError = columnResult.error;
    }
    
    if (tableError) {
      console.error('❌ Table structure check failed:', tableError.message);
      
      // テーブルが存在しない場合の対処
      if (tableError.code === 'PGRST116' || tableError.message.includes('does not exist')) {
        console.log('⚠️  training_examples table does not exist');
        console.log('Please run the setup-database.sql script first');
        return;
      }
    } else {
      console.log('✅ Table structure retrieved');
      if (tableInfo) {
        console.log('Columns found:', tableInfo.length);
        tableInfo.forEach(col => {
          console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
        });
      }
    }
    
    console.log('');
    
    // 3. INSERT権限のテスト
    console.log('3. Testing INSERT permission...');
    const testData = {
      added_by: '00000000-0000-0000-0000-000000000000', // テスト用UUID
      image_url: 'https://example.com/test-image.jpg',
      ui_type: 'テスト',
      structure_note: 'テスト用の構造メモ',
      review_text: 'テスト用のレビュー',
      tags: ['test'],
      is_approved: false,
      score_aesthetic: 8.0,
      score_usability: 7.5,
      score_alignment: 8.5,
      score_accessibility: 7.0,
      score_consistency: 8.0
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('training_examples')
      .insert(testData)
      .select('id');
    
    if (insertError) {
      console.error('❌ INSERT test failed:', insertError.message);
      
      // RLS関連のエラーかチェック
      if (insertError.code === 'PGRST301' || insertError.message.includes('RLS')) {
        console.log('⚠️  This might be an RLS (Row Level Security) issue');
        console.log('Make sure RLS policies are properly configured');
      }
    } else {
      console.log('✅ INSERT test successful');
      console.log('Test record ID:', insertData[0]?.id);
      
      // テストデータを削除
      await supabase
        .from('training_examples')
        .delete()
        .eq('id', insertData[0]?.id);
      
      console.log('✅ Test record cleaned up');
    }
    
    console.log('');
    
    // 4. Storage バケットの確認
    console.log('4. Checking storage bucket...');
    const { data: buckets, error: bucketError } = await supabase
      .storage
      .listBuckets();
    
    if (bucketError) {
      console.error('❌ Storage bucket check failed:', bucketError.message);
    } else {
      console.log('✅ Storage buckets retrieved');
      const trainingBucket = buckets.find(bucket => bucket.id === 'training-images');
      
      if (trainingBucket) {
        console.log('✅ training-images bucket exists');
        console.log('Bucket config:', {
          name: trainingBucket.name,
          public: trainingBucket.public,
          file_size_limit: trainingBucket.file_size_limit,
          allowed_mime_types: trainingBucket.allowed_mime_types
        });
      } else {
        console.log('❌ training-images bucket not found');
        console.log('Available buckets:', buckets.map(b => b.id));
      }
    }
    
    console.log('');
    
    // 5. RLS ポリシーの確認（可能な場合）
    console.log('5. Checking RLS policies...');
    let policies = null;
    let policyError = null;
    
    try {
      const policyResult = await supabase
        .from('pg_policies')
        .select('policyname, cmd, qual, with_check')
        .eq('tablename', 'training_examples');
      
      policies = policyResult.data;
      policyError = policyResult.error;
    } catch (error) {
      policyError = { message: 'Policy check not available' };
    }
    
    if (policyError) {
      console.log('⚠️  RLS policy check not available:', policyError.message);
    } else if (policies && policies.length > 0) {
      console.log('✅ RLS policies found:', policies.length);
      policies.forEach(policy => {
        console.log(`  - ${policy.policyname}: ${policy.cmd}`);
      });
    } else {
      console.log('⚠️  No RLS policies found');
    }
    
    console.log('\n=== Test Summary ===');
    console.log('✅ Database connection test completed');
    console.log('Check the results above for any issues that need to be addressed');
    
  } catch (error) {
    console.error('❌ Unexpected error during testing:', error);
    console.error('Stack trace:', error.stack);
  }
}

// 実行
testDatabaseConnection().catch(console.error);