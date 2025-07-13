#!/usr/bin/env python3
"""
OpenAI text-embedding-3-large (3072次元) 対応埋め込みシステム
Claude API出力のベクトル化とSupabase連携
"""

import os
import openai
import psycopg2
import numpy as np
from typing import List, Dict, Any, Optional
import json
import logging
from datetime import datetime
from dataclasses import dataclass

@dataclass
class OpenAIEmbeddingConfig:
    """OpenAI Embedding設定"""
    model_name: str = "text-embedding-3-large"
    embedding_dimensions: int = 3072
    max_tokens: int = 8192  # text-embedding-3-large の最大トークン数
    batch_size: int = 100   # API制限に応じて調整
    api_key: str = ""

@dataclass
class DatabaseConfig:
    """データベース設定"""
    host: str = "localhost"
    port: int = 5432
    database: str = "postgres"
    user: str = "postgres"
    password: str = ""

class OpenAIEmbeddingProcessor:
    """OpenAI Embedding処理クラス"""
    
    def __init__(self, config: OpenAIEmbeddingConfig):
        self.config = config
        self.logger = self._setup_logger()
        self.client = self._setup_openai_client()
        
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("openai_embedding_processor")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def _setup_openai_client(self):
        """OpenAI クライアント設定"""
        api_key = self.config.api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key is required")
        
        openai.api_key = api_key
        self.logger.info(f"✅ OpenAI client initialized with model: {self.config.model_name}")
        return openai
    
    def generate_embeddings(
        self, 
        texts: List[str],
        user_id: Optional[str] = None
    ) -> List[List[float]]:
        """テキストリストの埋め込み生成"""
        
        if not texts:
            return []
        
        self.logger.info(f"🔢 Generating {self.config.embedding_dimensions}D embeddings for {len(texts)} texts")
        
        try:
            # バッチ処理
            all_embeddings = []
            
            for i in range(0, len(texts), self.config.batch_size):
                batch_texts = texts[i:i + self.config.batch_size]
                
                self.logger.info(f"  Processing batch {i//self.config.batch_size + 1}/{(len(texts)-1)//self.config.batch_size + 1}")
                
                response = openai.Embedding.create(
                    model=self.config.model_name,
                    input=batch_texts,
                    encoding_format="float",
                    user=user_id  # ユーザートラッキング用
                )
                
                batch_embeddings = [item['embedding'] for item in response['data']]
                all_embeddings.extend(batch_embeddings)
                
                # レート制限対策
                if len(texts) > self.config.batch_size:
                    import time
                    time.sleep(0.1)
            
            # 次元数検証
            if all_embeddings and len(all_embeddings[0]) != self.config.embedding_dimensions:
                raise ValueError(
                    f"Expected {self.config.embedding_dimensions} dimensions, "
                    f"got {len(all_embeddings[0])}"
                )
            
            self.logger.info(f"✅ Generated {len(all_embeddings)} embeddings successfully")
            return all_embeddings
            
        except Exception as e:
            self.logger.error(f"❌ Embedding generation failed: {e}")
            raise
    
    def generate_single_embedding(self, text: str, user_id: Optional[str] = None) -> List[float]:
        """単一テキストの埋め込み生成"""
        embeddings = self.generate_embeddings([text], user_id)
        return embeddings[0] if embeddings else []

class DesignEmbeddingManager:
    """design_embeddings テーブル管理クラス"""
    
    def __init__(self, db_config: DatabaseConfig, embedding_processor: OpenAIEmbeddingProcessor):
        self.db_config = db_config
        self.embedding_processor = embedding_processor
        self.logger = embedding_processor.logger
        
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
    
    def save_design_embedding(
        self,
        example_id: str,
        text_content: str,
        embedding_type: str = "claude_output",
        metadata: Dict[str, Any] = None
    ) -> str:
        """design_embeddingsテーブルにデータ保存"""
        
        try:
            # 埋め込み生成
            embedding = self.embedding_processor.generate_single_embedding(text_content)
            
            # データベース保存
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    insert_query = """
                    INSERT INTO design_embeddings (
                        example_id, embedding, embedding_type, text_content, 
                        model_name, embedding_dimensions, metadata, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s
                    ) RETURNING id;
                    """
                    
                    cur.execute(insert_query, (
                        example_id,
                        embedding,  # vector型として保存
                        embedding_type,
                        text_content,
                        self.embedding_processor.config.model_name,
                        self.embedding_processor.config.embedding_dimensions,
                        json.dumps(metadata or {}),
                        datetime.now()
                    ))
                    
                    embedding_id = cur.fetchone()[0]
                    conn.commit()
            
            self.logger.info(f"✅ Design embedding saved with ID: {embedding_id}")
            return embedding_id
            
        except Exception as e:
            self.logger.error(f"❌ Failed to save design embedding: {e}")
            raise
    
    def search_similar_embeddings(
        self,
        query_text: str,
        limit: int = 5,
        similarity_threshold: float = 0.7,
        example_id_filter: List[str] = None
    ) -> List[Dict[str, Any]]:
        """類似埋め込み検索"""
        
        try:
            # クエリの埋め込み生成
            query_embedding = self.embedding_processor.generate_single_embedding(query_text)
            
            # 類似度検索
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    base_query = """
                    SELECT 
                        de.id,
                        de.example_id,
                        de.embedding_type,
                        de.text_content,
                        de.metadata,
                        de.created_at,
                        (1 - (de.embedding <=> %s))::float AS similarity
                    FROM design_embeddings de
                    WHERE (1 - (de.embedding <=> %s)) > %s
                    """
                    
                    params = [query_embedding, query_embedding, similarity_threshold]
                    
                    # フィルター条件追加
                    if example_id_filter:
                        placeholders = ','.join(['%s'] * len(example_id_filter))
                        base_query += f" AND de.example_id IN ({placeholders})"
                        params.extend(example_id_filter)
                    
                    base_query += " ORDER BY similarity DESC LIMIT %s"
                    params.append(limit)
                    
                    cur.execute(base_query, params)
                    results = cur.fetchall()
                    
                    # 結果の整形
                    columns = [desc[0] for desc in cur.description]
                    search_results = []
                    
                    for row in results:
                        result_dict = dict(zip(columns, row))
                        
                        # metadata の JSON パース
                        if result_dict.get('metadata'):
                            try:
                                result_dict['metadata'] = json.loads(result_dict['metadata'])
                            except json.JSONDecodeError:
                                result_dict['metadata'] = {}
                        
                        search_results.append(result_dict)
            
            self.logger.info(f"🔍 Found {len(search_results)} similar embeddings")
            return search_results
            
        except Exception as e:
            self.logger.error(f"❌ Similar embedding search failed: {e}")
            raise

class ClaudeOutputProcessor:
    """Claude API出力処理クラス"""
    
    def __init__(self, embedding_manager: DesignEmbeddingManager):
        self.embedding_manager = embedding_manager
        self.logger = embedding_manager.logger
    
    def process_claude_response(
        self,
        claude_response: Dict[str, Any],
        figma_url: str,
        example_id: str
    ) -> Dict[str, Any]:
        """Claude API レスポンスの処理とベクトル化"""
        
        self.logger.info(f"📝 Processing Claude response for example_id: {example_id}")
        
        try:
            # Claude出力から主要テキストを抽出
            main_content = self._extract_main_content(claude_response)
            
            # 分類結果とスコアを抽出
            genre_classification = self._extract_genre(claude_response)
            design_scores = self._extract_scores(claude_response)
            
            # メタデータ構築
            metadata = {
                "figma_url": figma_url,
                "genre": genre_classification,
                "scores": design_scores,
                "processing_timestamp": datetime.now().isoformat(),
                "original_response": claude_response
            }
            
            # 各種テキストのベクトル化
            embeddings_created = []
            
            # 1. メイン出力のベクトル化
            main_embedding_id = self.embedding_manager.save_design_embedding(
                example_id=example_id,
                text_content=main_content,
                embedding_type="claude_main_output",
                metadata=metadata
            )
            embeddings_created.append(("main_output", main_embedding_id))
            
            # 2. ジャンル分類のベクトル化
            if genre_classification:
                genre_embedding_id = self.embedding_manager.save_design_embedding(
                    example_id=example_id,
                    text_content=f"UI genre: {genre_classification}",
                    embedding_type="genre_classification",
                    metadata={"genre": genre_classification, "figma_url": figma_url}
                )
                embeddings_created.append(("genre", genre_embedding_id))
            
            # 3. スコア詳細のベクトル化
            if design_scores:
                scores_text = self._format_scores_as_text(design_scores)
                scores_embedding_id = self.embedding_manager.save_design_embedding(
                    example_id=example_id,
                    text_content=scores_text,
                    embedding_type="design_scores",
                    metadata={"scores": design_scores, "figma_url": figma_url}
                )
                embeddings_created.append(("scores", scores_embedding_id))
            
            result = {
                "example_id": example_id,
                "figma_url": figma_url,
                "genre": genre_classification,
                "design_scores": design_scores,
                "embeddings_created": embeddings_created,
                "main_content": main_content,
                "metadata": metadata
            }
            
            self.logger.info(f"✅ Created {len(embeddings_created)} embeddings for example {example_id}")
            return result
            
        except Exception as e:
            self.logger.error(f"❌ Failed to process Claude response: {e}")
            raise
    
    def _extract_main_content(self, claude_response: Dict[str, Any]) -> str:
        """Claude レスポンスからメインコンテンツを抽出"""
        
        # Claude API の一般的な応答形式に対応
        if 'content' in claude_response:
            if isinstance(claude_response['content'], list):
                # Claude 新形式
                text_parts = []
                for content_block in claude_response['content']:
                    if content_block.get('type') == 'text':
                        text_parts.append(content_block.get('text', ''))
                return '\n'.join(text_parts)
            else:
                # シンプルな文字列形式
                return str(claude_response['content'])
        
        # その他の形式
        return str(claude_response.get('text', str(claude_response)))
    
    def _extract_genre(self, claude_response: Dict[str, Any]) -> Optional[str]:
        """ジャンル分類の抽出"""
        
        content = self._extract_main_content(claude_response)
        
        # よくあるジャンル分類パターンを検索
        genre_patterns = {
            "チャットUI": ["chat", "message", "チャット", "メッセージ"],
            "予約画面": ["booking", "reservation", "予約", "アポイント"],
            "ダッシュボード": ["dashboard", "analytics", "ダッシュボード", "分析"],
            "フォーム": ["form", "input", "フォーム", "入力"],
            "ナビゲーション": ["navigation", "menu", "nav", "ナビ", "メニュー"],
            "カード": ["card", "item", "カード", "アイテム"],
            "モーダル": ["modal", "dialog", "popup", "モーダル", "ダイアログ"],
            "リスト": ["list", "table", "grid", "リスト", "テーブル"],
        }
        
        content_lower = content.lower()
        
        for genre, keywords in genre_patterns.items():
            if any(keyword in content_lower for keyword in keywords):
                return genre
        
        return "その他"
    
    def _extract_scores(self, claude_response: Dict[str, Any]) -> Dict[str, float]:
        """デザインスコアの抽出"""
        
        content = self._extract_main_content(claude_response)
        scores = {}
        
        # スコア抽出パターン（正規表現ベース）
        import re
        
        score_patterns = {
            "配色": [r"配色[：:]\s*([0-9.]+)", r"color[：:]\s*([0-9.]+)"],
            "一貫性": [r"一貫性[：:]\s*([0-9.]+)", r"consistency[：:]\s*([0-9.]+)"],
            "ヒエラルキー": [r"ヒエラルキー[：:]\s*([0-9.]+)", r"hierarchy[：:]\s*([0-9.]+)"],
            "ユーザビリティ": [r"ユーザビリティ[：:]\s*([0-9.]+)", r"usability[：:]\s*([0-9.]+)"],
            "レスポンシブ": [r"レスポンシブ[：:]\s*([0-9.]+)", r"responsive[：:]\s*([0-9.]+)"],
            "アクセシビリティ": [r"アクセシビリティ[：:]\s*([0-9.]+)", r"accessibility[：:]\s*([0-9.]+)"]
        }
        
        for score_name, patterns in score_patterns.items():
            for pattern in patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    try:
                        score_value = float(match.group(1))
                        # 0-10スケールを0-1スケールに正規化
                        if score_value > 1.0:
                            score_value = score_value / 10.0
                        scores[score_name] = score_value
                        break
                    except ValueError:
                        continue
        
        return scores
    
    def _format_scores_as_text(self, scores: Dict[str, float]) -> str:
        """スコアをテキスト形式にフォーマット"""
        
        if not scores:
            return ""
        
        score_texts = []
        for category, score in scores.items():
            score_texts.append(f"{category}: {score:.2f}")
        
        return f"Design scores - {', '.join(score_texts)}"

# 使用例とテスト
def main():
    """メイン処理とテスト"""
    
    # 設定
    openai_config = OpenAIEmbeddingConfig(
        api_key=os.getenv("OPENAI_API_KEY", "")
    )
    db_config = DatabaseConfig(
        password=os.getenv("POSTGRES_PASSWORD", "")
    )
    
    # 初期化
    embedding_processor = OpenAIEmbeddingProcessor(openai_config)
    embedding_manager = DesignEmbeddingManager(db_config, embedding_processor)
    claude_processor = ClaudeOutputProcessor(embedding_manager)
    
    # テスト用Claude応答
    sample_claude_response = {
        "content": """
        このFigmaデザインは【チャットUI】のジャンルに分類されます。
        
        評価スコア:
        - 配色: 8.5
        - 一貫性: 9.0
        - ヒエラルキー: 7.5
        - ユーザビリティ: 8.0
        - アクセシビリティ: 6.5
        
        全体的にモダンで使いやすいチャットインターフェースです。
        メッセージの階層構造が明確で、カラーパレットも統一されています。
        """
    }
    
    # 処理テスト
    try:
        result = claude_processor.process_claude_response(
            claude_response=sample_claude_response,
            figma_url="https://figma.com/test-chat-ui",
            example_id="test-example-001"
        )
        
        print("✅ Processing successful:")
        print(f"  Genre: {result['genre']}")
        print(f"  Scores: {result['design_scores']}")
        print(f"  Embeddings created: {len(result['embeddings_created'])}")
        
        # 類似検索テスト
        similar_results = embedding_manager.search_similar_embeddings(
            query_text="チャットインターフェース デザイン",
            limit=3
        )
        
        print(f"\n🔍 Similar embeddings found: {len(similar_results)}")
        for result in similar_results:
            print(f"  - Similarity: {result['similarity']:.3f}, Type: {result['embedding_type']}")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    main()