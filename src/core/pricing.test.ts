import { describe, it, expect } from 'vitest';
import { round, areaSqm, computeRow, amountToChinese, SQM_PER_ROLL, adjustRollPrice } from './pricing';

describe('round 取整', () => {
  it('0 与整数', () => {
    expect(round(0)).toBe(0);
    expect(round(10)).toBe(10);
  });
  it('四舍五入进位（含浮点边界）', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.345, 2)).toBe(2.35);
    expect(round(2.344, 2)).toBe(2.34);
    expect(round(0.005, 2)).toBe(0.01);
  });
  it('分半进位：EPSILON 旧实现失效的历史用例（回归）', () => {
    expect(round(8.575, 2)).toBe(8.58);
    expect(round(2.135, 2)).toBe(2.14);
    expect(round(2.385, 2)).toBe(2.39);
    expect(round(4.015, 2)).toBe(4.02);
  });
  it('负数对称取整', () => {
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(-8.575, 2)).toBe(-8.58);
  });
  it('非有限数抛错', () => {
    expect(() => round(Infinity)).toThrow();
    expect(() => round(NaN)).toThrow();
  });
});

describe('areaSqm 面积', () => {
  it('2100×1000mm → 2.1㎡', () => {
    expect(areaSqm(2100, 1000)).toBe(2.1);
  });
  it('宽长可交换', () => {
    expect(areaSqm(420, 50000)).toBe(areaSqm(50000, 420));
  });
});

describe('computeRow 计价', () => {
  it('干净例：100 元/卷，2100×1000mm，5 张 → area 2.1 / unit 10.000 / amount 50', () => {
    const r = computeRow({ rollPrice: 100, widthMm: 2100, heightMm: 1000, qty: 5 });
    expect(r.areaSqm).toBe(2.1);
    expect(r.unitPrice).toBe(10);
    expect(r.amount).toBe(50);
  });

  it('整卷例：100 元/卷，420×50000mm，22 卷 → area 21 / unit 100.000 / amount 2200', () => {
    const r = computeRow({ rollPrice: 100, widthMm: 420, heightMm: 50000, qty: 22 });
    expect(r.areaSqm).toBe(SQM_PER_ROLL);
    expect(r.unitPrice).toBe(100);
    expect(r.amount).toBe(2200);
  });

  it('D6 精度：单价 3 位 / 金额取整：100 元/卷，2500×893mm，1 张 → unit 10.631 / amount 11', () => {
    const r = computeRow({ rollPrice: 100, widthMm: 2500, heightMm: 893, qty: 1 });
    // rawUnit = 100 × 2.2325 / 21 = 10.630952...
    expect(r.unitPrice).toBe(10.631); // 3 位小数
    expect(r.amount).toBe(11); // round(10.63...) = 11，四舍五入到整数元
  });

  it('宽长顺序不影响计价', () => {
    const a = computeRow({ rollPrice: 100, widthMm: 2100, heightMm: 1000, qty: 5 });
    const b = computeRow({ rollPrice: 100, widthMm: 1000, heightMm: 2100, qty: 5 });
    expect(b).toEqual(a);
  });

  it('amount 用未截断单价乘，避免累积误差：100 元/卷，700×100mm，3 张 → unit 0.333 / amount 1', () => {
    const r = computeRow({ rollPrice: 100, widthMm: 700, heightMm: 100, qty: 3 });
    // rawUnit = 100 × 0.07 / 21 = 0.33333...
    expect(r.unitPrice).toBe(0.333); // 3 位小数
    expect(r.amount).toBe(1); // round(0.99999...) = 1，用未截断单价乘再取整
  });

  it('边界 0：数量 0 → 金额 0；报价 0 → 单价金额 0', () => {
    expect(computeRow({ rollPrice: 100, widthMm: 2100, heightMm: 1000, qty: 0 }).amount).toBe(0);
    const z = computeRow({ rollPrice: 0, widthMm: 2100, heightMm: 1000, qty: 5 });
    expect(z.unitPrice).toBe(0);
    expect(z.amount).toBe(0);
  });

  it('手动覆盖行跳过公式，直接取手填单价 / 金额', () => {
    const r = computeRow({
      rollPrice: 100,
      widthMm: 2100,
      heightMm: 1000,
      qty: 5,
      isManual: true,
      manualUnitPrice: 8,
      manualAmount: 40,
    });
    expect(r.unitPrice).toBe(8);
    expect(r.amount).toBe(40);
  });
});

describe('amountToChinese 中文大写', () => {
  it('2632.36 → 人民币贰仟陆佰叁拾贰元叁角陆分', () => {
    expect(amountToChinese(2632.36)).toBe('人民币贰仟陆佰叁拾贰元叁角陆分');
  });
  it('整数带「整」：2200 → 人民币贰仟贰佰元整', () => {
    expect(amountToChinese(2200)).toBe('人民币贰仟贰佰元整');
  });
  it('缺角补零：100.05 → 人民币壹佰元零伍分', () => {
    expect(amountToChinese(100.05)).toBe('人民币壹佰元零伍分');
  });
  it('节间零：10001 → 人民币壹万零壹元整', () => {
    expect(amountToChinese(10001)).toBe('人民币壹万零壹元整');
  });
  it('亿级：100010000 → 人民币壹亿零壹万元整', () => {
    expect(amountToChinese(100010000)).toBe('人民币壹亿零壹万元整');
  });
  it('0 → 人民币零元整', () => {
    expect(amountToChinese(0)).toBe('人民币零元整');
  });
  it('只有角：50.5 → 人民币伍拾元伍角', () => {
    expect(amountToChinese(50.5)).toBe('人民币伍拾元伍角');
  });
  it('零元小额：0.05 → 人民币零元伍分；0.5 → 人民币零元伍角', () => {
    expect(amountToChinese(0.05)).toBe('人民币零元伍分');
    expect(amountToChinese(0.5)).toBe('人民币零元伍角');
  });
  it('负数金额：-100.5 → 人民币负壹佰元伍角', () => {
    expect(amountToChinese(-100.5)).toBe('人民币负壹佰元伍角');
  });
  it('亿级整额：100000000 → 人民币壹亿元整', () => {
    expect(amountToChinese(100000000)).toBe('人民币壹亿元整');
  });
  it('超出兆级（>=10^16）抛错，不产出 undefined', () => {
    expect(() => amountToChinese(1e16)).toThrow();
  });
});

describe('adjustRollPrice 批量调价', () => {
  it('percent：按百分比上浮 / 下调，round 到 2 位', () => {
    expect(adjustRollPrice(100, 'percent', 5)).toBe(105);
    expect(adjustRollPrice(120, 'percent', 3)).toBe(123.6);
    expect(adjustRollPrice(100, 'percent', -10)).toBe(90);
    expect(adjustRollPrice(99.99, 'percent', 5)).toBe(104.99); // 99.99×1.05=104.9895 → 104.99
  });
  it('delta：按固定额增减', () => {
    expect(adjustRollPrice(100, 'delta', 8)).toBe(108);
    expect(adjustRollPrice(100, 'delta', -3.5)).toBe(96.5);
  });
  it('set：直接设为指定值，忽略当前价', () => {
    expect(adjustRollPrice(100, 'set', 88)).toBe(88);
    expect(adjustRollPrice(999, 'set', 0.5)).toBe(0.5);
  });
  it('非有限入参抛错', () => {
    expect(() => adjustRollPrice(NaN, 'percent', 5)).toThrow();
    expect(() => adjustRollPrice(100, 'delta', Infinity)).toThrow();
  });
});
