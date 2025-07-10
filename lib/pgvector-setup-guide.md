# pgvector拡張セットアップガイド

将来のベクトル検索機能を有効にするための手順です。

## Supabaseでのpgvector有効化

### 1. Supabase Dashboardから有効化
1. Supabase Dashboard → Database → Extensions
2. `vector`を検索して有効化
3. または、SQL EditorでCLIから実行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. embeddingカラムの追加

```sql
-- training_examplesテーブルにembeddingカラムを追加
ALTER TABLE training_examples 
ADD COLUMN embedding VECTOR(1536);

-- ベクトル検索用インデックス作成
CREATE INDEX idx_training_examples_embedding 
ON training_examples USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

### 3. OpenAI APIでのembedding生成例

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text
  });
  
  return response.data[0].embedding;
}

// 使用例
const structureText = `${structureNote} ${reviewText}`;
const embedding = await generateEmbedding(structureText);

// Supabaseに保存
await supabase
  .from('training_examples')
  .update({ embedding })
  .eq('id', exampleId);
```

### 4. ベクトル類似度検索

```sql
-- コサイン類似度による検索
SELECT *, 
       1 - (embedding <=> $1::vector) AS similarity
FROM training_examples 
WHERE is_approved = TRUE 
AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector 
LIMIT 3;
```

### 5. TypeScript型の更新

```typescript
// types/rag-database.ts
export interface TrainingExample {
  // ... 既存フィールド
  embedding?: number[]; // pgvector有効化後にオプショナルから必須に変更
}
```

## 注意事項

- **現在**: キーワード検索と全文検索のみ利用可能
- **pgvector有効化後**: ベクトル検索も利用可能
- embeddingの生成にはOpenAI APIの費用が発生します
- ベクトル検索は高精度ですが、キーワード検索との併用を推奨