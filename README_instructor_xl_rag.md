# Instructor-XL RAGシステム

OpenAI text-embedding-3-small（1536次元）から **Instructor-XL（4096次元）** へのローカル埋め込み処理による高精度RAGシステムです。

## 🎯 主な特徴

- **ローカル処理**: Instructor-XLによる4096次元ベクトル埋め込み
- **高精度検索**: pgvectorによるcosine類似度検索
- **Claude統合**: 検索結果から最適化されたプロンプト自動生成
- **多様な検索**: 単一クエリ、複数クエリ、カテゴリ検索に対応
- **UIコンポーネント特化**: UI/UX設計に特化した検索・分析

## 📁 ファイル構成

```
├── instructor_xl_schema.sql          # PostgreSQL スキーマ（4096次元対応）
├── instructor_xl_embeddings.py       # 埋め込み処理・検索コアモジュール
├── document_importer.py              # ドキュメント一括インポート
├── rag_search_client.py              # 高度な検索クライアント
├── claude_rag_integration.py         # Claude統合システム
├── requirements_instructor_xl.txt    # Python依存関係
└── README_instructor_xl_rag.md       # このファイル
```

## 🚀 セットアップ

### 1. Python環境セットアップ

```bash
# 仮想環境作成（推奨）
python -m venv venv_instructor_xl
source venv_instructor_xl/bin/activate  # Linux/Mac
# venv_instructor_xl\Scripts\activate   # Windows

# 依存関係インストール
pip install -r requirements_instructor_xl.txt
```

### 2. PostgreSQL + pgvector セットアップ

```bash
# Dockerでの起動例
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# スキーマ作成
psql -h localhost -p 5432 -U postgres -d postgres -f instructor_xl_schema.sql
```

### 3. 環境変数設定

```bash
export POSTGRES_PASSWORD="your_password"
export CLAUDE_API_KEY="your_claude_api_key"  # Claude統合使用時
```

## 📖 使用方法

### 基本的な埋め込み処理

```python
from instructor_xl_embeddings import *

# 設定
config = EmbeddingConfig()
db_config = DatabaseConfig(password="your_password")

# 初期化
embedder = InstructorXLEmbedder(config)
processor = RAGDocumentProcessor(db_config, embedder)

# ドキュメント処理
doc_data = processor.process_document(
    title="Bootstrap Card Component",
    ui_type="card",
    description="レスポンシブなカードコンポーネント",
    content="<div class='card'>...</div>",
    keywords=["bootstrap", "card", "responsive"]
)

# データベース保存
doc_id = processor.save_to_database(doc_data)
```

### ドキュメント一括インポート

```bash
# UIライブラリからインポート
python document_importer.py --source library --library bootstrap --db-password your_password

# Markdownファイルからインポート
python document_importer.py --source markdown --path ./docs --db-password your_password

# JSONファイルからインポート
python document_importer.py --source json --path ./data.json --db-password your_password
```

### 検索クライアント

```bash
# 基本検索
python rag_search_client.py "レスポンシブなナビゲーション" --limit 5 --db-password your_password

# フィルタ付き検索
python rag_search_client.py "カードコンポーネント" --ui-types card --min-score 0.7 --db-password your_password

# Claude用プロンプト生成
python rag_search_client.py "フォームバリデーション" --claude-prompt --db-password your_password

# 結果をファイル出力
python rag_search_client.py "ボタンデザイン" --output results.json --db-password your_password
```

### Claude統合システム

```bash
# インタラクティブモード
python claude_rag_integration.py --interactive --db-password your_password

# 直接クエリ（プロンプト生成のみ）
python claude_rag_integration.py --query "TypeScriptでモーダルダイアログを実装したい" --db-password your_password

# Claude API呼び出し付き
python claude_rag_integration.py \
  --query "アクセシブルなデータテーブルの作り方" \
  --call-claude \
  --claude-api-key your_api_key \
  --db-password your_password \
  --tech-stack "React, TypeScript, Tailwind CSS"
```

## 🧩 コード例

### カスタム検索処理

```python
from rag_search_client import AdvancedRAGSearcher
from instructor_xl_embeddings import *

# 初期化
embedder = InstructorXLEmbedder(EmbeddingConfig())
searcher = RAGQuerySearcher(DatabaseConfig(), embedder)
advanced = AdvancedRAGSearcher(searcher)

# カテゴリ検索
results = advanced.semantic_category_search("navigation", limit=5)

# 複数クエリ検索
results = advanced.multi_query_search([
    "レスポンシブ ナビゲーション",
    "モバイル メニュー",
    "ハンバーガーメニュー"
], aggregation="weighted")

# 類似コンポーネント検索
similar = advanced.find_similar_components(doc_id, limit=3)
```

### Claude用プロンプト生成

```python
from claude_rag_integration import ClaudeRAGIntegration

integration = ClaudeRAGIntegration(advanced_searcher)

# プロンプト生成
prompt_data = integration.generate_comprehensive_prompt(
    user_query="Reactでアクセシブルなフォームを作りたい",
    context={
        "tech_stack": "React, TypeScript, Chakra UI",
        "target_device": "デスクトップ・モバイル対応"
    }
)

print("System:", prompt_data["system"])
print("User:", prompt_data["user"])
```

## 🎓 学習のポイント

### なぜInstructor-XLを選択？

1. **高次元表現**: 4096次元による詳細な意味理解
2. **instruction-tuning**: タスク特化の埋め込み生成
3. **ローカル処理**: API依存なし、コスト削減
4. **日本語対応**: 多言語モデルによる自然な処理

### アーキテクチャの優位性

- **分離設計**: 埋め込み・検索・プロンプト生成が独立
- **拡張性**: 新しいUIライブラリやフレームワークに対応
- **パフォーマンス**: pgvectorによる高速ベクトル検索
- **品質管理**: Claude評価スコアによる結果フィルタリング

## ⚠️ 注意事項

### システム要件

- **GPU推奨**: Instructor-XLモデル読み込み用（CPU可能だが低速）
- **メモリ**: 最低8GB、推奨16GB以上
- **ストレージ**: モデルファイル用に約5GB

### パフォーマンス考慮

```python
# バッチ処理での高速化
config = EmbeddingConfig(
    batch_size=16,  # GPU環境では増加可能
    device="cuda"   # GPU使用
)

# 長文のチャンク分割
def process_long_document(content):
    chunks = chunk_text(content, max_length=512)
    embeddings = []
    for chunk in chunks:
        emb = embedder.generate_embeddings([chunk])
        embeddings.extend(emb)
    return np.mean(embeddings, axis=0)  # 平均化
```

## 🔧 トラブルシューティング

### 一般的な問題

1. **モデル読み込みエラー**
   ```bash
   # Hugging Face キャッシュクリア
   rm -rf ~/.cache/huggingface/
   ```

2. **PostgreSQL接続エラー**
   ```bash
   # 接続確認
   pg_isready -h localhost -p 5432
   ```

3. **GPU認識されない**
   ```python
   import torch
   print(torch.cuda.is_available())  # True であることを確認
   ```

### パフォーマンス最適化

- **インデックス調整**: pgvectorのlistsパラメータ調整
- **バッチサイズ**: GPU メモリに応じて調整
- **並列処理**: multiprocessingによる高速化

## 📊 移行ガイド

### 旧OpenAI embeddingからの移行

1. **データバックアップ**
   ```sql
   CREATE TABLE rag_documents_backup AS SELECT * FROM rag_documents;
   ```

2. **新スキーマ適用**
   ```bash
   psql -f instructor_xl_schema.sql
   ```

3. **データ再処理**
   ```python
   # 既存データの再埋め込み処理
   python document_importer.py --source migration --db-password your_password
   ```

### 検証・テスト

```bash
# システム全体テスト
python instructor_xl_embeddings.py  # 基本機能テスト
python -c "from instructor_xl_embeddings import *; print('✅ Import OK')"
```

## 🚀 今後の拡張

- **多言語対応**: 英語・中国語等の言語別モデル
- **ファインチューニング**: ドメイン特化の性能向上
- **リアルタイム更新**: 増分学習による動的更新
- **可視化ダッシュボード**: 検索結果の可視化UI

---

**開発・運用での疑問や改善提案があれば、ぜひフィードバックをお願いします！** 🙌