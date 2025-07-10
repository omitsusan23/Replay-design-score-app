#!/usr/bin/env node

/**
 * プロジェクト設定確認テスト
 * Service Key設定後に実行して完全な設定を確認
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

async function testProjectSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  console.log('🔍 プロジェクト設定確認テストを開始します...\n');

  if (supabaseServiceKey === 'your-service-role-key') {
    console.log('❌ Service Keyが未設定です。');
    console.log('service-key-guide.mdを参照して、Service Keyを設定してください。\n');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // 1. 必要なテーブルの存在確認
  console.log('1. 必要なテーブルの存在確認:');
  const requiredTables = [
    'ui_submissions',
    'ui_scores', 
    'ui_feedbacks',
    'training_examples',
    'data_collection_jobs',
    'objective_ui_evaluations'
  ];

  const existingTables: string[] = [];
  const missingTables: string[] = [];

  for (const tableName of requiredTables) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`   ❌ ${tableName}: ${error.message}`);
        missingTables.push(tableName);
      } else {
        console.log(`   ✅ ${tableName}: 存在`);
        existingTables.push(tableName);
      }
    } catch (error) {
      console.log(`   ❌ ${tableName}: エラー`);
      missingTables.push(tableName);
    }
  }

  // 2. Storageバケットの確認
  console.log('\n2. Storageバケットの確認:');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('   ❌ バケット一覧取得エラー:', error.message);
    } else {
      console.log(`   ✅ バケット一覧取得: 成功 (${buckets.length}個)`);
      
      const trainingImagesBucket = buckets.find(b => b.name === 'training-images');
      if (trainingImagesBucket) {
        console.log('   ✅ training-images バケット: 存在');
        console.log(`      - Public: ${trainingImagesBucket.public}`);
        console.log(`      - Created: ${trainingImagesBucket.created_at}`);
      } else {
        console.log('   ❌ training-images バケット: 存在しない');
      }

      if (buckets.length > 0) {
        console.log('   現在のバケット一覧:');
        buckets.forEach(bucket => {
          console.log(`     - ${bucket.name} (${bucket.public ? 'Public' : 'Private'})`);
        });
      }
    }
  } catch (error) {
    console.log('   ❌ バケット確認エラー:', error);
  }

  // 3. Anonymous Keyの権限確認
  console.log('\n3. Anonymous Key権限確認:');
  const anonSupabase = createClient(supabaseUrl, supabaseAnonKey);
  
  for (const tableName of existingTables) {
    try {
      const { data, error } = await anonSupabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`   ❌ ${tableName}: Anonymous access denied - ${error.message}`);
      } else {
        console.log(`   ✅ ${tableName}: Anonymous access OK`);
      }
    } catch (error) {
      console.log(`   ❌ ${tableName}: Anonymous access error`);
    }
  }

  // 4. 設定推奨事項の出力
  console.log('\n4. 設定推奨事項:');
  
  if (missingTables.length > 0) {
    console.log('   📋 作成が必要なテーブル:');
    missingTables.forEach(table => {
      console.log(`     - ${table}`);
    });
  }

  const { data: buckets } = await supabase.storage.listBuckets();
  const hasTrainingBucket = buckets?.some(b => b.name === 'training-images');
  
  if (!hasTrainingBucket) {
    console.log('   📋 作成が必要なStorageバケット:');
    console.log('     - training-images (Public bucket)');
  }

  // 5. SQL生成（テーブル作成用）
  if (missingTables.length > 0) {
    console.log('\n5. テーブル作成用SQL:');
    console.log('   以下のSQLをSupabaseダッシュボードのSQL Editorで実行してください:\n');
    
    const tableDefinitions = {
      'ui_submissions': `
CREATE TABLE ui_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  images JSONB,
  metadata JSONB,
  status TEXT DEFAULT 'pending'
);`,
      'ui_scores': `
CREATE TABLE ui_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES ui_submissions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  overall_score INTEGER,
  detailed_scores JSONB,
  ai_feedback TEXT
);`,
      'ui_feedbacks': `
CREATE TABLE ui_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES ui_submissions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  feedback_text TEXT,
  rating INTEGER,
  category TEXT
);`,
      'training_examples': `
CREATE TABLE training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  image_url TEXT,
  score INTEGER,
  feedback TEXT,
  category TEXT,
  metadata JSONB
);`,
      'data_collection_jobs': `
CREATE TABLE data_collection_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  job_type TEXT,
  parameters JSONB,
  results JSONB,
  completed_at TIMESTAMP WITH TIME ZONE
);`,
      'objective_ui_evaluations': `
CREATE TABLE objective_ui_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submission_id UUID REFERENCES ui_submissions(id),
  evaluation_results JSONB,
  metrics JSONB,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`
    };

    missingTables.forEach(table => {
      if (tableDefinitions[table]) {
        console.log(`-- ${table} テーブル`);
        console.log(tableDefinitions[table]);
        console.log('');
      }
    });
  }

  console.log('\n🎉 プロジェクト設定確認完了');
  console.log(`\n📊 結果サマリー:`);
  console.log(`   - 存在するテーブル: ${existingTables.length}/${requiredTables.length}`);
  console.log(`   - 存在するバケット: ${buckets?.length || 0}`);
  console.log(`   - training-imagesバケット: ${hasTrainingBucket ? '✅' : '❌'}`);
}

// 実行
testProjectSetup().catch(console.error);