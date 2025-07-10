// Training Upload Debug Script
// このスクリプトで実際のアップロードエラーを再現・デバッグします
// 
// 実行方法: node debug-training-upload.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function debugTrainingUpload() {
  console.log('=== Training Upload Debug ===\n');
  
  try {
    // 環境変数の確認
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing environment variables');
      return;
    }
    
    console.log('✅ Environment variables loaded');
    console.log('Project ID:', supabaseUrl.split('.')[0].split('//')[1]);
    
    // Supabaseクライアント作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 1. 現在のテーブル状況を確認
    console.log('\n1. Checking current table status...');
    
    // テーブル一覧を取得
    const { data: tables, error: tablesError } = await supabase
      .from('pg_tables')
      .select('tablename, schemaname')
      .eq('schemaname', 'public')
      .ilike('tablename', '%training%');
    
    if (tablesError) {
      console.error('❌ Cannot query tables:', tablesError.message);
    } else {
      console.log('Tables found:', tables.length);
      tables.forEach(table => {
        console.log(`  - ${table.schemaname}.${table.tablename}`);
      });
    }
    
    // 2. training_examplesテーブルの詳細確認
    console.log('\n2. Checking training_examples table details...');
    
    // テーブル情報を取得
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', 'training_examples')
      .order('ordinal_position');
    
    if (columnsError) {
      console.error('❌ Cannot query table columns:', columnsError.message);
      console.log('This suggests the training_examples table does not exist');
      
      // テーブルが存在しない場合の作成提案
      console.log('\n⚠️  SOLUTION: Create the training_examples table');
      console.log('Run the following SQL in Supabase SQL Editor:');
      console.log('');
      console.log('-- Create training_examples table');
      console.log('CREATE TABLE public.training_examples (');
      console.log('  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,');
      console.log('  added_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,');
      console.log('  image_url TEXT,');
      console.log('  ui_type TEXT NOT NULL,');
      console.log('  structure_note TEXT NOT NULL,');
      console.log('  review_text TEXT NOT NULL,');
      console.log('  tags TEXT[] DEFAULT \'{}\',');
      console.log('  is_approved BOOLEAN DEFAULT false,');
      console.log('  figma_url TEXT,');
      console.log('  score_aesthetic NUMERIC(3,1),');
      console.log('  score_usability NUMERIC(3,1),');
      console.log('  score_alignment NUMERIC(3,1),');
      console.log('  score_accessibility NUMERIC(3,1),');
      console.log('  score_consistency NUMERIC(3,1),');
      console.log('  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone(\'utc\'::text, now()) NOT NULL,');
      console.log('  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone(\'utc\'::text, now()) NOT NULL');
      console.log(');');
      
      return;
    }
    
    console.log('✅ Table columns found:', columns.length);
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // 3. RLS設定の確認
    console.log('\n3. Checking RLS settings...');
    
    const { data: rlsStatus, error: rlsError } = await supabase
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .eq('schemaname', 'public')
      .eq('tablename', 'training_examples');
    
    if (rlsError) {
      console.error('❌ Cannot check RLS status:', rlsError.message);
    } else if (rlsStatus && rlsStatus.length > 0) {
      console.log('RLS enabled:', rlsStatus[0].rowsecurity);
      
      if (rlsStatus[0].rowsecurity) {
        console.log('⚠️  RLS is enabled - checking policies...');
        
        // ポリシーの確認
        const { data: policies, error: policiesError } = await supabase
          .from('pg_policies')
          .select('policyname, cmd, permissive')
          .eq('tablename', 'training_examples');
        
        if (policiesError) {
          console.log('Cannot check policies:', policiesError.message);
        } else {
          console.log('Policies found:', policies.length);
          policies.forEach(policy => {
            console.log(`  - ${policy.policyname}: ${policy.cmd} (${policy.permissive})`);
          });
          
          if (policies.length === 0) {
            console.log('⚠️  No RLS policies found - this will block all operations');
          }
        }
      }
    }
    
    // 4. 実際のINSERT操作をテスト
    console.log('\n4. Testing actual INSERT operation...');
    
    const testData = {
      added_by: '00000000-0000-0000-0000-000000000000', // テスト用UUID
      image_url: 'https://example.com/test.jpg',
      ui_type: 'テスト画面',
      structure_note: 'テスト用の構造説明',
      review_text: 'テスト用のレビュー内容',
      tags: ['test', 'debug'],
      is_approved: false
    };
    
    console.log('Attempting to insert test data...');
    const { data: insertResult, error: insertError } = await supabase
      .from('training_examples')
      .insert(testData)
      .select('id');
    
    if (insertError) {
      console.error('❌ INSERT failed:', insertError.message);
      console.error('Error code:', insertError.code);
      console.error('Error details:', insertError.details);
      console.error('Error hint:', insertError.hint);
      
      // エラーの種類別対処法
      if (insertError.code === 'PGRST116') {
        console.log('\n⚠️  TABLE NOT FOUND ERROR');
        console.log('Solution: Run setup-database.sql to create the table');
      } else if (insertError.code === 'PGRST301') {
        console.log('\n⚠️  RLS POLICY ERROR');
        console.log('Solution: Configure RLS policies or disable RLS temporarily');
      } else if (insertError.code === '23503') {
        console.log('\n⚠️  FOREIGN KEY CONSTRAINT ERROR');
        console.log('Solution: Use a valid user ID or remove the foreign key constraint');
      } else if (insertError.code === '23514') {
        console.log('\n⚠️  CHECK CONSTRAINT ERROR');
        console.log('Solution: Check data values against table constraints');
      } else if (insertError.code === '23502') {
        console.log('\n⚠️  NOT NULL CONSTRAINT ERROR');
        console.log('Solution: Ensure all required fields are provided');
      }
    } else {
      console.log('✅ INSERT successful');
      console.log('Test record ID:', insertResult[0]?.id);
      
      // テストデータを削除
      const { error: deleteError } = await supabase
        .from('training_examples')
        .delete()
        .eq('id', insertResult[0]?.id);
      
      if (deleteError) {
        console.error('⚠️  Failed to clean up test data:', deleteError.message);
      } else {
        console.log('✅ Test data cleaned up');
      }
    }
    
    // 5. Storage バケットの確認
    console.log('\n5. Checking storage configuration...');
    
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();
    
    if (bucketsError) {
      console.error('❌ Cannot list buckets:', bucketsError.message);
    } else {
      console.log('Storage buckets found:', buckets.length);
      
      const trainingBucket = buckets.find(b => b.id === 'training-images');
      if (trainingBucket) {
        console.log('✅ training-images bucket exists');
        console.log('Configuration:', {
          public: trainingBucket.public,
          file_size_limit: trainingBucket.file_size_limit,
          allowed_mime_types: trainingBucket.allowed_mime_types
        });
      } else {
        console.log('❌ training-images bucket not found');
        console.log('Available buckets:', buckets.map(b => b.id));
        console.log('\n⚠️  SOLUTION: Create the training-images bucket');
        console.log('Run this SQL in Supabase SQL Editor:');
        console.log('INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)');
        console.log('VALUES (\'training-images\', \'training-images\', true, 10485760, ARRAY[\'image/jpeg\', \'image/png\', \'image/gif\', \'image/webp\']);');
      }
    }
    
    console.log('\n=== Debug Summary ===');
    console.log('Check the above output for specific error messages and solutions');
    console.log('Common issues:');
    console.log('1. Table not created - run setup-database.sql');
    console.log('2. RLS policies missing - configure proper policies');
    console.log('3. Storage bucket missing - create training-images bucket');
    console.log('4. Invalid user ID - use proper authentication');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.error('Stack trace:', error.stack);
  }
}

// 実行
debugTrainingUpload().catch(console.error);