import { supabase } from '@/lib/supabase';
import { 
  ObjectiveUIEvaluation, 
  ExternalScores,
  DataCollectionJob 
} from '@/types/objective-evaluation';

interface CollectorConfig {
  platform: string;
  apiEndpoint?: string;
  apiKey?: string;
  rateLimit: number; // requests per minute
  selectors?: { // For web scraping
    title?: string;
    imageUrl?: string;
    likes?: string;
    views?: string;
    saves?: string;
  };
}

export class DataCollectionService {
  private static collectors: Map<string, CollectorConfig> = new Map([
    ['dribbble', {
      platform: 'dribbble',
      apiEndpoint: 'https://api.dribbble.com/v2/shots',
      rateLimit: 60,
      selectors: {
        title: '[data-test="shot-title"]',
        imageUrl: '[data-test="shot-image"] img',
        likes: '[data-test="likes-count"]',
        views: '[data-test="views-count"]',
        saves: '[data-test="saves-count"]'
      }
    }],
    ['behance', {
      platform: 'behance',
      apiEndpoint: 'https://api.behance.net/v2/projects',
      rateLimit: 30,
      selectors: {
        title: '.ProjectCover-title',
        imageUrl: '.ProjectCover-image img',
        likes: '.ProjectCover-appreciations',
        views: '.ProjectCover-views'
      }
    }],
    ['awwwards', {
      platform: 'awwwards',
      rateLimit: 20,
      selectors: {
        title: '.site-name',
        imageUrl: '.site-thumbnail img',
        likes: '.site-votes'
      }
    }]
  ]);

  /**
   * n8nワークフローをトリガーしてデータ収集を開始
   */
  static async triggerN8nWorkflow(
    platform: string,
    webhookUrl: string,
    params?: Record<string, any>
  ): Promise<DataCollectionJob | null> {
    try {
      // データ収集ジョブを作成
      const { data: job, error: jobError } = await supabase
        .from('data_collection_jobs')
        .insert({
          job_type: 'scraping',
          source_platform: platform,
          status: 'pending',
          job_metadata: params
        })
        .select()
        .single();

      if (jobError) {
        console.error('Error creating collection job:', jobError);
        return null;
      }

      // n8nワークフローをトリガー
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: job.id,
          platform,
          ...params
        })
      });

      if (!response.ok) {
        throw new Error(`n8n webhook failed: ${response.statusText}`);
      }

      // ジョブステータスを更新
      await supabase
        .from('data_collection_jobs')
        .update({ 
          status: 'running',
          started_at: new Date().toISOString()
        })
        .eq('id', job.id);

      return job;
    } catch (error) {
      console.error('Error triggering n8n workflow:', error);
      return null;
    }
  }

  /**
   * Playwright経由でのデータ収集設定
   */
  static generatePlaywrightScript(platform: string): string {
    const config = this.collectors.get(platform);
    if (!config || !config.selectors) {
      throw new Error(`No scraping configuration for platform: ${platform}`);
    }

    return `
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function scrape${platform.charAt(0).toUpperCase() + platform.slice(1)}() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // プラットフォーム固有のURLとロジックはここに実装
    const url = getUrlFor${platform}();
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // データ抽出
    const designs = await page.evaluate((selectors) => {
      const items = [];
      // セレクターを使用してデータを抽出
      document.querySelectorAll('.design-item').forEach(item => {
        items.push({
          title: item.querySelector(selectors.title)?.textContent || '',
          imageUrl: item.querySelector(selectors.imageUrl)?.getAttribute('src') || '',
          likes: parseInt(item.querySelector(selectors.likes)?.textContent || '0'),
          views: parseInt(item.querySelector(selectors.views)?.textContent || '0'),
          saves: parseInt(item.querySelector(selectors.saves)?.textContent || '0')
        });
      });
      return items;
    }, ${JSON.stringify(config.selectors)});
    
    // Supabaseに保存
    for (const design of designs) {
      await saveDesignData(design);
    }
    
  } finally {
    await browser.close();
  }
}

async function saveDesignData(design: any) {
  const evaluation = {
    title: design.title,
    source_url: design.url,
    image_url: design.imageUrl,
    design_category: ['ui', 'web-design'], // カテゴリ分類ロジックを追加
    external_scores: {
      platform: '${platform}',
      likes: design.likes,
      views: design.views,
      saves: design.saves
    },
    source_platform: '${platform}'
  };
  
  await supabase
    .from('objective_ui_evaluations')
    .insert(evaluation);
}

scrape${platform.charAt(0).toUpperCase() + platform.slice(1)}();
`;
  }

  /**
   * APIからのデータ収集（Dribbble、Behance等のAPI対応）
   */
  static async collectFromAPI(
    platform: string,
    apiKey: string,
    params?: Record<string, any>
  ): Promise<ObjectiveUIEvaluation[]> {
    const config = this.collectors.get(platform);
    if (!config || !config.apiEndpoint) {
      throw new Error(`No API configuration for platform: ${platform}`);
    }

    const evaluations: ObjectiveUIEvaluation[] = [];

    try {
      const url = new URL(config.apiEndpoint);
      Object.entries(params || {}).forEach(([key, value]) => {
        url.searchParams.append(key, value.toString());
      });

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // プラットフォーム固有のデータ変換
      const items = this.transformAPIResponse(platform, data);
      
      // データベースに保存
      for (const item of items) {
        const evaluation = await this.saveEvaluation(item);
        if (evaluation) {
          evaluations.push(evaluation);
        }
      }

      return evaluations;
    } catch (error) {
      console.error(`Error collecting from ${platform} API:`, error);
      return evaluations;
    }
  }

  /**
   * API応答をObjectiveUIEvaluationフォーマットに変換
   */
  private static transformAPIResponse(
    platform: string,
    data: any
  ): Partial<ObjectiveUIEvaluation>[] {
    switch (platform) {
      case 'dribbble':
        return data.data?.map((shot: any) => ({
          title: shot.title,
          description: shot.description,
          source_url: shot.html_url,
          image_url: shot.images.hidpi || shot.images.normal,
          design_category: shot.tags || [],
          external_scores: {
            platform: 'dribbble',
            likes: shot.likes_count,
            views: shot.views_count,
            saves: shot.saves_count,
            comments: shot.comments_count
          } as ExternalScores,
          source_platform: 'dribbble' as const
        })) || [];

      case 'behance':
        return data.projects?.map((project: any) => ({
          title: project.name,
          description: project.description,
          source_url: project.url,
          image_url: project.covers.original,
          design_category: project.fields?.map((f: any) => f.name) || [],
          external_scores: {
            platform: 'behance',
            appreciations: project.stats.appreciations,
            views: project.stats.views,
            comments: project.stats.comments
          } as ExternalScores,
          source_platform: 'behance' as const
        })) || [];

      default:
        return [];
    }
  }

  /**
   * 評価データをデータベースに保存
   */
  private static async saveEvaluation(
    evaluationData: Partial<ObjectiveUIEvaluation>
  ): Promise<ObjectiveUIEvaluation | null> {
    try {
      // 重複チェック
      const { data: existing } = await supabase
        .from('objective_ui_evaluations')
        .select('id')
        .eq('source_url', evaluationData.source_url!)
        .single();

      if (existing) {
        // 既存データを更新
        const { data, error } = await supabase
          .from('objective_ui_evaluations')
          .update({
            external_scores: evaluationData.external_scores,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        return error ? null : data;
      } else {
        // 新規作成
        const { data, error } = await supabase
          .from('objective_ui_evaluations')
          .insert(evaluationData)
          .select()
          .single();

        return error ? null : data;
      }
    } catch (error) {
      console.error('Error saving evaluation:', error);
      return null;
    }
  }

  /**
   * スケジュールされたデータ収集の実行
   */
  static async runScheduledCollection(platforms: string[]): Promise<void> {
    for (const platform of platforms) {
      const { data: job } = await supabase
        .from('data_collection_jobs')
        .insert({
          job_type: 'api_fetch',
          source_platform: platform,
          status: 'running',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      try {
        // 環境変数からAPIキーを取得
        const apiKey = process.env[`${platform.toUpperCase()}_API_KEY`];
        
        if (apiKey) {
          // API収集
          const evaluations = await this.collectFromAPI(platform, apiKey, {
            per_page: 30,
            sort: 'popular'
          });

          await supabase
            .from('data_collection_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              items_collected: evaluations.length
            })
            .eq('id', job?.id);
        } else {
          // APIキーがない場合はn8n/Playwrightフォールバック
          const webhookUrl = process.env.N8N_WEBHOOK_URL;
          if (webhookUrl) {
            await this.triggerN8nWorkflow(platform, webhookUrl);
          }
        }
      } catch (error) {
        await supabase
          .from('data_collection_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: (error as Error).message
          })
          .eq('id', job?.id);
      }
    }
  }
}