# UI/UX評価アプリ - 社員育成プラットフォーム

## 🎯 プロジェクト概要

社員育成に特化したAI-powered UI/UX評価アプリケーション。Claude/GPTを活用し、具体的なフィードバックで継続的な学習と成長を支援します。

## 🧱 主要機能

### 1. UI提出・評価システム
- Figmaリンクまたは画像アップロード対応
- AI自動採点（7項目×20点満点）
  - 配色・コントラスト
  - 情報整理・密度
  - 視線誘導・ナビゲーション
  - アクセシビリティ
  - UIの一貫性・余白
  - 第一印象・ビジュアルインパクト
  - CTAの明瞭さ

### 2. 成長可視化ダッシュボード
- スコア推移グラフ
- カテゴリ別パフォーマンス
- ベストプラクティス事例
- 改善トレンド分析

### 3. 外部データ自動収集
- UIギャラリーサイトからの自動収集
- AI評価によるベンチマークデータ構築
- Playwright + n8n自動化対応

## 🔧 技術スタック

### Frontend
- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Chart.js + React Charts**
- **React Dropzone**
- **Heroicons**

### Backend & Database
- **Supabase** (PostgreSQL + Auth + Storage)
- **Row Level Security (RLS)**

### AI Integration
- **Claude API** (@anthropic-ai/sdk)
- **OpenAI API**
- 画像解析とテキスト評価

### 自動化 (予定)
- **n8n** (ワークフロー自動化)
- **Playwright** (UIデータ収集)

## 📁 プロジェクト構造

```
/
├── src/app/              # Next.js App Router
├── components/           # React コンポーネント
├── lib/                  # ユーティリティとDB設定
├── services/             # API呼び出しとビジネスロジック
├── types/                # TypeScript型定義
└── utils/                # ヘルパー関数
```

## 🗄️ データベース設計

### profiles
- ユーザー情報とロール管理

### ui_submissions
- UI提出データと評価結果

### external_ui_data
- 外部収集UIデータとベンチマーク

## 🚀 セットアップ

### 1. 環境変数設定
```bash
cp .env.local.example .env.local
# 以下を設定:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
# ANTHROPIC_API_KEY
# OPENAI_API_KEY
```

### 2. Supabaseセットアップ
```sql
-- lib/database.sql を実行
-- RLS、トリガー、ポリシーが自動設定
```

### 3. 開発サーバー起動
```bash
npm install
npm run dev
```

## 🎨 設計思想

### 育成重視アプローチ
- **気づき促進**: 具体的な改善提案
- **成長可視化**: 進歩の定量的追跡
- **継続学習**: ベンチマークとの比較

### AI活用戦略
- **マルチAI**: Claude + GPT併用
- **画像解析**: 視覚的UI評価
- **自然言語フィードバック**: 理解しやすい説明

### スケーラビリティ
- **外部連携**: MCP、API無制限活用
- **自動化**: データ収集から評価まで
- **拡張性**: 新評価軸の追加容易

## 📈 今後の拡張予定

- [ ] Slack/Teams通知連携
- [ ] n8n自動ワークフロー構築
- [ ] ChromaDB ベクトル検索
- [ ] A/Bテスト機能
- [ ] 多言語対応
- [ ] モバイルアプリ化

## 🏗️ 開発方針

**人間主導AI開発**: 構想→設計→実装の役割分担により、効率的かつ高品質な開発を実現。
