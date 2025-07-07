import { NextRequest, NextResponse } from 'next/server';
import { DataCollectionService } from '@/services/data-collection.service';

export async function POST(request: NextRequest) {
  try {
    const { platform, webhookUrl, apiKey } = await request.json();

    if (!platform) {
      return NextResponse.json(
        { error: 'Platform is required' },
        { status: 400 }
      );
    }

    // APIキーが提供されている場合はAPI収集を使用
    if (apiKey) {
      const evaluations = await DataCollectionService.collectFromAPI(
        platform,
        apiKey,
        { per_page: 50, sort: 'popular' }
      );

      return NextResponse.json({
        success: true,
        method: 'api',
        itemsCollected: evaluations.length,
        evaluations: evaluations.slice(0, 10) // 最初の10件のみ返す
      });
    }

    // n8nワークフローをトリガー
    if (webhookUrl) {
      const job = await DataCollectionService.triggerN8nWorkflow(
        platform,
        webhookUrl
      );

      if (job) {
        return NextResponse.json({
          success: true,
          method: 'n8n',
          jobId: job.id,
          status: job.status
        });
      }
    }

    return NextResponse.json(
      { error: 'Either API key or webhook URL is required' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Data collection error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger data collection' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');

    // Playwrightスクリプトを生成
    if (platform) {
      const script = DataCollectionService.generatePlaywrightScript(platform);
      
      return new NextResponse(script, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${platform}-scraper.ts"`
        }
      });
    }

    return NextResponse.json(
      { error: 'Platform parameter is required' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Script generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate script' },
      { status: 500 }
    );
  }
}