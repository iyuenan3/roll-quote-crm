// 计价 + 中文大写金额。纯函数。
// 红线（见 AIREADME/CORE、SPEC、CONVENTIONS）：
//  - 计价口径不可变：一卷恒等于 21㎡。
//  - amount 用「未截断单价」乘张数再取整，避免累积误差，绝不用已 round 的 unitPrice 乘。
//  - 算法只在 src/core，UI 只调用不内联。

/** 一卷的面积（㎡）。计价口径常量，不可变。 */
export const SQM_PER_ROLL = 21;

/**
 * 四舍五入到指定小数位（默认 2 位），含浮点边界修正。
 * 加 Number.EPSILON 修正如 1.005 这类二进制浮点表示偏小导致的错舍。
 */
export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) throw new Error('round: value 必须是有限数');
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return (sign * Math.round((abs + Number.EPSILON) * factor)) / factor;
}

/** 面积（㎡）= (宽mm/1000) × (长mm/1000)。宽长可交换，不影响结果。 */
export function areaSqm(widthMm: number, heightMm: number): number {
  return (widthMm / 1000) * (heightMm / 1000);
}

export interface PriceInput {
  /** 该「客户 × 产品」当前 is_current 每卷报价（卷 = 21㎡）。 */
  rollPrice: number;
  widthMm: number;
  heightMm: number;
  qty: number;
  /** 手动覆盖行：跳过公式，直接取手填单价 / 金额。 */
  isManual?: boolean;
  manualUnitPrice?: number;
  manualAmount?: number;
}

export interface PriceResult {
  areaSqm: number;
  unitPrice: number;
  amount: number;
}

/**
 * 计算单行价格。张 / 卷同一公式：整卷面积 ≈ 21㎡ 时单价自然退化为每卷报价。
 *   area_sqm   = (宽/1000) × (长/1000)
 *   unit_price = round(roll_price × area ÷ 21, 2)
 *   amount     = round(roll_price × area ÷ 21 × qty, 2)   // 用未截断单价乘
 */
export function computeRow(input: PriceInput): PriceResult {
  const area = areaSqm(input.widthMm, input.heightMm);

  if (input.isManual) {
    const unitPrice = round(input.manualUnitPrice ?? 0, 2);
    const amount = round(input.manualAmount ?? unitPrice * input.qty, 2);
    return { areaSqm: area, unitPrice, amount };
  }

  const rawUnit = (input.rollPrice * area) / SQM_PER_ROLL;
  const unitPrice = round(rawUnit, 2);
  const amount = round(rawUnit * input.qty, 2); // 注意：用 rawUnit 而非 unitPrice
  return { areaSqm: area, unitPrice, amount };
}

// ---- 中文大写金额（元角分整）----

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const SECTION_UNITS = ['仟', '佰', '拾', ''];
const BIG_UNITS = ['', '万', '亿', '兆'];

/** 把 0..9999 的一节转中文，处理节内零（如 1005 → 壹仟零伍）。 */
function sectionToChinese(section: number): string {
  const digits = [
    Math.floor(section / 1000) % 10,
    Math.floor(section / 100) % 10,
    Math.floor(section / 10) % 10,
    section % 10,
  ];
  let result = '';
  let zeroPending = false;
  for (let i = 0; i < 4; i++) {
    const d = digits[i];
    if (d === 0) {
      zeroPending = true;
    } else {
      if (zeroPending && result !== '') result += '零';
      zeroPending = false;
      result += DIGITS[d] + SECTION_UNITS[i];
    }
  }
  return result;
}

/** 正整数转中文（万 / 亿分节，处理节间零，如 10001 → 壹万零壹）。 */
function intToChinese(num: number): string {
  if (num === 0) return '零';
  const sections: number[] = [];
  let n = num;
  while (n > 0) {
    sections.push(n % 10000);
    n = Math.floor(n / 10000);
  }
  let result = '';
  for (let i = sections.length - 1; i >= 0; i--) {
    const sec = sections[i];
    if (sec === 0) continue; // 整节为零跳过，零由下一非零节按需补
    // 高节非空、本节不足千（最高位是 0）时补「零」
    if (result !== '' && sec < 1000) result += '零';
    result += sectionToChinese(sec) + BIG_UNITS[i];
  }
  return result;
}

/**
 * 金额转人民币大写（元角分整）。
 *   2632.36 → 人民币贰仟陆佰叁拾贰元叁角陆分
 *   2200    → 人民币贰仟贰佰元整
 *   100.05  → 人民币壹佰元零伍分
 */
export function amountToChinese(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error('amountToChinese: amount 必须是有限数');
  const negative = amount < 0;
  const n = round(Math.abs(amount), 2);

  const integerPart = Math.floor(n);
  const fenTotal = Math.round((n - integerPart) * 100);
  const jiao = Math.floor(fenTotal / 10);
  const fen = fenTotal % 10;

  let body = intToChinese(integerPart) + '元';

  if (jiao === 0 && fen === 0) {
    body += '整';
  } else {
    if (jiao > 0) {
      body += DIGITS[jiao] + '角';
    } else if (integerPart > 0) {
      body += '零'; // 元与分之间缺角补零，如 壹佰元零伍分
    }
    if (fen > 0) body += DIGITS[fen] + '分';
  }

  return '人民币' + (negative ? '负' : '') + body;
}
