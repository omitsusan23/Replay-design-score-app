#!/usr/bin/env python3
"""
Instructor-XL + Transformers 埋め込み処理スクリプト
OpenAI text-embedding-3-small からの移行用
"""

import torch
from sentence_transformers import SentenceTransformer
import psycopg2
import numpy as np
from typing import List, Dict, Any, Optional
import json
import logging
from datetime import datetime
import os
from dataclasses import dataclass

@dataclass
class EmbeddingConfig:
    model_name: str = "hkunlp/instructor-xl"
    max_length: int = 512  # Instructor-XLの推奨最大長
    batch_size: int = 8
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    
@dataclass
class DatabaseConfig:
    host: str = "localhost"
    port: int = 5432
    database: str = "postgres"
    user: str = "postgres"
    password: str = ""  # 環境変数から取得推奨

class InstructorXLEmbedder:
    """Instructor-XL埋め込み生成クラス"""
    
    def __init__(self, config: EmbeddingConfig):
        self.config = config
        self.logger = self._setup_logger()
        self.model = self._load_model()
        
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("instructor_xl_embedder")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def _load_model(self) -> SentenceTransformer:
        """Instructor-XLモデルの読み込み"""
        self.logger.info(f"🧠 Loading Instructor-XL model: {self.config.model_name}")
        
        try:
            model = SentenceTransformer(self.config.model_name)
            model = model.to(self.config.device)
            
            self.logger.info(f"✅ Model loaded on device: {self.config.device}")
            return model
            
        except Exception as e:
            self.logger.error(f"❌ Model loading failed: {e}")
            raise
    
    def _chunk_text(self, text: str, max_length: int = None) -> List[str]:
        """長文テキストを適切な長さにチャンク分割"""
        if max_length is None:
            max_length = self.config.max_length
            
        # 文区切りでの分割を優先
        sentences = text.split('。')
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # チャンク長制限チェック
            if len(current_chunk + sentence + '。') <= max_length:
                current_chunk += sentence + '。'
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + '。'
        
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        return chunks if chunks else [text[:max_length]]
    
    def generate_embeddings(
        self, 
        texts: List[str], 
        instruction: str = "Represent the UI component for retrieval"
    ) -> List[np.ndarray]:
        """Instructor-XLで埋め込み生成（instruction付き）"""
        
        # Instructionを追加したテキスト形式に変換
        instructed_texts = []
        for text in texts:
            # 長文の場合はチャンク分割
            chunks = self._chunk_text(text)
            for chunk in chunks:
                instructed_texts.append([instruction, chunk])
        
        self.logger.info(f"🔢 Generating embeddings for {len(instructed_texts)} text chunks")
        
        try:
            embeddings = self.model.encode(
                instructed_texts,
                batch_size=self.config.batch_size,
                show_progress_bar=True,
                convert_to_numpy=True
            )
            
            # チャンクが複数の場合は平均化
            if len(instructed_texts) > len(texts):
                # 複数チャンクを平均化して元のテキスト数に合わせる
                result_embeddings = []
                chunks_per_text = len(instructed_texts) // len(texts)
                
                for i in range(len(texts)):
                    start_idx = i * chunks_per_text
                    end_idx = (i + 1) * chunks_per_text
                    chunk_embeddings = embeddings[start_idx:end_idx]
                    averaged_embedding = np.mean(chunk_embeddings, axis=0)
                    result_embeddings.append(averaged_embedding)
                    
                embeddings = np.array(result_embeddings)
            
            self.logger.info(f"✅ Generated embeddings with shape: {embeddings.shape}")
            return embeddings.tolist()
            
        except Exception as e:
            self.logger.error(f"❌ Embedding generation failed: {e}")
            raise

class RAGDocumentProcessor:
    """RAGドキュメント処理・保存クラス"""
    
    def __init__(self, db_config: DatabaseConfig, embedder: InstructorXLEmbedder):
        self.db_config = db_config
        self.embedder = embedder
        self.logger = embedder.logger
        
    def get_db_connection(self):
        """PostgreSQL接続"""
        try:
            conn = psycopg2.connect(
                host=self.db_config.host,
                port=self.db_config.port,
                database=self.db_config.database,
                user=self.db_config.user,
                password=self.db_config.password
            )
            return conn
        except Exception as e:
            self.logger.error(f"❌ Database connection failed: {e}")
            raise
    
    def process_document(
        self, 
        title: str,
        ui_type: str,
        description: str,
        content: str,
        keywords: List[str] = None,
        source_url: str = None,
        paste_context: Dict[str, Any] = None,
        claude_evaluation: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """単一ドキュメントの処理と埋め込み生成"""
        
        self.logger.info(f"📋 Processing document: {title}")
        
        # 3種類のテキスト準備
        main_text = f"{title} {description} {' '.join(keywords or [])}"
        content_text = content
        title_text = title
        
        # 各タイプ別のinstruction
        instructions = {
            "main": "Represent the UI component description for semantic search",
            "content": "Represent the UI component code/markup for technical retrieval", 
            "title": "Represent the UI component title for quick identification"
        }
        
        try:
            # 埋め込み生成
            main_embedding = self.embedder.generate_embeddings(
                [main_text], instructions["main"]
            )[0]
            
            content_embedding = self.embedder.generate_embeddings(
                [content_text], instructions["content"]  
            )[0]
            
            title_embedding = self.embedder.generate_embeddings(
                [title_text], instructions["title"]
            )[0]
            
            # Claude評価のデフォルト値
            if claude_evaluation is None:
                claude_evaluation = {
                    "consistency_score": 0.8,
                    "quality": {
                        "reusability": "中",
                        "maintainability": "中",
                        "accessibility": "中"
                    },
                    "improvements": [],
                    "ui_classification": {
                        "primary_type": ui_type,
                        "secondary_types": []
                    }
                }
            
            return {
                "title": title,
                "ui_type": ui_type,
                "description": description,
                "copied_content": content,
                "keywords": keywords or [],
                "source_url": source_url,
                "paste_context": paste_context or {},
                "claude_evaluation": claude_evaluation,
                "evaluation_score": claude_evaluation.get("consistency_score", 0.8),
                "improvement_notes": claude_evaluation.get("improvements", []),
                "embedding": main_embedding,
                "content_embedding": content_embedding,
                "title_embedding": title_embedding,
                "embedding_model": "instructor-xl",
                "embedding_generated_at": datetime.now().isoformat(),
                "is_approved": True
            }
            
        except Exception as e:
            self.logger.error(f"❌ Document processing failed for '{title}': {e}")
            raise
    
    def save_to_database(self, document_data: Dict[str, Any]) -> str:
        """データベースへの保存"""
        
        insert_query = """
        INSERT INTO rag_documents_instructor (
            title, ui_type, description, copied_content, keywords, source_url,
            paste_context, claude_evaluation, evaluation_score, improvement_notes,
            embedding, content_embedding, title_embedding,
            embedding_model, embedding_generated_at, is_approved
        ) VALUES (
            %(title)s, %(ui_type)s, %(description)s, %(copied_content)s, 
            %(keywords)s, %(source_url)s, %(paste_context)s,
            %(claude_evaluation)s, %(evaluation_score)s, %(improvement_notes)s,
            %(embedding)s, %(content_embedding)s, %(title_embedding)s,
            %(embedding_model)s, %(embedding_generated_at)s, %(is_approved)s
        ) RETURNING id;
        """
        
        try:
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    # JOSNBデータの準備
                    save_data = document_data.copy()
                    save_data['paste_context'] = json.dumps(save_data['paste_context'])
                    save_data['claude_evaluation'] = json.dumps(save_data['claude_evaluation'])
                    
                    cur.execute(insert_query, save_data)
                    doc_id = cur.fetchone()[0]
                    conn.commit()
                    
            self.logger.info(f"✅ Document saved with ID: {doc_id}")
            return doc_id
            
        except Exception as e:
            self.logger.error(f"❌ Database save failed: {e}")
            raise

class RAGQuerySearcher:
    """RAGクエリ検索クラス"""
    
    def __init__(self, db_config: DatabaseConfig, embedder: InstructorXLEmbedder):
        self.db_config = db_config
        self.embedder = embedder
        self.logger = embedder.logger
    
    def get_db_connection(self):
        """PostgreSQL接続"""
        try:
            conn = psycopg2.connect(
                host=self.db_config.host,
                port=self.db_config.port,
                database=self.db_config.database,
                user=self.db_config.user,
                password=self.db_config.password
            )
            return conn
        except Exception as e:
            self.logger.error(f"❌ Database connection failed: {e}")
            raise
    
    def search_similar_documents(
        self,
        query: str,
        limit: int = 5,
        min_similarity: float = 0.7
    ) -> List[Dict[str, Any]]:
        """類似度検索"""
        
        self.logger.info(f"🔍 Searching for: '{query}'")
        
        try:
            # クエリの埋め込み生成
            query_embedding = self.embedder.generate_embeddings(
                [query], 
                "Represent the search query for finding relevant UI components"
            )[0]
            
            # データベース検索
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    search_query = """
                    SELECT * FROM search_rag_instructor(%s, %s, %s);
                    """
                    
                    cur.execute(search_query, (query_embedding, limit, min_similarity))
                    results = cur.fetchall()
                    
                    # 結果の整形
                    columns = [desc[0] for desc in cur.description]
                    search_results = []
                    
                    for row in results:
                        result_dict = dict(zip(columns, row))
                        search_results.append(result_dict)
            
            self.logger.info(f"🎯 Found {len(search_results)} similar documents")
            return search_results
            
        except Exception as e:
            self.logger.error(f"❌ Search failed: {e}")
            raise
    
    def format_for_claude(
        self,
        search_results: List[Dict[str, Any]],
        original_query: str
    ) -> Dict[str, str]:
        """Claude向けプロンプト整形"""
        
        system_prompt = """あなたはUI/UXの専門家です。以下の検索結果を基に、ユーザーの質問に答えてください。

検索されたUIコンポーネント:"""
        
        user_prompt = f"質問: {original_query}\n\n参考情報:\n"
        
        for i, result in enumerate(search_results, 1):
            system_prompt += f"""

{i}. {result['title']} (類似度: {result['similarity']:.2f})
   - UIタイプ: {result['ui_type']}
   - 説明: {result['description']}
   - 評価スコア: {result['evaluation_score']:.2f}
"""
            
            if result.get('claude_evaluation'):
                eval_data = json.loads(result['claude_evaluation']) if isinstance(result['claude_evaluation'], str) else result['claude_evaluation']
                improvements = eval_data.get('improvements', [])
                if improvements:
                    system_prompt += f"   - 改善提案: {', '.join(improvements)}\n"
        
        user_prompt += "\n上記の情報を参考に、質問に対する具体的で実用的な回答をお願いします。"
        
        return {
            "system": system_prompt,
            "user": user_prompt
        }

# 使用例とテスト
def main():
    """メイン処理とテスト"""
    
    # 設定
    embedding_config = EmbeddingConfig()
    db_config = DatabaseConfig(
        password=os.getenv("POSTGRES_PASSWORD", "your_password")
    )
    
    # 初期化
    embedder = InstructorXLEmbedder(embedding_config)
    processor = RAGDocumentProcessor(db_config, embedder)
    searcher = RAGQuerySearcher(db_config, embedder)
    
    # サンプルドキュメント
    sample_docs = [
        {
            "title": "Bootstrap Card Component",
            "ui_type": "card",
            "description": "レスポンシブなカードコンポーネント。画像、テキスト、アクションボタンを含む",
            "content": """<div class="card" style="width: 18rem;">
                <img src="..." class="card-img-top" alt="...">
                <div class="card-body">
                    <h5 class="card-title">Card title</h5>
                    <p class="card-text">Some quick example text</p>
                    <a href="#" class="btn btn-primary">Go somewhere</a>
                </div>
            </div>""",
            "keywords": ["Bootstrap", "カード", "レスポンシブ", "コンポーネント"],
            "source_url": "https://getbootstrap.com/docs/5.0/components/card/"
        },
        {
            "title": "Material-UI Navigation Drawer",
            "ui_type": "navigation",
            "description": "サイドナビゲーション用のドロワーコンポーネント",
            "content": """<Drawer
                variant="temporary"
                anchor="left"
                open={open}
                onClose={handleClose}
            >
                <List>
                    <ListItem button>
                        <ListItemText primary="Home" />
                    </ListItem>
                    <ListItem button>
                        <ListItemText primary="Profile" />
                    </ListItem>
                </List>
            </Drawer>""",
            "keywords": ["Material-UI", "ナビゲーション", "ドロワー", "React"],
            "source_url": "https://mui.com/components/drawers/"
        }
    ]
    
    print("🚀 Instructor-XL RAG システム テスト開始")
    
    # ドキュメント処理・保存
    print("\n📋 ドキュメント処理中...")
    for doc in sample_docs:
        try:
            processed_doc = processor.process_document(**doc)
            doc_id = processor.save_to_database(processed_doc)
            print(f"✅ Successfully processed: {doc['title']} (ID: {doc_id})")
            
        except Exception as e:
            print(f"❌ Failed to process: {doc['title']} - {e}")
    
    # 検索テスト
    print("\n🔍 検索テスト中...")
    test_queries = [
        "カードコンポーネントの実装方法",
        "ナビゲーションメニューの作り方",
        "レスポンシブなUIコンポーネント"
    ]
    
    for query in test_queries:
        try:
            results = searcher.search_similar_documents(query, limit=3)
            claude_prompt = searcher.format_for_claude(results, query)
            
            print(f"\n📝 Query: {query}")
            print(f"🎯 Found {len(results)} results")
            
            if results:
                print("Claude用プロンプト:")
                print(f"System: {claude_prompt['system'][:200]}...")
                print(f"User: {claude_prompt['user'][:100]}...")
            
        except Exception as e:
            print(f"❌ Search failed for '{query}': {e}")

if __name__ == "__main__":
    main()