#!/usr/bin/env python3
"""
Instructor-XL RAGシステム統合テスト
全コンポーネントの動作確認とパフォーマンス測定
"""

import os
import sys
import time
import json
import traceback
from typing import List, Dict, Any
import logging

# 自作モジュールのインポート
try:
    from instructor_xl_embeddings import (
        EmbeddingConfig, 
        DatabaseConfig, 
        InstructorXLEmbedder, 
        RAGDocumentProcessor,
        RAGQuerySearcher
    )
    from document_importer import DocumentImporter
    from rag_search_client import AdvancedRAGSearcher, ClaudePromptGenerator
    from claude_rag_integration import ClaudeRAGIntegration
    
    print("✅ All modules imported successfully")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Please ensure all dependencies are installed: pip install -r requirements_instructor_xl.txt")
    sys.exit(1)

class InstructorXLSystemTester:
    """システム全体テストクラス"""
    
    def __init__(self):
        self.logger = self._setup_logger()
        self.test_results = {}
        self.embedder = None
        self.processor = None
        self.searcher = None
        self.advanced_searcher = None
        self.integration = None
        
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("system_tester")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def test_model_loading(self) -> bool:
        """Instructor-XLモデル読み込みテスト"""
        
        self.logger.info("🧠 Testing Instructor-XL model loading...")
        
        try:
            start_time = time.time()
            
            # 設定（テスト用に軽量化）
            config = EmbeddingConfig(
                batch_size=2,  # テスト用に小さく
                max_length=256  # テスト用に短く
            )
            
            self.embedder = InstructorXLEmbedder(config)
            
            load_time = time.time() - start_time
            
            self.test_results['model_loading'] = {
                'status': 'success',
                'load_time': load_time,
                'device': str(config.device),
                'model_name': config.model_name
            }
            
            self.logger.info(f"✅ Model loaded successfully in {load_time:.2f}s on {config.device}")
            return True
            
        except Exception as e:
            self.test_results['model_loading'] = {
                'status': 'failed',
                'error': str(e)
            }
            self.logger.error(f"❌ Model loading failed: {e}")
            return False
    
    def test_embedding_generation(self) -> bool:
        """埋め込み生成テスト"""
        
        if not self.embedder:
            self.logger.error("❌ Embedder not initialized")
            return False
        
        self.logger.info("🔢 Testing embedding generation...")
        
        try:
            test_texts = [
                "Bootstrap カードコンポーネント",
                "レスポンシブナビゲーション",
                "フォームバリデーション実装"
            ]
            
            start_time = time.time()
            embeddings = self.embedder.generate_embeddings(test_texts)
            generation_time = time.time() - start_time
            
            # 検証
            assert len(embeddings) == len(test_texts), "Embedding count mismatch"
            assert len(embeddings[0]) == 4096, f"Expected 4096 dimensions, got {len(embeddings[0])}"
            
            self.test_results['embedding_generation'] = {
                'status': 'success',
                'generation_time': generation_time,
                'texts_count': len(test_texts),
                'embedding_dimensions': len(embeddings[0]),
                'avg_time_per_text': generation_time / len(test_texts)
            }
            
            self.logger.info(f"✅ Generated {len(embeddings)} embeddings in {generation_time:.2f}s")
            return True
            
        except Exception as e:
            self.test_results['embedding_generation'] = {
                'status': 'failed',
                'error': str(e),
                'traceback': traceback.format_exc()
            }
            self.logger.error(f"❌ Embedding generation failed: {e}")
            return False
    
    def test_database_connection(self) -> bool:
        """データベース接続テスト"""
        
        self.logger.info("🗄️ Testing database connection...")
        
        try:
            db_config = DatabaseConfig(
                password=os.getenv("POSTGRES_PASSWORD", "")
            )
            
            if not self.embedder:
                self.logger.error("❌ Embedder required for processor test")
                return False
            
            self.processor = RAGDocumentProcessor(db_config, self.embedder)
            
            # 接続テスト
            with self.processor.get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT version();")
                    version = cur.fetchone()[0]
            
            self.test_results['database_connection'] = {
                'status': 'success',
                'postgres_version': version,
                'host': db_config.host,
                'port': db_config.port
            }
            
            self.logger.info(f"✅ Database connected: {version}")
            return True
            
        except Exception as e:
            self.test_results['database_connection'] = {
                'status': 'failed',
                'error': str(e)
            }
            self.logger.error(f"❌ Database connection failed: {e}")
            return False
    
    def test_document_processing(self) -> bool:
        """ドキュメント処理テスト"""
        
        if not self.processor:
            self.logger.error("❌ Processor not initialized")
            return False
        
        self.logger.info("📝 Testing document processing...")
        
        try:
            test_doc = {
                "title": "Test Bootstrap Button",
                "ui_type": "button",
                "description": "テスト用のBootstrapボタンコンポーネント",
                "content": '<button class="btn btn-primary">Test Button</button>',
                "keywords": ["test", "bootstrap", "button"],
                "source_url": "https://example.com/test"
            }
            
            start_time = time.time()
            
            # ドキュメント処理
            processed_doc = self.processor.process_document(**test_doc)
            
            # 検証
            assert 'embedding' in processed_doc, "Main embedding missing"
            assert 'content_embedding' in processed_doc, "Content embedding missing"
            assert 'title_embedding' in processed_doc, "Title embedding missing"
            assert len(processed_doc['embedding']) == 4096, "Invalid embedding dimension"
            
            processing_time = time.time() - start_time
            
            self.test_results['document_processing'] = {
                'status': 'success',
                'processing_time': processing_time,
                'embedding_types': 3,
                'has_all_fields': True
            }
            
            self.logger.info(f"✅ Document processed in {processing_time:.2f}s")
            return True
            
        except Exception as e:
            self.test_results['document_processing'] = {
                'status': 'failed',
                'error': str(e),
                'traceback': traceback.format_exc()
            }
            self.logger.error(f"❌ Document processing failed: {e}")
            return False
    
    def test_search_functionality(self) -> bool:
        """検索機能テスト"""
        
        if not self.processor:
            self.logger.error("❌ Processor not initialized")
            return False
        
        self.logger.info("🔍 Testing search functionality...")
        
        try:
            # 検索準備
            db_config = DatabaseConfig(
                password=os.getenv("POSTGRES_PASSWORD", "")
            )
            
            self.searcher = RAGQuerySearcher(db_config, self.embedder)
            self.advanced_searcher = AdvancedRAGSearcher(self.searcher)
            
            # テスト検索
            test_queries = [
                "ボタンコンポーネント",
                "レスポンシブデザイン",
                "ナビゲーション"
            ]
            
            search_results = {}
            total_search_time = 0
            
            for query in test_queries:
                start_time = time.time()
                
                try:
                    results = self.advanced_searcher.search_with_filters(
                        query=query,
                        limit=3,
                        min_score=0.0  # テスト用に低めに設定
                    )
                    
                    search_time = time.time() - start_time
                    total_search_time += search_time
                    
                    search_results[query] = {
                        'status': 'success',
                        'results_count': len(results),
                        'search_time': search_time
                    }
                    
                    self.logger.info(f"  Query '{query}': {len(results)} results in {search_time:.3f}s")
                    
                except Exception as e:
                    search_results[query] = {
                        'status': 'failed',
                        'error': str(e)
                    }
                    self.logger.warning(f"  Query '{query}' failed: {e}")
            
            self.test_results['search_functionality'] = {
                'status': 'success',
                'total_queries': len(test_queries),
                'successful_queries': len([r for r in search_results.values() if r['status'] == 'success']),
                'total_search_time': total_search_time,
                'avg_search_time': total_search_time / len(test_queries),
                'detailed_results': search_results
            }
            
            self.logger.info(f"✅ Search tests completed, avg time: {total_search_time/len(test_queries):.3f}s")
            return True
            
        except Exception as e:
            self.test_results['search_functionality'] = {
                'status': 'failed',
                'error': str(e),
                'traceback': traceback.format_exc()
            }
            self.logger.error(f"❌ Search functionality test failed: {e}")
            return False
    
    def test_claude_integration(self) -> bool:
        """Claude統合テスト"""
        
        if not self.advanced_searcher:
            self.logger.error("❌ Advanced searcher not initialized")
            return False
        
        self.logger.info("🤖 Testing Claude integration...")
        
        try:
            self.integration = ClaudeRAGIntegration(self.advanced_searcher)
            
            test_query = "Reactでアクセシブルなボタンを作りたい"
            
            start_time = time.time()
            
            # プロンプト生成テスト
            prompt_data = self.integration.generate_comprehensive_prompt(
                user_query=test_query,
                search_limit=3
            )
            
            generation_time = time.time() - start_time
            
            # 検証
            assert 'system' in prompt_data, "System prompt missing"
            assert 'user' in prompt_data, "User prompt missing"
            assert 'metadata' in prompt_data, "Metadata missing"
            assert len(prompt_data['system']) > 100, "System prompt too short"
            assert len(prompt_data['user']) > 50, "User prompt too short"
            
            self.test_results['claude_integration'] = {
                'status': 'success',
                'generation_time': generation_time,
                'system_prompt_length': len(prompt_data['system']),
                'user_prompt_length': len(prompt_data['user']),
                'has_metadata': True
            }
            
            self.logger.info(f"✅ Claude prompt generated in {generation_time:.2f}s")
            self.logger.info(f"  System prompt: {len(prompt_data['system'])} chars")
            self.logger.info(f"  User prompt: {len(prompt_data['user'])} chars")
            
            return True
            
        except Exception as e:
            self.test_results['claude_integration'] = {
                'status': 'failed',
                'error': str(e),
                'traceback': traceback.format_exc()
            }
            self.logger.error(f"❌ Claude integration test failed: {e}")
            return False
    
    def test_performance_metrics(self) -> bool:
        """パフォーマンス測定テスト"""
        
        if not self.embedder:
            return False
        
        self.logger.info("⚡ Testing performance metrics...")
        
        try:
            # バッチサイズ別パフォーマンステスト
            batch_sizes = [1, 4, 8]
            text_counts = [5, 10, 20]
            
            performance_data = {}
            
            for batch_size in batch_sizes:
                for text_count in text_counts:
                    test_key = f"batch_{batch_size}_texts_{text_count}"
                    
                    # テストテキスト生成
                    test_texts = [f"テストテキスト {i} - UIコンポーネント" for i in range(text_count)]
                    
                    # バッチサイズ設定
                    original_batch_size = self.embedder.config.batch_size
                    self.embedder.config.batch_size = batch_size
                    
                    try:
                        start_time = time.time()
                        embeddings = self.embedder.generate_embeddings(test_texts)
                        processing_time = time.time() - start_time
                        
                        performance_data[test_key] = {
                            'status': 'success',
                            'processing_time': processing_time,
                            'texts_per_second': text_count / processing_time,
                            'time_per_text': processing_time / text_count
                        }
                        
                    except Exception as e:
                        performance_data[test_key] = {
                            'status': 'failed',
                            'error': str(e)
                        }
                    
                    # バッチサイズを戻す
                    self.embedder.config.batch_size = original_batch_size
            
            self.test_results['performance_metrics'] = {
                'status': 'success',
                'detailed_metrics': performance_data,
                'device': str(self.embedder.config.device)
            }
            
            # 最良パフォーマンスの報告
            successful_tests = {k: v for k, v in performance_data.items() if v['status'] == 'success'}
            if successful_tests:
                best_throughput = max(successful_tests.values(), key=lambda x: x['texts_per_second'])
                self.logger.info(f"✅ Best throughput: {best_throughput['texts_per_second']:.2f} texts/sec")
            
            return True
            
        except Exception as e:
            self.test_results['performance_metrics'] = {
                'status': 'failed',
                'error': str(e)
            }
            self.logger.error(f"❌ Performance metrics test failed: {e}")
            return False
    
    def run_all_tests(self) -> Dict[str, Any]:
        """全テスト実行"""
        
        self.logger.info("🚀 Starting Instructor-XL RAG System Tests")
        self.logger.info("=" * 60)
        
        tests = [
            ("Model Loading", self.test_model_loading),
            ("Embedding Generation", self.test_embedding_generation),
            ("Database Connection", self.test_database_connection),
            ("Document Processing", self.test_document_processing),
            ("Search Functionality", self.test_search_functionality),
            ("Claude Integration", self.test_claude_integration),
            ("Performance Metrics", self.test_performance_metrics)
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test_name, test_func in tests:
            self.logger.info(f"\n🧪 Running {test_name}...")
            
            try:
                if test_func():
                    passed_tests += 1
                    self.logger.info(f"✅ {test_name} PASSED")
                else:
                    self.logger.error(f"❌ {test_name} FAILED")
            except Exception as e:
                self.logger.error(f"❌ {test_name} ERROR: {e}")
        
        # 総合結果
        success_rate = (passed_tests / total_tests) * 100
        
        summary = {
            'total_tests': total_tests,
            'passed_tests': passed_tests,
            'failed_tests': total_tests - passed_tests,
            'success_rate': success_rate,
            'overall_status': 'success' if passed_tests == total_tests else 'partial' if passed_tests > 0 else 'failed',
            'detailed_results': self.test_results,
            'timestamp': time.time()
        }
        
        self.logger.info(f"\n📊 Test Summary:")
        self.logger.info(f"  Total Tests: {total_tests}")
        self.logger.info(f"  Passed: {passed_tests}")
        self.logger.info(f"  Failed: {total_tests - passed_tests}")
        self.logger.info(f"  Success Rate: {success_rate:.1f}%")
        
        if success_rate == 100:
            self.logger.info("🎉 All tests passed! System is ready to use.")
        elif success_rate >= 70:
            self.logger.info("⚠️ Most tests passed. System partially functional.")
        else:
            self.logger.error("❌ Many tests failed. Please check configuration.")
        
        return summary

def main():
    """メイン実行"""
    
    import argparse
    
    parser = argparse.ArgumentParser(description="Instructor-XL RAG System Tester")
    parser.add_argument("--output", help="Output file for test results")
    parser.add_argument("--db-password", help="PostgreSQL password")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    # 環境変数設定
    if args.db_password:
        os.environ["POSTGRES_PASSWORD"] = args.db_password
    
    # ログレベル設定
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # テスト実行
    tester = InstructorXLSystemTester()
    
    try:
        results = tester.run_all_tests()
        
        # 結果出力
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"\n💾 Test results saved to: {args.output}")
        
        # 終了コード
        if results['overall_status'] == 'success':
            return 0
        elif results['overall_status'] == 'partial':
            return 1
        else:
            return 2
        
    except Exception as e:
        print(f"❌ Test execution failed: {e}")
        return 3

if __name__ == "__main__":
    exit(main())