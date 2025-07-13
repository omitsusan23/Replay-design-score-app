#!/usr/bin/env python3
"""
RAG検索クライアント
Instructor-XLベクトル検索、cosine類似度、Claude用プロンプト生成
"""

import argparse
import json
import os
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime

# 自作モジュールのインポート
from instructor_xl_embeddings import (
    EmbeddingConfig, 
    DatabaseConfig, 
    InstructorXLEmbedder, 
    RAGQuerySearcher
)

class AdvancedRAGSearcher:
    """高度なRAG検索機能クラス"""
    
    def __init__(self, searcher: RAGQuerySearcher):
        self.searcher = searcher
        self.logger = self._setup_logger()
    
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("advanced_rag_searcher")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def search_with_filters(
        self,
        query: str,
        ui_types: List[str] = None,
        min_score: float = 0.0,
        limit: int = 10,
        include_content: bool = False
    ) -> List[Dict[str, Any]]:
        """フィルタ機能付き検索"""
        
        self.logger.info(f"🎯 Advanced search: '{query}' with filters")
        
        try:
            # クエリの埋め込み生成
            query_embedding = self.searcher.embedder.generate_embeddings(
                [query], 
                "Represent the search query for finding relevant UI components"
            )[0]
            
            # フィルタ付きSQL構築
            base_query = """
            SELECT 
                r.id, r.title, r.ui_type, r.description, 
                r.keywords, r.evaluation_score, r.claude_evaluation,
                (1 - (r.embedding <=> %s))::NUMERIC AS similarity
            """
            
            if include_content:
                base_query += ", r.copied_content"
            
            base_query += """
            FROM rag_documents_instructor r
            WHERE r.is_approved = TRUE
            AND (1 - (r.embedding <=> %s)) > %s
            """
            
            params = [query_embedding, query_embedding, min_score]
            
            # UI種別フィルタ
            if ui_types:
                placeholders = ','.join(['%s'] * len(ui_types))
                base_query += f" AND r.ui_type IN ({placeholders})"
                params.extend(ui_types)
            
            base_query += " ORDER BY r.embedding <=> %s LIMIT %s"
            params.extend([query_embedding, limit])
            
            # 検索実行
            with self.searcher.get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(base_query, params)
                    results = cur.fetchall()
                    
                    # 結果の整形
                    columns = [desc[0] for desc in cur.description]
                    search_results = []
                    
                    for row in results:
                        result_dict = dict(zip(columns, row))
                        
                        # JSONBフィールドのパース
                        if 'claude_evaluation' in result_dict and result_dict['claude_evaluation']:
                            if isinstance(result_dict['claude_evaluation'], str):
                                result_dict['claude_evaluation'] = json.loads(result_dict['claude_evaluation'])
                        
                        search_results.append(result_dict)
            
            self.logger.info(f"✅ Found {len(search_results)} filtered results")
            return search_results
            
        except Exception as e:
            self.logger.error(f"❌ Advanced search failed: {e}")
            raise
    
    def multi_query_search(
        self,
        queries: List[str],
        aggregation: str = "max",  # max, mean, weighted
        weights: List[float] = None
    ) -> List[Dict[str, Any]]:
        """複数クエリによる検索（異なる観点からの検索）"""
        
        self.logger.info(f"🔍 Multi-query search with {len(queries)} queries")
        
        all_results = {}  # document_id -> result_data
        
        # 各クエリで検索実行
        for i, query in enumerate(queries):
            weight = weights[i] if weights else 1.0
            results = self.searcher.search_similar_documents(query, limit=20)
            
            for result in results:
                doc_id = result['id']
                similarity = result['similarity'] * weight
                
                if doc_id in all_results:
                    # 集約方法に応じて類似度を統合
                    if aggregation == "max":
                        all_results[doc_id]['similarity'] = max(
                            all_results[doc_id]['similarity'], similarity
                        )
                    elif aggregation == "mean":
                        all_results[doc_id]['similarity'] = (
                            all_results[doc_id]['similarity'] + similarity
                        ) / 2
                    elif aggregation == "weighted":
                        all_results[doc_id]['similarity'] += similarity
                else:
                    all_results[doc_id] = result.copy()
                    all_results[doc_id]['similarity'] = similarity
        
        # 類似度順でソート
        final_results = sorted(
            all_results.values(), 
            key=lambda x: x['similarity'], 
            reverse=True
        )
        
        self.logger.info(f"✅ Multi-query search found {len(final_results)} unique results")
        return final_results[:10]  # 上位10件
    
    def semantic_category_search(
        self,
        category: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """セマンティックカテゴリ検索"""
        
        # カテゴリ別の検索クエリテンプレート
        category_queries = {
            "navigation": [
                "ナビゲーション メニュー サイドバー",
                "画面遷移 導線 UI",
                "メニューバー ヘッダー フッター"
            ],
            "form": [
                "フォーム 入力 バリデーション",
                "テキストボックス ボタン 送信",
                "ユーザー入力 データ入力"
            ],
            "data_display": [
                "データ表示 テーブル グリッド",
                "リスト カード 一覧表示",
                "情報表示 コンテンツ"
            ],
            "feedback": [
                "フィードバック 通知 アラート",
                "エラーメッセージ 成功通知",
                "ユーザー通知 状態表示"
            ]
        }
        
        if category not in category_queries:
            # 直接カテゴリ名で検索
            queries = [category]
        else:
            queries = category_queries[category]
        
        return self.multi_query_search(queries, aggregation="weighted")
    
    def find_similar_components(
        self,
        reference_doc_id: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """指定ドキュメントと類似のコンポーネント検索"""
        
        self.logger.info(f"🔗 Finding components similar to: {reference_doc_id}")
        
        try:
            # 参照ドキュメントの埋め込みを取得
            with self.searcher.get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT embedding, title, ui_type 
                        FROM rag_documents_instructor 
                        WHERE id = %s
                    """, (reference_doc_id,))
                    
                    result = cur.fetchone()
                    if not result:
                        raise ValueError(f"Document not found: {reference_doc_id}")
                    
                    ref_embedding, ref_title, ref_ui_type = result
            
            # 類似度検索実行
            with self.searcher.get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            r.id, r.title, r.ui_type, r.description,
                            (1 - (r.embedding <=> %s))::NUMERIC AS similarity,
                            r.evaluation_score
                        FROM rag_documents_instructor r
                        WHERE r.is_approved = TRUE 
                        AND r.id != %s
                        ORDER BY r.embedding <=> %s
                        LIMIT %s
                    """, (ref_embedding, reference_doc_id, ref_embedding, limit))
                    
                    results = cur.fetchall()
                    
                    # 結果の整形
                    columns = [desc[0] for desc in cur.description]
                    similar_components = [dict(zip(columns, row)) for row in results]
            
            self.logger.info(f"✅ Found {len(similar_components)} similar components to '{ref_title}'")
            return similar_components
            
        except Exception as e:
            self.logger.error(f"❌ Similar component search failed: {e}")
            raise

class ClaudePromptGenerator:
    """Claude向けプロンプト生成クラス"""
    
    def __init__(self):
        self.logger = self._setup_logger()
    
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("claude_prompt_generator")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def generate_design_advice_prompt(
        self,
        search_results: List[Dict[str, Any]],
        user_query: str,
        context: Dict[str, Any] = None
    ) -> Dict[str, str]:
        """デザイン・実装アドバイス用プロンプト生成"""
        
        system_prompt = """あなたはUI/UX設計の専門家です。以下の検索結果を基に、ユーザーの質問に対して具体的で実用的なアドバイスを提供してください。

## 回答の形式:
🧩 **分析結果**
（質問内容の要点整理）

⚠️ **注意点・考慮事項**
（設計時に注意すべき点）

🛠 **実装提案**
```
実装コード例やHTML/CSS/JSのスニペット
```

🎓 **学べるポイント**
（この実装から学べること、応用できる技術）

---

## 参考情報（検索結果）:"""
        
        for i, result in enumerate(search_results, 1):
            system_prompt += f"""

### {i}. {result['title']} (類似度: {result['similarity']:.2f})
- **UIタイプ**: {result['ui_type']}
- **説明**: {result.get('description', 'なし')}
- **評価スコア**: {result.get('evaluation_score', 0):.2f}
"""
            
            # Claude評価情報の追加
            if result.get('claude_evaluation'):
                eval_data = result['claude_evaluation']
                if isinstance(eval_data, str):
                    eval_data = json.loads(eval_data)
                
                quality = eval_data.get('quality', {})
                improvements = eval_data.get('improvements', [])
                
                if quality:
                    system_prompt += f"- **品質評価**: 再利用性={quality.get('reusability', 'N/A')}, 保守性={quality.get('maintainability', 'N/A')}, アクセシビリティ={quality.get('accessibility', 'N/A')}\n"
                
                if improvements:
                    system_prompt += f"- **改善提案**: {', '.join(improvements[:3])}\n"
            
            # キーワード情報
            if result.get('keywords'):
                keywords = result['keywords'][:5]  # 最初の5個
                system_prompt += f"- **関連キーワード**: {', '.join(keywords)}\n"
        
        # コンテキスト情報の追加
        if context:
            system_prompt += f"""
---
## プロジェクトコンテキスト:
- **技術スタック**: {context.get('tech_stack', '未指定')}
- **ターゲットデバイス**: {context.get('target_device', '未指定')}  
- **デザインシステム**: {context.get('design_system', '未指定')}
"""
        
        user_prompt = f"""
質問: {user_query}

上記の参考情報を活用して、以下の観点から回答をお願いします：

1. **現状分析**: 質問の要点と背景を整理
2. **技術的実装**: 具体的なコード例や実装方法
3. **ベストプラクティス**: 業界標準やアクセシビリティの観点
4. **応用・発展**: より良い設計にするための提案

特に実装コードは実際に使用可能な形で提示してください。
"""
        
        return {
            "system": system_prompt,
            "user": user_prompt
        }
    
    def generate_comparison_prompt(
        self,
        search_results: List[Dict[str, Any]],
        comparison_criteria: List[str] = None
    ) -> Dict[str, str]:
        """コンポーネント比較用プロンプト生成"""
        
        if comparison_criteria is None:
            comparison_criteria = [
                "実装の複雑さ",
                "アクセシビリティ",
                "パフォーマンス", 
                "保守性",
                "ブラウザ対応"
            ]
        
        system_prompt = f"""以下の{len(search_results)}つのUIコンポーネントを比較分析してください。

## 比較項目:
{chr(10).join([f'- {criteria}' for criteria in comparison_criteria])}

## 対象コンポーネント:"""
        
        for i, result in enumerate(search_results, 1):
            system_prompt += f"""

### {i}. {result['title']}
- UIタイプ: {result['ui_type']}
- 評価スコア: {result.get('evaluation_score', 0):.2f}
- 説明: {result.get('description', 'なし')}
"""
        
        user_prompt = """
上記のコンポーネントについて、表形式で比較分析を行い、
それぞれの長所・短所を明確にしてください。

最後に、用途別（プロトタイプ、本格運用、学習目的など）の
推奨コンポーネントも提案してください。
"""
        
        return {
            "system": system_prompt,
            "user": user_prompt
        }

def main():
    """CLI メイン処理"""
    
    parser = argparse.ArgumentParser(description="RAG Search Client for Instructor-XL")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--ui-types", nargs="+", help="Filter by UI types")
    parser.add_argument("--min-score", type=float, default=0.0, help="Minimum similarity score")
    parser.add_argument("--limit", type=int, default=5, help="Number of results")
    parser.add_argument("--include-content", action="store_true", help="Include content in results")
    parser.add_argument("--multi-query", nargs="+", help="Multiple queries for advanced search")
    parser.add_argument("--category", help="Semantic category search")
    parser.add_argument("--similar-to", help="Find components similar to document ID")
    parser.add_argument("--claude-prompt", action="store_true", help="Generate Claude prompt")
    parser.add_argument("--comparison", action="store_true", help="Generate comparison prompt")
    parser.add_argument("--output", help="Output file for results")
    parser.add_argument("--db-password", help="PostgreSQL password")
    
    args = parser.parse_args()
    
    # 設定
    embedding_config = EmbeddingConfig()
    db_config = DatabaseConfig(
        password=args.db_password or os.getenv("POSTGRES_PASSWORD", "")
    )
    
    # 初期化
    embedder = InstructorXLEmbedder(embedding_config)
    searcher = RAGQuerySearcher(db_config, embedder)
    advanced_searcher = AdvancedRAGSearcher(searcher)
    prompt_generator = ClaudePromptGenerator()
    
    try:
        # 検索実行
        if args.similar_to:
            results = advanced_searcher.find_similar_components(args.similar_to, args.limit)
        elif args.category:
            results = advanced_searcher.semantic_category_search(args.category, args.limit)
        elif args.multi_query:
            results = advanced_searcher.multi_query_search(args.multi_query)
        else:
            results = advanced_searcher.search_with_filters(
                query=args.query,
                ui_types=args.ui_types,
                min_score=args.min_score,
                limit=args.limit,
                include_content=args.include_content
            )
        
        # 結果表示
        print(f"\n🔍 Search Results ({len(results)} found):")
        print("-" * 60)
        
        for i, result in enumerate(results, 1):
            print(f"{i}. {result['title']}")
            print(f"   Type: {result['ui_type']}")
            print(f"   Similarity: {result['similarity']:.3f}")
            print(f"   Score: {result.get('evaluation_score', 0):.2f}")
            
            if result.get('description'):
                print(f"   Description: {result['description'][:100]}...")
            
            print()
        
        # Claude プロンプト生成
        if args.claude_prompt:
            if args.comparison and len(results) > 1:
                prompt = prompt_generator.generate_comparison_prompt(results)
            else:
                prompt = prompt_generator.generate_design_advice_prompt(results, args.query)
            
            print("\n🤖 Claude Prompt Generated:")
            print("=" * 60)
            print("SYSTEM:")
            print(prompt["system"])
            print("\nUSER:")
            print(prompt["user"])
        
        # ファイル出力
        if args.output:
            output_data = {
                "query": args.query,
                "timestamp": datetime.now().isoformat(),
                "results": results
            }
            
            if args.claude_prompt:
                output_data["claude_prompt"] = prompt
            
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)
            
            print(f"\n💾 Results saved to: {args.output}")
        
    except Exception as e:
        print(f"❌ Search failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())