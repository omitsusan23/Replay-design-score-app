# 教師データ収集システム セットアップガイド

教師データ収集用のUIアップロード＆評価フォームが実装されました。

## 📦 実装完了ファイル

```
/components/UploadForm.tsx                          # 複数画像アップロードUI
/libs/supabase-upload.ts                           # Supabase Storageアップロード処理
/libs/claude-eval.ts                               # Claude API自動評価システム
/libs/save-to-db.ts                                # training_examplesテーブル保存処理
/src/app/api/training-examples/upload/route.ts     # API Route統合
/src/app/training-upload/page.tsx                  # メインページ
```

## 🔧 必要なパッケージのインストール

```bash
npm install react-hot-toast react-dropzone
```

## 🗄️ Supabase設定

### 1. training_examplesテーブルの作成
```bash
psql -h YOUR_SUPABASE_HOST -U postgres -d postgres -f lib/rag-training-examples-schema.sql
```

### 2. Storage Bucketの作成
Supabase Dashboard → Storage → Create bucket
- Bucket名: `training-images`
- Public bucket: ✅ 有効
- File size limit: 10MB
- Allowed MIME types: `image/jpeg, image/png, image/gif, image/webp`

### 3. RLSポリシーの確認
```sql
-- training_examplesテーブルのRLSが有効になっていることを確認
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'training_examples';
```

## 🔑 環境変数の設定

`.env.local`に以下を追加：

```env
# Supabase設定
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Claude API設定
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## 🚀 使用方法

### 1. ページアクセス
```
http://localhost:3000/training-upload
```

### 2. システムフロー
1. **ログイン必須**: ユーザー認証が必要
2. **画像アップロード**: 最大10枚、各10MB以下
3. **AI自動評価**: Claude APIが各画像を分析
4. **データベース保存**: training_examplesテーブルに保存
5. **管理者承認待ち**: `is_approved=false`で保存

### 3. 制限事項
- 1日最大50枚のアップロード制限
- 1回最大10枚まで
- 対応形式: JPEG, PNG, GIF, WebP

## 📊 Claude評価出力フォーマット

各画像に対して以下の形式で自動評価：

```json
{
  "ui_type": "LP",
  "structure_note": "ファーストビューでのCTA配置が効果的...",
  "review_text": "コンバージョンを重視した構造設計が優秀...",
  "tags": ["CTA優", "構造優", "視認性良好"]
}
```

## 🔍 API エンドポイント

### POST `/api/training-examples/upload`

**リクエスト:**
```javascript
const formData = new FormData();
formData.append('projectName', 'ECサイトUI改善案');
formData.append('images[0]', imageFile1);
formData.append('images[1]', imageFile2);

fetch('/api/training-examples/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

**レスポンス:**
```json
{
  "success": true,
  "savedCount": 3,
  "totalImages": 3,
  "details": {
    "upload": { "success": 3, "failed": 0 },
    "evaluation": { "success": 3, "failed": 0 },
    "save": { "success": 3, "failed": 0 }
  },
  "savedIds": ["uuid1", "uuid2", "uuid3"]
}
```

## 🛠️ トラブルシューティング

### 1. アップロードエラー
- Storage bucketが作成されているか確認
- RLSポリシーが正しく設定されているか確認
- ファイルサイズ制限（10MB）を確認

### 2. Claude API エラー
- `ANTHROPIC_API_KEY`が正しく設定されているか確認
- APIクォータが残っているか確認
- ネットワーク接続を確認

### 3. データベース保存エラー
- `training_examples`テーブルが存在するか確認
- RLSポリシーで`INSERT`権限があるか確認
- ユーザー認証が正常に行われているか確認

## 📈 今後の拡張

1. **管理者画面**: 教師データの承認・管理機能
2. **ベクトル検索**: pgvector拡張による類似度検索
3. **バッチ処理**: 大量画像の非同期処理
4. **統計ダッシュボード**: 収集状況の可視化

## 🔐 セキュリティ考慮事項

- RLSポリシーによる適切なアクセス制御
- ファイルタイプとサイズの検証
- 1日のアップロード制限
- 管理者承認によるデータ品質管理
- 機密情報アップロード防止の注意喚起

システムが正常に動作することを確認後、本格運用を開始してください。