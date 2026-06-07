// 下单文本解析。纯函数。格式见 AIREADME/SPEC。
// 红线：解析算法只在 src/core，UI 只调用不内联。

export interface Product {
  id?: number;
  name: string;
  aliases?: string[];
}

export type MatchType = 'exact' | 'alias' | 'fuzzy' | 'none';

export interface ParsedItem {
  rawLine: string;
  /** 归一化后的品名（用于匹配 / 显示）。 */
  productName: string;
  matchedProduct?: Product;
  matchType: MatchType;
  /** 原文尺寸串（保留客户所写，显示于「规格」列）。 */
  rawSpec: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unit: '张' | '卷';
}

export type WarningKind = 'parse-error' | 'product-unmatched';

export interface ParseWarning {
  kind: WarningKind;
  line: string;
  message: string;
}

export interface ParseResult {
  customer?: string;
  items: ParsedItem[];
  warnings: ParseWarning[];
}

/**
 * 全角转半角（ASCII 区 FF01-FF5E + 全角空格 3000），中文与 ×(U+00D7) 保持不变。
 * 该映射逐字符一对一、长度不变，故归一化串与原串索引对齐，可据此回取原文尺寸。
 */
function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

// 归一化后：全角 ＊ｘＸ 已转半角，× 非全角形式单独列入分隔符。
const SEP = '[*×xX]';
const SIZE_RE = new RegExp(`(\\d+)\\s*${SEP}\\s*(\\d+)`);
const QTY_RE = /(\d+)\s*(张|卷)\s*$/;
const CUSTOMER_RE = /^客户\s*[:：]\s*(.+)$/;

function matchProduct(name: string, products: Product[]): { product?: Product; type: MatchType } {
  let p = products.find((x) => x.name === name);
  if (p) return { product: p, type: 'exact' };

  p = products.find((x) => x.aliases?.includes(name));
  if (p) return { product: p, type: 'alias' };

  // 模糊：互相包含（品名是产品名子串，或反之）
  p = products.find((x) => x.name.includes(name) || name.includes(x.name));
  if (p) return { product: p, type: 'fuzzy' };

  return { type: 'none' };
}

/**
 * 解析下单文本：首行可选「客户：X」；其后每行「品名 尺寸 数量」。
 * 尺寸毫米，分隔符 * × x X 全 / 半角；数量带单位 张 / 卷（中间可空格）。
 * 品名匹配 精确 → 别名 → 模糊；匹配不到产出 warning（仅当传入 products 时）。
 */
export function parseOrder(text: string, products: Product[] = []): ParseResult {
  const result: ParseResult = { items: [], warnings: [] };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const rawLine of lines) {
    const norm = toHalfWidth(rawLine);

    const cust = norm.match(CUSTOMER_RE);
    if (cust) {
      result.customer = cust[1].trim();
      continue;
    }

    const sizeM = norm.match(SIZE_RE);
    const qtyM = norm.match(QTY_RE);
    if (!sizeM || sizeM.index === undefined || !qtyM) {
      result.warnings.push({
        kind: 'parse-error',
        line: rawLine,
        message: '无法解析为「品名 尺寸 数量」，请检查格式',
      });
      continue;
    }

    const widthMm = Number(sizeM[1]);
    const heightMm = Number(sizeM[2]);
    const qty = Number(qtyM[1]);
    const unit = qtyM[2] as '张' | '卷';

    // 索引对齐，回原文取尺寸串（保留客户原写法）
    const rawSpec = rawLine.slice(sizeM.index, sizeM.index + sizeM[0].length).trim();
    const productName = norm.slice(0, sizeM.index).trim();

    const { product, type } = matchProduct(productName, products);
    if (products.length > 0 && type === 'none') {
      result.warnings.push({
        kind: 'product-unmatched',
        line: rawLine,
        message: `品名「${productName}」未匹配到产品，请手选或先建产品`,
      });
    }

    result.items.push({
      rawLine,
      productName,
      matchedProduct: product,
      matchType: type,
      rawSpec,
      widthMm,
      heightMm,
      qty,
      unit,
    });
  }

  return result;
}
