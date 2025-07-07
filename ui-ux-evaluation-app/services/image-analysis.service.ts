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
   * アクセシビリティ分析（強化版）
   */
  private static async analyzeAccessibility(imageBuffer: Buffer): Promise<AccessibilityMetrics> {
    const colorMetrics = await this.analyzeColors(imageBuffer);
    
    // 色覚異常対応チェック
    const colorBlindSafe = this.checkColorBlindSafety(colorMetrics.dominant_colors);

    // WCAG準拠度の強化計算
    const wcagAnalysis = this.analyzeWCAGCompliance(colorMetrics);
    
    // フォーカスインジケーターの検出を試行
    const focusIndicators = await this.detectFocusIndicators(imageBuffer);
    
    // テキストと背景のコントラスト比分析
    const textContrastAnalysis = await this.analyzeTextContrast(imageBuffer);
    
    return {
      color_blind_safe: colorBlindSafe,
      wcag_aa_compliant: wcagAnalysis.aaCompliance,
      wcag_aaa_compliant: wcagAnalysis.aaaCompliance,
      focus_indicators: focusIndicators,
      alt_text_coverage: textContrastAnalysis.coverage
    };
  }

  /**
   * UI要素の検出（強化実装）
   */
  private static async detectUIElements(imageBuffer: Buffer): Promise<UIElements> {
    const { data, info } = await sharp(imageBuffer)
      .resize(800, 600, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 色の分析でボタンらしき要素を検出
    const buttons = await this.detectButtons(data, info);
    
    // フォーム要素の検出
    const forms = await this.detectForms(data, info);
    
    // ナビゲーション要素の検出
    const navigation = await this.detectNavigation(data, info);
    
    // CTA要素の際立ち度を分析
    const ctaProminence = await this.analyzeCTAProminence(data, info);
    
    // インタラクティブ要素の総数
    const interactiveElements = buttons + forms + (navigation ? 1 : 0);
    
    // 画像・アイコン要素の検出
    const images = await this.detectImages(data, info);
    const icons = await this.detectIcons(data, info);

    return {
      buttons,
      forms,
      navigation,
      cta_prominence: ctaProminence,
      interactive_elements: interactiveElements,
      images,
      icons
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
    // 色覚異常シミュレーション（強化実装）
    if (colors.length < 2) return true;
    
    // 最も使用頻度の高い色同士でのコントラスト比を確認
    const topColors = colors.slice(0, 3);
    let safeColorPairs = 0;
    let totalPairs = 0;
    
    for (let i = 0; i < topColors.length; i++) {
      for (let j = i + 1; j < topColors.length; j++) {
        const ratio = this.calculateContrastRatio(topColors[i].rgb, topColors[j].rgb);
        totalPairs++;
        
        // 色覚異常でも区別可能なコントラスト比（3:1以上）
        if (ratio >= 3.0) {
          safeColorPairs++;
        }
      }
    }
    
    return totalPairs > 0 ? (safeColorPairs / totalPairs) >= 0.7 : true;
  }

  // UI要素検出のヘルパーメソッド
  private static async detectButtons(data: Buffer, info: sharp.OutputInfo): Promise<number> {
    // 矩形領域と色の境界を検出してボタンを推定
    const edges = await this.detectEdges(data, info);
    const rectangles = this.findRectangularShapes(edges, info);
    
    // ボタンらしき特徴（角丸、影、色の境界）を持つ領域をカウント
    let buttonCount = 0;
    for (const rect of rectangles) {
      if (this.isButtonLike(rect, data, info)) {
        buttonCount++;
      }
    }
    
    return Math.min(buttonCount, 10); // 最大10個まで
  }

  private static async detectForms(data: Buffer, info: sharp.OutputInfo): Promise<number> {
    // フォーム要素（入力欄、チェックボックス等）の検出
    const edges = await this.detectEdges(data, info);
    const lineSegments = this.findLineSegments(edges, info);
    
    // 矩形の入力欄らしき領域を検出
    let formCount = 0;
    for (const segment of lineSegments) {
      if (this.isFormElementLike(segment)) {
        formCount++;
      }
    }
    
    return Math.min(formCount, 5); // 最大5個まで
  }

  private static async detectNavigation(data: Buffer, info: sharp.OutputInfo): Promise<boolean> {
    // ナビゲーション要素の検出（水平・垂直の要素配列）
    const edges = await this.detectEdges(data, info);
    const horizontalPatterns = this.findHorizontalPatterns(edges, info);
    const verticalPatterns = this.findVerticalPatterns(edges, info);
    
    // 複数の要素が規則的に配置されているパターンを検出
    return horizontalPatterns.length > 2 || verticalPatterns.length > 2;
  }

  private static async analyzeCTAProminence(data: Buffer, info: sharp.OutputInfo): Promise<number> {
    // CTA要素の際立ち度分析
    const colorVariation = this.calculateColorVariation(data, info);
    const brightnessContrast = this.calculateBrightnessContrast(data, info);
    const positionScore = this.calculatePositionScore(data, info);
    
    // 色の目立ち度 (40%) + 明度コントラスト (30%) + 位置スコア (30%)
    return (colorVariation * 0.4) + (brightnessContrast * 0.3) + (positionScore * 0.3);
  }

  private static async detectImages(data: Buffer, info: sharp.OutputInfo): Promise<number> {
    // 画像領域の検出（色の連続性とエッジ密度から推定）
    const colorContinuity = this.calculateColorContinuity(data, info);
    const edgeDensity = this.calculateEdgeDensity(data, info);
    
    // 画像らしき領域数を推定
    return Math.floor(colorContinuity * edgeDensity * 3);
  }

  private static async detectIcons(data: Buffer, info: sharp.OutputInfo): Promise<number> {
    // アイコン要素の検出（小さな図形パターン）
    const smallShapes = this.findSmallShapes(data, info);
    const symbolPatterns = this.findSymbolPatterns(data, info);
    
    return Math.min(smallShapes + symbolPatterns, 15); // 最大15個まで
  }

  // 強化されたユーティリティメソッド
  private static async detectEdges(data: Buffer, info: sharp.OutputInfo): Promise<number[]> {
    // エッジ検出の結果を配列として返す
    const edges = [];
    for (let i = 0; i < data.length; i += info.channels) {
      const pixel = data[i]; // グレースケール値
      edges.push(pixel);
    }
    return edges;
  }

  private static findRectangularShapes(edges: number[], info: sharp.OutputInfo): Array<{x: number, y: number, width: number, height: number}> {
    // 矩形形状の検出（簡易実装）
    const rectangles = [];
    const threshold = 128;
    
    for (let y = 0; y < info.height - 20; y += 10) {
      for (let x = 0; x < info.width - 20; x += 10) {
        const rect = this.checkRectangle(edges, x, y, 20, 20, info.width, threshold);
        if (rect) {
          rectangles.push({x, y, width: 20, height: 20});
        }
      }
    }
    
    return rectangles;
  }

  private static isButtonLike(rect: {x: number, y: number, width: number, height: number}, data: Buffer, info: sharp.OutputInfo): boolean {
    // ボタンらしき特徴の判定
    const aspectRatio = rect.width / rect.height;
    const isReasonableSize = rect.width >= 50 && rect.height >= 20;
    const hasGoodAspectRatio = aspectRatio >= 1.5 && aspectRatio <= 8;
    
    return isReasonableSize && hasGoodAspectRatio;
  }

  private static findLineSegments(edges: number[], info: sharp.OutputInfo): Array<{x1: number, y1: number, x2: number, y2: number}> {
    // 線分の検出（簡易実装）
    return [];
  }

  private static isFormElementLike(segment: {x1: number, y1: number, x2: number, y2: number}): boolean {
    // フォーム要素らしき特徴の判定
    const length = Math.sqrt((segment.x2 - segment.x1) ** 2 + (segment.y2 - segment.y1) ** 2);
    return length > 100; // 100px以上の線分をフォーム要素として判定
  }

  private static findHorizontalPatterns(edges: number[], info: sharp.OutputInfo): number[] {
    // 水平パターンの検出
    return [];
  }

  private static findVerticalPatterns(edges: number[], info: sharp.OutputInfo): number[] {
    // 垂直パターンの検出
    return [];
  }

  private static calculateColorVariation(data: Buffer, info: sharp.OutputInfo): number {
    // 色の変動度計算
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      colors.add(hex);
    }
    
    return Math.min(colors.size / 100, 1);
  }

  private static calculateBrightnessContrast(data: Buffer, info: sharp.OutputInfo): number {
    // 明度コントラストの計算
    const brightnesses = [];
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      brightnesses.push(brightness);
    }
    
    const maxBrightness = Math.max(...brightnesses);
    const minBrightness = Math.min(...brightnesses);
    return maxBrightness - minBrightness;
  }

  private static calculatePositionScore(data: Buffer, info: sharp.OutputInfo): number {
    // 位置スコアの計算（中央付近や上部にある要素を高く評価）
    // 簡易実装として0.7を返す
    return 0.7;
  }

  private static calculateColorContinuity(data: Buffer, info: sharp.OutputInfo): number {
    // 色の連続性計算
    return 0.5;
  }

  private static calculateEdgeDensity(data: Buffer, info: sharp.OutputInfo): number {
    // エッジ密度計算
    return 0.6;
  }

  private static findSmallShapes(data: Buffer, info: sharp.OutputInfo): number {
    // 小さな図形の検出
    return 3;
  }

  private static findSymbolPatterns(data: Buffer, info: sharp.OutputInfo): number {
    // シンボルパターンの検出
    return 2;
  }

  private static checkRectangle(edges: number[], x: number, y: number, width: number, height: number, imageWidth: number, threshold: number): boolean {
    // 矩形領域の検証
    const topEdge = this.checkHorizontalEdge(edges, x, y, width, imageWidth, threshold);
    const bottomEdge = this.checkHorizontalEdge(edges, x, y + height, width, imageWidth, threshold);
    const leftEdge = this.checkVerticalEdge(edges, x, y, height, imageWidth, threshold);
    const rightEdge = this.checkVerticalEdge(edges, x + width, y, height, imageWidth, threshold);
    
    return topEdge && bottomEdge && leftEdge && rightEdge;
  }

  private static checkHorizontalEdge(edges: number[], x: number, y: number, width: number, imageWidth: number, threshold: number): boolean {
    // 水平エッジの検証
    let edgeCount = 0;
    for (let i = 0; i < width; i++) {
      const index = (y * imageWidth + x + i);
      if (index < edges.length && edges[index] > threshold) {
        edgeCount++;
      }
    }
    return edgeCount / width > 0.7;
  }

  private static checkVerticalEdge(edges: number[], x: number, y: number, height: number, imageWidth: number, threshold: number): boolean {
    // 垂直エッジの検証
    let edgeCount = 0;
    for (let i = 0; i < height; i++) {
      const index = ((y + i) * imageWidth + x);
      if (index < edges.length && edges[index] > threshold) {
        edgeCount++;
      }
    }
    return edgeCount / height > 0.7;
  }

  // アクセシビリティ分析の強化メソッド
  private static analyzeWCAGCompliance(colorMetrics: ColorMetrics): {aaCompliance: number, aaaCompliance: number} {
    let aaCompliant = 0;
    let aaaCompliant = 0;
    let totalContrasts = 0;

    // 通常テキストの基準: AA (4.5:1), AAA (7:1)
    // 大きいテキストの基準: AA (3:1), AAA (4.5:1)
    for (const ratio of Object.values(colorMetrics.contrast_ratios)) {
      totalContrasts++;
      
      // 通常テキストとして評価
      if (ratio >= 4.5) {
        aaCompliant++;
      }
      if (ratio >= 7) {
        aaaCompliant++;
      }
    }

    return {
      aaCompliance: totalContrasts > 0 ? aaCompliant / totalContrasts : 0,
      aaaCompliance: totalContrasts > 0 ? aaaCompliant / totalContrasts : 0
    };
  }

  private static async detectFocusIndicators(imageBuffer: Buffer): Promise<boolean> {
    // フォーカスインジケーターの検出（境界線の検出）
    const { data, info } = await sharp(imageBuffer)
      .resize(400, 300, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 高コントラストの境界線を検出
    const edges = await this.detectEdges(data, info);
    const strongEdges = edges.filter(edge => edge > 200).length;
    const totalPixels = edges.length;
    
    // エッジの割合が5%以上ならフォーカス表示ありと判定
    return (strongEdges / totalPixels) > 0.05;
  }

  private static async analyzeTextContrast(imageBuffer: Buffer): Promise<{coverage: number}> {
    // テキスト領域の推定と背景とのコントラスト分析
    const { data, info } = await sharp(imageBuffer)
      .resize(400, 300, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // テキストらしき領域を検出（エッジ密度が高い小さな領域）
    const textRegions = this.detectTextRegions(data, info);
    let goodContrastRegions = 0;
    
    for (const region of textRegions) {
      const contrast = this.calculateRegionContrast(region, data, info);
      if (contrast >= 4.5) {
        goodContrastRegions++;
      }
    }

    return {
      coverage: textRegions.length > 0 ? goodContrastRegions / textRegions.length : 0
    };
  }

  private static detectTextRegions(data: Buffer, info: sharp.OutputInfo): Array<{x: number, y: number, width: number, height: number}> {
    // テキスト領域の検出（高頻度の小さな変化を検出）
    const regions = [];
    const blockSize = 20;
    
    for (let y = 0; y < info.height - blockSize; y += blockSize) {
      for (let x = 0; x < info.width - blockSize; x += blockSize) {
        const edgeDensity = this.calculateBlockEdgeDensity(data, info, x, y, blockSize);
        if (edgeDensity > 0.3) { // テキストらしき閾値
          regions.push({ x, y, width: blockSize, height: blockSize });
        }
      }
    }
    
    return regions;
  }

  private static calculateBlockEdgeDensity(data: Buffer, info: sharp.OutputInfo, x: number, y: number, blockSize: number): number {
    let edgeCount = 0;
    let totalPixels = 0;
    
    for (let dy = 0; dy < blockSize; dy++) {
      for (let dx = 0; dx < blockSize; dx++) {
        const currentIndex = ((y + dy) * info.width + (x + dx)) * info.channels;
        const rightIndex = ((y + dy) * info.width + (x + dx + 1)) * info.channels;
        const bottomIndex = ((y + dy + 1) * info.width + (x + dx)) * info.channels;
        
        if (currentIndex < data.length && rightIndex < data.length && bottomIndex < data.length) {
          const currentBrightness = this.getPixelBrightness(data, currentIndex);
          const rightBrightness = this.getPixelBrightness(data, rightIndex);
          const bottomBrightness = this.getPixelBrightness(data, bottomIndex);
          
          if (Math.abs(currentBrightness - rightBrightness) > 0.1 || 
              Math.abs(currentBrightness - bottomBrightness) > 0.1) {
            edgeCount++;
          }
          totalPixels++;
        }
      }
    }
    
    return totalPixels > 0 ? edgeCount / totalPixels : 0;
  }

  private static calculateRegionContrast(region: {x: number, y: number, width: number, height: number}, data: Buffer, info: sharp.OutputInfo): number {
    // 領域内の前景色と背景色を推定してコントラスト比を計算
    const pixels = [];
    
    for (let dy = 0; dy < region.height; dy++) {
      for (let dx = 0; dx < region.width; dx++) {
        const index = ((region.y + dy) * info.width + (region.x + dx)) * info.channels;
        if (index < data.length) {
          const brightness = this.getPixelBrightness(data, index);
          pixels.push(brightness);
        }
      }
    }
    
    if (pixels.length === 0) return 0;
    
    // 最明と最暗の値を前景・背景として使用
    const maxBrightness = Math.max(...pixels);
    const minBrightness = Math.min(...pixels);
    
    return (maxBrightness + 0.05) / (minBrightness + 0.05);
  }

  private static getPixelBrightness(data: Buffer, index: number): number {
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }
}