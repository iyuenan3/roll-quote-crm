// 下单文本解析。纯函数。格式见 AIREADME/SPEC。
// 红线：解析算法只在 src/core，UI 只调用不内联。

export interface Product {
  id?: number;
  name: string;
  aliases?: string[];
}

export type MatchType = 'exact' | 'alias' | 'fuzzy' | 'ambiguous' | 'none';

export interface ParsedItem {
  rawLine: string;
  /** 归一化后的品名（用于匹配 / 显示）。 */
  productName: string;
  matchedProduct?: Product;
  matchType: MatchType;
  /** matchType=ambiguous 时的候选产品，供 UI 让商家手选。 */
  candidates?: Product[];
  /** 原文尺寸串（保留客户所写，显示于「规格」列）。 */
  rawSpec: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unit: '张' | '卷';
}

export type WarningKind = 'parse-error' | 'product-unmatched' | 'product-ambiguous';

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
// 数字模式容许小数，目的是「检测到小数后明确报错」，而非用 \d+ 静默截断（SPEC：尺寸毫米、数量整数）。
const SIZE_RE_G = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${SEP}\\s*(\\d+(?:\\.\\d+)?)`, 'g');
const QTY_RE = /(\d+(?:\.\d+)?)\s*(张|卷)\s*$/;
const CUSTOMER_RE = /^客户\s*[:：]\s*(.+)$/;

interface MatchOutcome {
  product?: Product;
  candidates?: Product[];
  type: MatchType;
}

function matchProduct(name: string, products: Product[]): MatchOutcome {
  if (!name) return { type: 'none' }; // 空品名绝不匹配（否则 name.includes('') 恒真会误绑首个产品）

  let p = products.find((x) => x.name === name);
  if (p) return { product: p, type: 'exact' };

  p = products.find((x) => x.aliases?.includes(name));
  if (p) return { product: p, type: 'alias' };

  // 模糊：互相包含。命中多于一个视为歧义，交商家手选，绝不静默取首个。
  const fuzzy = products.filter((x) => x.name.includes(name) || name.includes(x.name));
  if (fuzzy.length === 1) return { product: fuzzy[0], type: 'fuzzy' };
  if (fuzzy.length > 1) return { candidates: fuzzy, type: 'ambiguous' };

  return { type: 'none' };
}

/**
 * 解析下单文本：首行可选「客户：X」；其后每行「品名 尺寸 数量」。
 * 尺寸毫米（整数），分隔符 * × x X 全 / 半角；数量为整数 + 单位 张 / 卷（中间可空格）。
 * 解析策略：先用行尾「数字+单位」定位数量，再在「数量之前」取最后一个尺寸 token
 * （尺寸恒在品名后、数量前，可避免品名内 数字x数字 被误当尺寸）。
 * 小数尺寸 / 小数数量 / 缺品名 一律产 parse-error，绝不静默猜值。
 * 品名匹配 精确 → 别名 → 模糊（多命中=歧义）；未命中 / 歧义 在传入 products 时产 warning。
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

    // 1) 数量：行尾「数字 + 单位」
    const qtyM = norm.match(QTY_RE);
    if (!qtyM || qtyM.index === undefined) {
      result.warnings.push({ kind: 'parse-error', line: rawLine, message: '行尾缺少数量或单位（张 / 卷）' });
      continue;
    }
    if (qtyM[1].includes('.')) {
      result.warnings.push({ kind: 'parse-error', line: rawLine, message: '数量必须为整数' });
      continue;
    }
    const qty = Number(qtyM[1]);
    const unit = qtyM[2] as '张' | '卷';

    // 2) 尺寸：在「数量之前」的前缀里取最后一个尺寸 token
    const prefix = norm.slice(0, qtyM.index);
    let sizeM: RegExpExecArray | null = null;
    SIZE_RE_G.lastIndex = 0;
    for (let mm: RegExpExecArray | null; (mm = SIZE_RE_G.exec(prefix)); ) sizeM = mm;
    if (!sizeM) {
      result.warnings.push({ kind: 'parse-error', line: rawLine, message: '缺少尺寸（如 2500*893）' });
      continue;
    }
    if (sizeM[1].includes('.') || sizeM[2].includes('.')) {
      result.warnings.push({ kind: 'parse-error', line: rawLine, message: '尺寸必须为整数毫米' });
      continue;
    }
    const widthMm = Number(sizeM[1]);
    const heightMm = Number(sizeM[2]);

    // 索引对齐（toHalfWidth 等长），回原文取尺寸串
    const rawSpec = rawLine.slice(sizeM.index, sizeM.index + sizeM[0].length).trim();
    const productName = norm.slice(0, sizeM.index).trim();
    if (!productName) {
      result.warnings.push({ kind: 'parse-error', line: rawLine, message: '缺少品名' });
      continue;
    }

    const matched = matchProduct(productName, products);
    if (products.length > 0 && matched.type === 'none') {
      result.warnings.push({
        kind: 'product-unmatched',
        line: rawLine,
        message: `品名「${productName}」未匹配到产品，请手选或先建产品`,
      });
    }
    if (products.length > 0 && matched.type === 'ambiguous') {
      result.warnings.push({
        kind: 'product-ambiguous',
        line: rawLine,
        message: `品名「${productName}」模糊命中多个产品（${matched.candidates!.map((c) => c.name).join('、')}），请手选`,
      });
    }

    result.items.push({
      rawLine,
      productName,
      matchedProduct: matched.product,
      matchType: matched.type,
      candidates: matched.candidates,
      rawSpec,
      widthMm,
      heightMm,
      qty,
      unit,
    });
  }

  return result;
}
