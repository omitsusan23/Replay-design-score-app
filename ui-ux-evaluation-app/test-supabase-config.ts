#!/usr/bin/env node

/**
 * Supabase設定確認スクリプト
 * 
 * 使用方法:
 * 1. SUPABASE_SERVICE_KEYを実際の値に設定してから実行
 * 2. npx ts-node test-supabase-config.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

async function testSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  console.log('🔍 Supabase設定確認を開始します...\n');

  // 1. 環境変数の確認
  console.log('1. 環境変数の確認:');
  console.log(`   URL: ${supabaseUrl}`);
  console.log(`   Anon Key: ${supabaseAnonKey.substring(0, 20)}...`);
  console.log(`   Service Key: ${supabaseServiceKey === 'your-service-role-key' ? '❌ 未設定' : '✅ 設定済み'}`);

  if (supabaseServiceKey === 'your-service-role-key') {
    console.log('\n❌ SUPABASE_SERVICE_KEYが未設定です。');
    console.log('   Supabaseダッシュボード → Settings → API から service_role キーを取得してください。');
    return;
  }

  // 2. 接続テスト
  console.log('\n2. 接続テスト:');
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // プロジェクト情報を取得
    const { data, error } = await supabase.from('information_schema.tables').select('table_name').limit(1);
    
    if (error) {
      console.log('   ❌ 接続エラー:', error.message);
    } else {
      console.log('   ✅ 接続成功');
    }
  } catch (error) {
    console.log('   ❌ 接続エラー:', error);
  }

  // 3. テーブル存在確認
  console.log('\n3. テーブル存在確認:');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const requiredTables = [
    'ui_submissions',
    'ui_scores',
    'ui_feedbacks',
    'training_examples',
    'data_collection_jobs',
    'objective_ui_evaluations'
  ];

  for (const tableName of requiredTables) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`   ❌ ${tableName}: ${error.message}`);
      } else {
        console.log(`   ✅ ${tableName}: 存在`);
      }
    } catch (error) {
      console.log(`   ❌ ${tableName}: エラー`);
    }
  }

  // 4. Storage バケット確認
  console.log('\n4. Storage バケット確認:');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('   ❌ バケット一覧取得エラー:', error.message);
    } else {
      const trainingImagesBucket = buckets.find(b => b.name === 'training-images');
      if (trainingImagesBucket) {
        console.log('   ✅ training-images バケット: 存在');
        console.log(`      - Public: ${trainingImagesBucket.public}`);
        console.log(`      - Created: ${trainingImagesBucket.created_at}`);
      } else {
        console.log('   ❌ training-images バケット: 存在しない');
      }
    }
  } catch (error) {
    console.log('   ❌ バケット確認エラー:', error);
  }

  // 5. 認証設定確認
  console.log('\n5. 認証設定確認:');
  try {
    // Anonymous keyでの接続確認
    const anonSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await anonSupabase.auth.getUser();
    
    if (error && error.message.includes('invalid')) {
      console.log('   ❌ Anonymous Key: 無効');
    } else {
      console.log('   ✅ Anonymous Key: 有効');
    }
  } catch (error) {
    console.log('   ❌ 認証確認エラー:', error);
  }

  console.log('\n🎉 設定確認完了');
}

// 型定義を追加
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
      SUPABASE_SERVICE_KEY: string;
    }
  }
}

// 実行
testSupabaseConfig().catch(console.error);