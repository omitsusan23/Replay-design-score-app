import sharp from 'sharp';
import { 
  ColorMetrics, 
  LayoutMetrics, 
  AccessibilityMetrics,
  UIImageMetrics,
  TextMetrics,
  UIElements 
} from '@/types/objective-evaluation';

export class ImageAnalysisService {
  /**
   * 画像URLまたはBase64データから定量的指標を抽出
   */
  static async analyzeUIImage(imageData: string): Promise<Partial<UIImageMetrics>> {
    try {
      const imageBuffer = await this.getImageBuffer(imageData);
      
      // 並列で各種分析を実行
      const [colorMetrics, layoutMetrics, accessibilityMetrics] = await Promise.all([
        this.analyzeColors(imageBuffer),
        this.analyzeLayout(imageBuffer),
        this.analyzeAccessibility(imageBuffer)
      ]);

      return {
        color_metrics: colorMetrics,
        layout_metrics: layoutMetrics,
        accessibility_metrics: accessibilityMetrics,
        // UI要素検出とテキスト分析は後続で実装
        ui_elements: await this.detectUIElements(imageBuffer),
        text_metrics: await this.analyzeText(imageBuffer)
      };
    } catch (error) {
      console.error('Image analysis error:', error);
      throw error;
    }
  }

  /**
   * 画像データをBufferに変換
   */
  private static async getImageBuffer(imageData: string): Promise<Buffer> {
    if (imageData.startsWith('data:image')) {
      // Base64データの場合
      const base64Data = imageData.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    } else if (imageData.startsWith('http')) {
      // URLの場合
      const response = await fetch(imageData);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      throw new Error('Invalid image data format');
    }
  }

  /**
   * 色彩分析
   */
  private static async analyzeColors(imageBuffer: Buffer): Promise<ColorMetrics> {
    const { data, info } = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'inside' }) // パフォーマンスのため縮小
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 色の頻度をカウント
    const colorMap = new Map<string, number>();
    const pixels = data.length / info.channels;

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // 主要な色を抽出（上位10色）
    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const dominantColors = sortedColors.map(([hex, count]) => {
      const rgb = this.hexToRgb(hex);
      return {
        hex,
        rgb: rgb as [number, number, number],
        percentage: (count / pixels) * 100
      };
    });

    // コントラスト比を計算
    const contrastRatios: Record<string, number> = {};
    if (dominantColors.length >= 2) {
      for (let i = 0; i < Math.min(dominantColors.length, 5); i++) {
        for (let j = i + 1; j < Math.min(dominantColors.length, 5); j++) {
          const ratio = this.calculateContrastRatio(
            dominantColors[i].rgb,
            dominantColors[j].rgb
          );
          contrastRatios[`${i}-${j}`] = ratio;
        }
      }
    }

    // 色の調和スコアを計算
    const colorHarmonyScore = this.calculateColorHarmony(dominantColors);

    // 鮮やかさスコアを計算
    const vibrancyScore = this.calculateVibrancy(dominantColors);

    return {
      dominant_colors: dominantColors,
      color_count: colorMap.size,
      contrast_ratios: contrastRatios,
      color_harmony_score: colorHarmonyScore,
      vibrancy_score: vibrancyScore
    };
  }

  /**
   * レイアウト分析
   */
  private static async analyzeLayout(imageBuffer: Buffer): Promise<LayoutMetrics> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    // エッジ検出で構造を分析
    const edges = await image
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // エッジ検出カーネル
      })
      .raw()
      .toBuffer();

    // グリッド整列スコア（エッジの直線性を評価）
    const gridAlignment = this.calculateGridAlignment(edges, metadata.width!, metadata.height!);

    // 空白比率の計算
    const whiteSpaceRatio = await this.calculateWhiteSpaceRatio(imageBuffer);

    // 視覚的階層スコア（要素のサイズ分布を評価）
    const visualHierarchyScore = await this.calculateVisualHierarchy(imageBuffer);

    // バランススコア（左右・上下の重み分布）
    const balanceScore = await this.calculateBalance(imageBuffer);

    // 一貫性スコア（パターンの繰り返しを評価）
    const consistencyScore = 0.75; // 簡易実装

    return {
      grid_alignment: gridAlignment,
      white_space_ratio: whiteSpaceRatio,
      visual_hierarchy_score: visualHierarchyScore,
      balance_score: balanceScore,
      consistency_score: consistencyScore
    };
  }

  /**
   * アクセシビリティ分析
   */
  private static async analyzeAccessibility(imageBuffer: Buffer): Promise<AccessibilityMetrics> {
    const colorMetrics = await this.analyzeColors(imageBuffer);
    
    // 色覚異常対応チェック
    const colorBlindSafe = this.checkColorBlindSafety(colorMetrics.dominant_colors);

    // WCAG準拠度の計算
    let wcagAaCompliant = 0;
    let wcagAaaCompliant = 0;
    let validContrastCount = 0;

    for (const ratio of Object.values(colorMetrics.contrast_ratios)) {
      if (ratio >= 4.5) {
        wcagAaCompliant++;
        validContrastCount++;
      }
      if (ratio >= 7) {
        wcagAaaCompliant++;
      }
    }

    const totalContrasts = Object.keys(colorMetrics.contrast_ratios).length;
    
    return {
      color_blind_safe: colorBlindSafe,
      wcag_aa_compliant: totalContrasts > 0 ? wcagAaCompliant / totalContrasts : 0,
      wcag_aaa_compliant: totalContrasts > 0 ? wcagAaaCompliant / totalContrasts : 0,
      focus_indicators: false, // 静的画像からは判定困難
      alt_text_coverage: 0 // 画像のみからは判定不可
    };
  }

  /**
   * UI要素の検出（簡易実装）
   */
  private static async detectUIElements(imageBuffer: Buffer): Promise<UIElements> {
    // 実際の実装では、機械学習モデルやパターンマッチングを使用
    // ここでは簡易的な実装
    return {
      buttons: 0,
      forms: 0,
      navigation: false,
      cta_prominence: 0.5,
      interactive_elements: 0,
      images: 0,
      icons: 0
    };
  }

  /**
   * テキスト分析（簡易実装）
   */
  private static async analyzeText(imageBuffer: Buffer): Promise<TextMetrics> {
    // 実際の実装では、OCRやテキスト検出を使用
    // ここでは簡易的な実装
    return {
      font_sizes: [],
      line_heights: [],
      text_contrast_scores: [],
      readability_score: 0.7
    };
  }

  // ユーティリティメソッド

  private static hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  }

  private static calculateContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
    const l1 = this.getRelativeLuminance(rgb1);
    const l2 = this.getRelativeLuminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private static getRelativeLuminance(rgb: [number, number, number]): number {
    const [r, g, b] = rgb.map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private static calculateColorHarmony(colors: Array<{ hex: string; rgb: [number, number, number]; percentage: number }>): number {
    // 色相環での角度差を評価
    if (colors.length < 2) return 0.5;
    
    const hues = colors.map(color => {
      const [r, g, b] = color.rgb.map(v => v / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      
      if (delta === 0) return 0;
      
      let hue = 0;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      
      return hue * 60;
    });

    // 補色、類似色、三角配色などのパターンを評価
    let harmonyScore = 0.5;
    
    // 実装を簡略化
    const hueDifferences = [];
    for (let i = 0; i < hues.length - 1; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        hueDifferences.push(Math.abs(hues[i] - hues[j]));
      }
    }

    // 調和的な角度差（30°、60°、120°、180°など）に近いほど高スコア
    const harmonicAngles = [30, 60, 90, 120, 150, 180];
    hueDifferences.forEach(diff => {
      const minDistance = Math.min(...harmonicAngles.map(angle => Math.abs(diff - angle)));
      if (minDistance < 15) {
        harmonyScore += 0.1;
      }
    });

    return Math.min(harmonyScore, 1);
  }

  private static calculateVibrancy(colors: Array<{ hex: string; rgb: [number, number, number]; percentage: number }>): number {
    // 彩度の平均を計算
    const saturations = colors.map(color => {
      const [r, g, b] = color.rgb.map(v => v / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return max === 0 ? 0 : (max - min) / max;
    });

    const avgSaturation = saturations.reduce((a, b) => a + b, 0) / saturations.length;
    return avgSaturation;
  }

  private static calculateGridAlignment(edges: Buffer, width: number, height: number): number {
    // エッジの直線性を評価（簡易実装）
    return 0.8;
  }

  private static async calculateWhiteSpaceRatio(imageBuffer: Buffer): Promise<number> {
    const { data, info } = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let whitePixels = 0;
    const threshold = 240; // RGB値がこれ以上なら白とみなす

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      if (r > threshold && g > threshold && b > threshold) {
        whitePixels++;
      }
    }

    return whitePixels / (info.width * info.height);
  }

  private static async calculateVisualHierarchy(imageBuffer: Buffer): Promise<number> {
    // 要素のサイズ分布を評価（簡易実装）
    return 0.75;
  }

  private static async calculateBalance(imageBuffer: Buffer): Promise<number> {
    // 画像の重心を計算して中心からのずれを評価（簡易実装）
    return 0.85;
  }

  private static checkColorBlindSafety(colors: Array<{ hex: string; rgb: [number, number, number]; percentage: number }>): boolean {
    // 色覚異常シミュレーション（簡易実装）
    // 実際には各種色覚異常のシミュレーションを行い、識別可能性を評価
    return true;
  }
}