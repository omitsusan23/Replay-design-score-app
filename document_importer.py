#!/usr/bin/env python3
"""
ドキュメント埋め込み登録スクリプト
Markdownファイル、JSONファイル、既存データからの一括インポート
"""

import os
import json
import glob
from pathlib import Path
import argparse
from typing import List, Dict, Any
import logging
from datetime import datetime

# 自作モジュールのインポート
from instructor_xl_embeddings import (
    EmbeddingConfig, 
    DatabaseConfig, 
    InstructorXLEmbedder, 
    RAGDocumentProcessor
)

class DocumentImporter:
    """ドキュメント一括インポートクラス"""
    
    def __init__(self, processor: RAGDocumentProcessor):
        self.processor = processor
        self.logger = self._setup_logger()
        self.imported_count = 0
        self.failed_count = 0
    
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("document_importer")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def import_from_markdown_files(self, directory: str, pattern: str = "*.md") -> None:
        """Markdownファイルからの一括インポート"""
        
        md_files = glob.glob(os.path.join(directory, "**", pattern), recursive=True)
        self.logger.info(f"📁 Found {len(md_files)} markdown files in {directory}")
        
        for md_file in md_files:
            try:
                self._import_markdown_file(md_file)
            except Exception as e:
                self.logger.error(f"❌ Failed to import {md_file}: {e}")
                self.failed_count += 1
    
    def _import_markdown_file(self, file_path: str) -> None:
        """単一Markdownファイルのインポート"""
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # ファイル名からタイトルを抽出
        file_name = Path(file_path).stem
        title = file_name.replace('-', ' ').replace('_', ' ').title()
        
        # UI種別の推測（ファイル名やディレクトリから）
        ui_type = self._extract_ui_type_from_path(file_path)
        
        # キーワードの抽出（ファイル名、ディレクトリ名から）
        keywords = self._extract_keywords_from_path(file_path)
        
        # メタデータ
        description = f"Markdownドキュメント: {title}"
        paste_context = {
            "source_type": "markdown",
            "file_path": file_path,
            "imported_at": datetime.now().isoformat()
        }
        
        # Claude評価の基本値
        claude_evaluation = {
            "consistency_score": 0.75,
            "quality": {
                "reusability": "中",
                "maintainability": "高",
                "accessibility": "中"
            },
            "improvements": ["Markdownの構造化"],
            "ui_classification": {
                "primary_type": ui_type,
                "secondary_types": ["documentation"]
            }
        }
        
        # ドキュメント処理・保存
        doc_data = self.processor.process_document(
            title=title,
            ui_type=ui_type,
            description=description,
            content=content,
            keywords=keywords,
            source_url=f"file://{file_path}",
            paste_context=paste_context,
            claude_evaluation=claude_evaluation
        )
        
        doc_id = self.processor.save_to_database(doc_data)
        self.logger.info(f"✅ Imported: {title} (ID: {doc_id})")
        self.imported_count += 1
    
    def import_from_json_file(self, json_file: str) -> None:
        """JSONファイルからの一括インポート"""
        
        self.logger.info(f"📄 Importing from JSON: {json_file}")
        
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # JSONの形式に応じて処理
        if isinstance(data, list):
            documents = data
        elif isinstance(data, dict) and 'documents' in data:
            documents = data['documents']
        else:
            raise ValueError("Unsupported JSON format")
        
        for doc in documents:
            try:
                self._import_json_document(doc)
            except Exception as e:
                self.logger.error(f"❌ Failed to import document: {e}")
                self.failed_count += 1
    
    def _import_json_document(self, doc_data: Dict[str, Any]) -> None:
        """単一JSONドキュメントのインポート"""
        
        # 必須フィールドの確認
        required_fields = ['title', 'ui_type', 'content']
        for field in required_fields:
            if field not in doc_data:
                raise ValueError(f"Missing required field: {field}")
        
        # Claude評価のデフォルト設定
        claude_evaluation = doc_data.get('claude_evaluation', {
            "consistency_score": 0.8,
            "quality": {
                "reusability": "中",
                "maintainability": "中",
                "accessibility": "中"
            },
            "improvements": [],
            "ui_classification": {
                "primary_type": doc_data['ui_type'],
                "secondary_types": []
            }
        })
        
        # ドキュメント処理・保存
        processed_doc = self.processor.process_document(
            title=doc_data['title'],
            ui_type=doc_data['ui_type'],
            description=doc_data.get('description', ''),
            content=doc_data['content'],
            keywords=doc_data.get('keywords', []),
            source_url=doc_data.get('source_url'),
            paste_context=doc_data.get('paste_context', {}),
            claude_evaluation=claude_evaluation
        )
        
        doc_id = self.processor.save_to_database(processed_doc)
        self.logger.info(f"✅ Imported: {doc_data['title']} (ID: {doc_id})")
        self.imported_count += 1
    
    def import_ui_component_library(self, library_name: str) -> None:
        """UIコンポーネントライブラリの定義済みデータインポート"""
        
        # 有名UIライブラリのサンプルデータ
        component_libraries = {
            "bootstrap": self._get_bootstrap_components(),
            "material-ui": self._get_material_ui_components(),
            "tailwind": self._get_tailwind_components(),
            "ant-design": self._get_ant_design_components()
        }
        
        if library_name.lower() not in component_libraries:
            raise ValueError(f"Unsupported library: {library_name}")
        
        components = component_libraries[library_name.lower()]
        self.logger.info(f"📚 Importing {len(components)} components from {library_name}")
        
        for component in components:
            try:
                self._import_json_document(component)
            except Exception as e:
                self.logger.error(f"❌ Failed to import {component.get('title', 'unknown')}: {e}")
                self.failed_count += 1
    
    def _extract_ui_type_from_path(self, file_path: str) -> str:
        """ファイルパスからUI種別を推測"""
        
        path_lower = file_path.lower()
        
        # ディレクトリ名やファイル名から UI種別を推測
        if 'navigation' in path_lower or 'nav' in path_lower:
            return 'navigation'
        elif 'form' in path_lower or 'input' in path_lower:
            return 'form'
        elif 'card' in path_lower:
            return 'card'
        elif 'button' in path_lower:
            return 'button'
        elif 'modal' in path_lower or 'dialog' in path_lower:
            return 'modal'
        elif 'table' in path_lower or 'grid' in path_lower:
            return 'table'
        elif 'chart' in path_lower or 'graph' in path_lower:
            return 'chart'
        else:
            return 'component'
    
    def _extract_keywords_from_path(self, file_path: str) -> List[str]:
        """ファイルパスからキーワードを抽出"""
        
        path_parts = Path(file_path).parts
        keywords = []
        
        # ディレクトリ名とファイル名からキーワード抽出
        for part in path_parts:
            if part.endswith('.md'):
                part = part[:-3]  # .md を除去
            
            # ハイフンやアンダースコアで分割
            words = part.replace('-', ' ').replace('_', ' ').split()
            keywords.extend(words)
        
        # 重複除去と小文字化
        keywords = list(set([k.lower() for k in keywords if len(k) > 2]))
        
        return keywords
    
    def _get_bootstrap_components(self) -> List[Dict[str, Any]]:
        """Bootstrapコンポーネントのサンプルデータ"""
        
        return [
            {
                "title": "Bootstrap Alert Component",
                "ui_type": "alert",
                "description": "ユーザーへの重要なメッセージ表示用のアラートコンポーネント",
                "content": """<div class="alert alert-primary" role="alert">
  A simple primary alert—check it out!
</div>
<div class="alert alert-secondary" role="alert">
  A simple secondary alert—check it out!
</div>
<div class="alert alert-success" role="alert">
  A simple success alert—check it out!
</div>""",
                "keywords": ["bootstrap", "alert", "notification", "message"],
                "source_url": "https://getbootstrap.com/docs/5.0/components/alerts/",
                "paste_context": {
                    "library": "bootstrap",
                    "version": "5.0"
                }
            },
            {
                "title": "Bootstrap Navbar",
                "ui_type": "navigation",
                "description": "レスポンシブなナビゲーションバーコンポーネント",
                "content": """<nav class="navbar navbar-expand-lg navbar-light bg-light">
  <div class="container-fluid">
    <a class="navbar-brand" href="#">Navbar</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav">
        <li class="nav-item">
          <a class="nav-link active" href="#">Home</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#">Features</a>
        </li>
      </ul>
    </div>
  </div>
</nav>""",
                "keywords": ["bootstrap", "navbar", "navigation", "responsive"],
                "source_url": "https://getbootstrap.com/docs/5.0/components/navbar/"
            }
        ]
    
    def _get_material_ui_components(self) -> List[Dict[str, Any]]:
        """Material-UIコンポーネントのサンプルデータ"""
        
        return [
            {
                "title": "Material-UI Button",
                "ui_type": "button",
                "description": "Material Designのボタンコンポーネント",
                "content": """import Button from '@mui/material/Button';

<Button variant="contained">Contained</Button>
<Button variant="outlined">Outlined</Button>
<Button variant="text">Text</Button>""",
                "keywords": ["material-ui", "mui", "button", "react"],
                "source_url": "https://mui.com/components/buttons/"
            }
        ]
    
    def _get_tailwind_components(self) -> List[Dict[str, Any]]:
        """Tailwind CSSコンポーネントのサンプルデータ"""
        
        return [
            {
                "title": "Tailwind CSS Card",
                "ui_type": "card",
                "description": "Tailwind CSSで作成されたカードコンポーネント",
                "content": """<div class="max-w-sm rounded overflow-hidden shadow-lg">
  <img class="w-full" src="/img/card-top.jpg" alt="Sunset in the mountains">
  <div class="px-6 py-4">
    <div class="font-bold text-xl mb-2">The Coldest Sunset</div>
    <p class="text-gray-700 text-base">
      Lorem ipsum dolor sit amet, consectetur adipisicing elit.
    </p>
  </div>
  <div class="px-6 pt-4 pb-2">
    <span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">#photography</span>
  </div>
</div>""",
                "keywords": ["tailwind", "css", "card", "utility-first"],
                "source_url": "https://tailwindcss.com/components"
            }
        ]
    
    def _get_ant_design_components(self) -> List[Dict[str, Any]]:
        """Ant Designコンポーネントのサンプルデータ"""
        
        return [
            {
                "title": "Ant Design Table",
                "ui_type": "table",
                "description": "Ant Designのデータテーブルコンポーネント",
                "content": """import { Table } from 'antd';

const columns = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: 'Age',
    dataIndex: 'age',
    key: 'age',
  },
  {
    title: 'Address',
    dataIndex: 'address',
    key: 'address',
  },
];

<Table dataSource={dataSource} columns={columns} />""",
                "keywords": ["ant-design", "antd", "table", "react"],
                "source_url": "https://ant.design/components/table"
            }
        ]
    
    def get_import_summary(self) -> Dict[str, int]:
        """インポート結果のサマリーを取得"""
        
        return {
            "imported": self.imported_count,
            "failed": self.failed_count,
            "total": self.imported_count + self.failed_count
        }

def main():
    """CLI メイン処理"""
    
    parser = argparse.ArgumentParser(description="Document Importer for Instructor-XL RAG")
    parser.add_argument("--source", required=True, choices=["markdown", "json", "library"], 
                       help="Import source type")
    parser.add_argument("--path", help="Path to source directory or file")
    parser.add_argument("--library", help="UI library name (bootstrap, material-ui, tailwind, ant-design)")
    parser.add_argument("--pattern", default="*.md", help="File pattern for markdown import")
    parser.add_argument("--db-password", help="PostgreSQL password")
    
    args = parser.parse_args()
    
    # 設定
    embedding_config = EmbeddingConfig()
    db_config = DatabaseConfig(
        password=args.db_password or os.getenv("POSTGRES_PASSWORD", "")
    )
    
    # 初期化
    embedder = InstructorXLEmbedder(embedding_config)
    processor = RAGDocumentProcessor(db_config, embedder)
    importer = DocumentImporter(processor)
    
    # インポート実行
    try:
        if args.source == "markdown":
            if not args.path:
                raise ValueError("--path is required for markdown import")
            importer.import_from_markdown_files(args.path, args.pattern)
            
        elif args.source == "json":
            if not args.path:
                raise ValueError("--path is required for json import")
            importer.import_from_json_file(args.path)
            
        elif args.source == "library":
            if not args.library:
                raise ValueError("--library is required for library import")
            importer.import_ui_component_library(args.library)
            
        # 結果表示
        summary = importer.get_import_summary()
        print(f"\n📊 Import Summary:")
        print(f"   ✅ Imported: {summary['imported']}")
        print(f"   ❌ Failed:   {summary['failed']}")
        print(f"   📈 Total:    {summary['total']}")
        
    except Exception as e:
        print(f"❌ Import failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())