#!/usr/bin/env python3
"""
Claude RAG統合システム
Instructor-XL検索結果をClaudeに最適化したプロンプトとして構成
"""

import json
import os
import requests
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
from dataclasses import dataclass

# 自作モジュールのインポート
from instructor_xl_embeddings import (
    EmbeddingConfig, 
    DatabaseConfig, 
    InstructorXLEmbedder, 
    RAGQuerySearcher
)
from rag_search_client import AdvancedRAGSearcher

@dataclass
class ClaudeConfig:
    """Claude API設定"""
    api_key: str = ""
    model: str = "claude-3-5-sonnet-20241022"
    max_tokens: int = 4096
    base_url: str = "https://api.anthropic.com/v1/messages"

class ClaudeRAGIntegration:
    """Claude RAG統合クラス"""
    
    def __init__(
        self,
        searcher: AdvancedRAGSearcher,
        claude_config: ClaudeConfig = None
    ):
        self.searcher = searcher
        self.claude_config = claude_config or ClaudeConfig()
        self.logger = self._setup_logger()
    
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("claude_rag_integration")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def generate_comprehensive_prompt(
        self,
        user_query: str,
        search_limit: int = 5,
        include_code: bool = True,
        context: Dict[str, Any] = None
    ) -> Dict[str, str]:
        """包括的なClaude用プロンプト生成"""
        
        self.logger.info(f"🧠 Generating comprehensive prompt for: '{user_query}'")
        
        # RAG検索実行
        search_results = self.searcher.search_with_filters(
            query=user_query,
            limit=search_limit,
            include_content=include_code
        )
        
        # システムプロンプト構築
        system_prompt = self._build_system_prompt(search_results, context)
        
        # ユーザープロンプト構築
        user_prompt = self._build_user_prompt(user_query, search_results)
        
        return {
            "system": system_prompt,
            "user": user_prompt,
            "metadata": {
                "search_query": user_query,
                "results_count": len(search_results),
                "generated_at": datetime.now().isoformat()
            }
        }
    
    def _build_system_prompt(
        self,
        search_results: List[Dict[str, Any]],
        context: Dict[str, Any] = None
    ) -> str:
        """システムプロンプト構築"""
        
        system_prompt = f"""あなたはUI/UX設計とフロントエンド開発の専門家です。CLAUDE.mdの指示に従い、技術メンターとして以下の形式で回答してください：

🧩 **コードの目的**
（このUIコンポーネントが何をするか）

⚠️ **問題点・改善点**
（現在の実装や一般的な課題）

🛠 **改善提案コード**
```typescript
// 改善後のコード例
```

🎓 **学べるポイント**
（この実装から学べること、応用場面）

---

## 🔍 検索されたUI参考資料 ({len(search_results)}件):
"""
        
        for i, result in enumerate(search_results, 1):
            system_prompt += f"""
### {i}. {result['title']} (類似度: {result['similarity']:.2f})
**UIタイプ**: {result['ui_type']}
**説明**: {result.get('description', 'なし')}
**評価スコア**: {result.get('evaluation_score', 0):.2f}
"""
            
            # Claude評価の詳細情報
            if result.get('claude_evaluation'):
                eval_data = result['claude_evaluation']
                if isinstance(eval_data, str):
                    eval_data = json.loads(eval_data)
                
                # 品質評価
                quality = eval_data.get('quality', {})
                if quality:
                    system_prompt += f"**品質**: 再利用性={quality.get('reusability', 'N/A')}, 保守性={quality.get('maintainability', 'N/A')}, アクセシビリティ={quality.get('accessibility', 'N/A')}\n"
                
                # 改善提案
                improvements = eval_data.get('improvements', [])
                if improvements:
                    system_prompt += f"**改善案**: {', '.join(improvements[:3])}\n"
                
                # UI分類
                ui_classification = eval_data.get('ui_classification', {})
                if ui_classification:
                    primary_type = ui_classification.get('primary_type', '')
                    secondary_types = ui_classification.get('secondary_types', [])
                    if secondary_types:
                        system_prompt += f"**分類**: {primary_type} ({', '.join(secondary_types)})\n"
            
            # キーワード
            if result.get('keywords'):
                keywords = result['keywords'][:5]
                system_prompt += f"**キーワード**: {', '.join(keywords)}\n"
            
            # コード例（利用可能な場合）
            if result.get('copied_content'):
                content = result['copied_content'][:500]  # 最初の500文字
                system_prompt += f"""**実装例**:
```
{content}...
```
"""
            system_prompt += "\n"
        
        # プロジェクトコンテキスト
        if context:
            system_prompt += f"""
---
## 📋 プロジェクト情報:
- **技術スタック**: {context.get('tech_stack', '未指定')}
- **デザインシステム**: {context.get('design_system', '未指定')}
- **ターゲット**: {context.get('target_device', 'ウェブ')}
- **要件**: {context.get('requirements', '未指定')}
"""
        
        system_prompt += """
---
## 📝 回答ガイドライン:
1. **実装優先**: 実際に動作するコード例を提供してください
2. **学習視点**: なぜその実装になるのかを明確に説明してください
3. **改善提案**: より良い実装方法や代替案も提示してください
4. **日本語**: すべて日本語で回答し、専門用語には補足説明をつけてください
5. **構造化**: 指定された🧩⚠️🛠🎓の形式を厳守してください

上記の参考資料を活用して、質問に対する実践的で学びのあるアドバイスをお願いします。"""
        
        return system_prompt
    
    def _build_user_prompt(
        self,
        user_query: str,
        search_results: List[Dict[str, Any]]
    ) -> str:
        """ユーザープロンプト構築"""
        
        user_prompt = f"""質問: {user_query}

以下の観点から具体的に回答してください：

1. **現状分析**: 質問の背景と要点を整理
2. **実装提案**: TypeScript/React/HTML/CSSでの具体的なコード例
3. **ベストプラクティス**: アクセシビリティ、SEO、パフォーマンスの観点
4. **応用発展**: より良い設計・実装への改善提案

特に、検索結果の{len(search_results)}件の参考情報を活用して、実際のプロジェクトで使えるレベルの実装例を提示してください。"""
        
        return user_prompt
    
    def call_claude_api(
        self,
        system_prompt: str,
        user_prompt: str,
        stream: bool = False
    ) -> Dict[str, Any]:
        """Claude API呼び出し"""
        
        if not self.claude_config.api_key:
            raise ValueError("Claude API key is required")
        
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.claude_config.api_key,
            "anthropic-version": "2023-06-01"
        }
        
        payload = {
            "model": self.claude_config.model,
            "max_tokens": self.claude_config.max_tokens,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            "stream": stream
        }
        
        try:
            self.logger.info("🤖 Calling Claude API...")
            
            response = requests.post(
                self.claude_config.base_url,
                headers=headers,
                json=payload,
                timeout=60
            )
            
            response.raise_for_status()
            result = response.json()
            
            self.logger.info("✅ Claude API call successful")
            return result
            
        except Exception as e:
            self.logger.error(f"❌ Claude API call failed: {e}")
            raise
    
    def process_complete_query(
        self,
        user_query: str,
        context: Dict[str, Any] = None,
        call_claude: bool = False
    ) -> Dict[str, Any]:
        """完全なクエリ処理（検索→プロンプト生成→Claude呼び出し）"""
        
        self.logger.info(f"🚀 Processing complete query: '{user_query}'")
        
        # 1. プロンプト生成
        prompt_data = self.generate_comprehensive_prompt(
            user_query=user_query,
            context=context
        )
        
        result = {
            "query": user_query,
            "prompt": prompt_data,
            "timestamp": datetime.now().isoformat()
        }
        
        # 2. Claude API呼び出し（オプション）
        if call_claude and self.claude_config.api_key:
            try:
                claude_response = self.call_claude_api(
                    prompt_data["system"],
                    prompt_data["user"]
                )
                result["claude_response"] = claude_response
                
            except Exception as e:
                self.logger.error(f"Claude API call failed: {e}")
                result["claude_error"] = str(e)
        
        return result

class CLIInterface:
    """コマンドライン インターフェース"""
    
    def __init__(self):
        self.logger = self._setup_logger()
    
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("cli_interface")
        logger.setLevel(logging.INFO)
        return logger
    
    def interactive_mode(self, integration: ClaudeRAGIntegration):
        """インタラクティブモード"""
        
        print("🤖 Claude RAG Interactive Mode")
        print("Type 'quit' to exit, 'help' for commands")
        print("-" * 50)
        
        while True:
            try:
                user_input = input("\n🔍 Query: ").strip()
                
                if user_input.lower() in ['quit', 'exit', 'q']:
                    print("👋 Goodbye!")
                    break
                
                if user_input.lower() == 'help':
                    self._show_help()
                    continue
                
                if not user_input:
                    continue
                
                # クエリ処理
                result = integration.process_complete_query(
                    user_query=user_input,
                    call_claude=False  # プロンプトのみ生成
                )
                
                # 結果表示
                print("\n📝 Generated Prompt:")
                print("=" * 60)
                print("SYSTEM:")
                print(result["prompt"]["system"][:1000] + "...")
                print("\nUSER:")
                print(result["prompt"]["user"])
                
                # ファイル保存オプション
                save = input("\n💾 Save to file? (y/N): ").strip().lower()
                if save in ['y', 'yes']:
                    filename = f"claude_prompt_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    print(f"✅ Saved to: {filename}")
                
            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"❌ Error: {e}")
    
    def _show_help(self):
        """ヘルプ表示"""
        
        print("""
🆘 Available Commands:
- Type any UI/UX related question
- 'quit' or 'exit' or 'q': Exit the program
- 'help': Show this help message

📝 Example Queries:
- "Reactでレスポンシブなナビゲーションバーを作りたい"
- "アクセシブルなフォームバリデーションの実装方法"
- "Tailwind CSSでモーダルダイアログを作成"
- "TypeScriptでのカードコンポーネント設計"
""")

def main():
    """メイン処理"""
    
    import argparse
    
    parser = argparse.ArgumentParser(description="Claude RAG Integration System")
    parser.add_argument("--query", help="Direct query (non-interactive)")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode")
    parser.add_argument("--call-claude", action="store_true", help="Call Claude API")
    parser.add_argument("--output", help="Output file for results")
    parser.add_argument("--claude-api-key", help="Claude API key")
    parser.add_argument("--db-password", help="PostgreSQL password")
    parser.add_argument("--tech-stack", help="Technology stack context")
    parser.add_argument("--design-system", help="Design system context")
    
    args = parser.parse_args()
    
    # 設定
    embedding_config = EmbeddingConfig()
    db_config = DatabaseConfig(
        password=args.db_password or os.getenv("POSTGRES_PASSWORD", "")
    )
    claude_config = ClaudeConfig(
        api_key=args.claude_api_key or os.getenv("CLAUDE_API_KEY", "")
    )
    
    # 初期化
    embedder = InstructorXLEmbedder(embedding_config)
    searcher = RAGQuerySearcher(db_config, embedder)
    advanced_searcher = AdvancedRAGSearcher(searcher)
    integration = ClaudeRAGIntegration(advanced_searcher, claude_config)
    
    # コンテキスト設定
    context = {}
    if args.tech_stack:
        context['tech_stack'] = args.tech_stack
    if args.design_system:
        context['design_system'] = args.design_system
    
    try:
        if args.interactive:
            # インタラクティブモード
            cli = CLIInterface()
            cli.interactive_mode(integration)
            
        elif args.query:
            # 直接クエリ
            result = integration.process_complete_query(
                user_query=args.query,
                context=context if context else None,
                call_claude=args.call_claude
            )
            
            # 結果表示
            print("📝 Generated Prompt:")
            print("=" * 60)
            print("SYSTEM:")
            print(result["prompt"]["system"])
            print("\nUSER:")
            print(result["prompt"]["user"])
            
            if args.call_claude and result.get("claude_response"):
                print("\n🤖 Claude Response:")
                print("=" * 60)
                content = result["claude_response"].get("content", [])
                if content and content[0].get("text"):
                    print(content[0]["text"])
            
            # ファイル出力
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                print(f"\n💾 Results saved to: {args.output}")
        
        else:
            parser.print_help()
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())