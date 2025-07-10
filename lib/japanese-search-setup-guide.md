# 日本語全文検索セットアップガイド

より高精度な日本語検索を有効にするための手順です。

## 現在の状況

- **使用中**: `simple` テキスト検索設定（基本的な単語分割）
- **推奨**: `japanese` テキスト検索設定（日本語に最適化）

## Supabaseでの日本語検索有効化

### 1. 利用可能な検索設定を確認

```sql
-- 利用可能なテキスト検索設定を確認
SELECT cfgname FROM pg_ts_config;
```

### 2. 日本語設定が利用可能な場合

```sql
-- インデックスを日本語設定で再作成
DROP INDEX IF EXISTS idx_training_examples_text_search;

CREATE INDEX idx_training_examples_text_search 
ON training_examples USING GIN(to_tsvector('japanese', structure_note || ' ' || review_text));
```

### 3. 検索クエリも日本語設定に更新

```sql
-- 日本語設定での全文検索
SELECT *, 
       ts_rank(to_tsvector('japanese', structure_note || ' ' || review_text), 
               plainto_tsquery('japanese', $1)) AS rank
FROM training_examples 
WHERE is_approved = TRUE 
AND to_tsvector('japanese', structure_note || ' ' || review_text) @@ plainto_tsquery('japanese', $1)
ORDER BY rank DESC, total_score DESC 
LIMIT $2;
```

### 4. TypeScriptコードでの動的対応

```typescript
// services/rag-search.service.ts での改良版
export class RAGSearchService {
  private textSearchConfig: string = 'simple';

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.detectTextSearchConfig();
  }

  private async detectTextSearchConfig() {
    try {
      const { data } = await this.supabase.rpc('check_japanese_config');
      this.textSearchConfig = data ? 'japanese' : 'simple';
    } catch {
      this.textSearchConfig = 'simple';
    }
  }

  async searchByFullText(searchText: string, ui_type?: string, limit: number = 3) {
    const query = `
      SELECT *, 
             ts_rank(to_tsvector('${this.textSearchConfig}', structure_note || ' ' || review_text), 
                     plainto_tsquery('${this.textSearchConfig}', $1)) AS rank
      FROM training_examples 
      WHERE is_approved = TRUE 
      AND to_tsvector('${this.textSearchConfig}', structure_note || ' ' || review_text) 
          @@ plainto_tsquery('${this.textSearchConfig}', $1)
      ${ui_type ? `AND ui_type = '${ui_type}'` : ''}
      ORDER BY rank DESC, total_score DESC 
      LIMIT ${limit};
    `;
    
    // クエリ実行...
  }
}
```

### 5. Supabase関数の作成（検索設定チェック用）

```sql
-- 日本語設定が利用可能かチェックする関数
CREATE OR REPLACE FUNCTION check_japanese_config()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'japanese'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 検索品質の比較

### Simple設定（現在）
- 基本的な単語分割
- 日本語の語幹処理なし
- 英数字とスペース区切りの単語検索

### Japanese設定（推奨）
- 日本語形態素解析
- ひらがな・カタカナ・漢字の適切な処理
- 語幹の正規化（「走る」「走り」「走って」→「走」）

## 代替案：キーワード検索の強化

日本語設定が利用できない場合の代替手段：

```sql
-- ILIKE による部分一致検索（現在も利用中）
SELECT * FROM training_examples 
WHERE is_approved = TRUE 
AND (
  structure_note ILIKE '%' || $1 || '%' 
  OR review_text ILIKE '%' || $1 || '%'
  OR $1 = ANY(tags)
)
ORDER BY total_score DESC 
LIMIT $2;
```

現在の`simple`設定でも基本的な検索は十分機能します。