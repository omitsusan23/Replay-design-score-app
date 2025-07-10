#!/usr/bin/env node

/**
 * 基本的なSupabase接続テスト
 * Anonymous keyでの接続確認
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

async function testBasicSupabaseConnection() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  console.log('🔍 Supabase基本接続テストを開始します...\n');

  // 1. 環境変数の確認
  console.log('1. 環境変数の確認:');
  console.log(`   URL: ${supabaseUrl}`);
  console.log(`   Anon Key: ${supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : '❌ 未設定'}`);
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('❌ 必要な環境変数が設定されていません。');
    return;
  }

  // 2. 基本接続テスト（Anonymous Key）
  console.log('\n2. Anonymous Key接続テスト:');
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // 基本的な接続確認
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error && error.message.includes('invalid')) {
      console.log('   ❌ Anonymous Key: 無効またはアクセスできません');
      console.log('   エラー:', error.message);
    } else {
      console.log('   ✅ Anonymous Key: 接続成功');
      console.log('   現在のユーザー:', user ? '認証済み' : '未認証（正常）');
    }
  } catch (error) {
    console.log('   ❌ 接続エラー:', error);
  }

  // 3. プロジェクトのヘルスチェック
  console.log('\n3. プロジェクトヘルスチェック:');
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // パブリックなスキーマ情報の取得を試行
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .limit(1);
    
    if (error) {
      console.log('   ❌ データベース接続エラー:', error.message);
      
      // エラーの詳細分析
      if (error.message.includes('401')) {
        console.log('   → 認証エラー: Anonymous keyが無効です');
      } else if (error.message.includes('403')) {
        console.log('   → 権限エラー: Anonymous keyに十分な権限がありません');
      } else if (error.message.includes('404')) {
        console.log('   → プロジェクトが見つかりません');
      } else if (error.message.includes('connection')) {
        console.log('   → ネットワーク接続エラー');
      }
    } else {
      console.log('   ✅ データベース接続: 成功');
      console.log(`   取得したテーブル数: ${data?.length || 0}`);
    }
  } catch (error) {
    console.log('   ❌ ヘルスチェックエラー:', error);
  }

  // 4. Storage接続テスト
  console.log('\n4. Storage接続テスト:');
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('   ❌ Storage接続エラー:', error.message);
    } else {
      console.log('   ✅ Storage接続: 成功');
      console.log(`   利用可能なバケット数: ${buckets?.length || 0}`);
      
      if (buckets && buckets.length > 0) {
        console.log('   バケット一覧:');
        buckets.forEach(bucket => {
          console.log(`     - ${bucket.name} (${bucket.public ? 'Public' : 'Private'})`);
        });
      }
    }
  } catch (error) {
    console.log('   ❌ Storage接続エラー:', error);
  }

  // 5. URL形式の確認
  console.log('\n5. URL形式の確認:');
  const urlPattern = /^https:\/\/[a-zA-Z0-9]+\.supabase\.co$/;
  if (urlPattern.test(supabaseUrl)) {
    console.log('   ✅ URL形式: 正常');
  } else {
    console.log('   ❌ URL形式: 無効');
    console.log('   期待する形式: https://[project-ref].supabase.co');
  }

  // 6. Anonymous Keyの形式確認
  console.log('\n6. Anonymous Key形式の確認:');
  try {
    const payload = JSON.parse(Buffer.from(supabaseAnonKey.split('.')[1], 'base64').toString());
    console.log('   ✅ JWT形式: 正常');
    console.log(`   発行者: ${payload.iss}`);
    console.log(`   役割: ${payload.role}`);
    console.log(`   プロジェクト参照: ${payload.ref}`);
    console.log(`   有効期限: ${new Date(payload.exp * 1000).toLocaleString()}`);
  } catch (error) {
    console.log('   ❌ JWT形式: 無効');
    console.log('   Anonymous keyは有効なJWTトークンである必要があります');
  }

  console.log('\n🎉 基本接続テスト完了');
}

// 実行
testBasicSupabaseConnection().catch(console.error);