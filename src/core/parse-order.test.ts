import { describe, it, expect } from 'vitest';
import { parseOrder, type Product } from './parse-order';

const SAMPLE = `客户：张三
05纯低温胶 2500*893 21张
05纯低温胶 2500*893 25张
06纯低温胶 420*50000 22卷`;

describe('parseOrder · SPEC 样例', () => {
  const r = parseOrder(SAMPLE);

  it('解析出客户名', () => {
    expect(r.customer).toBe('张三');
  });
  it('解析出 3 行', () => {
    expect(r.items).toHaveLength(3);
  });
  it('品名正确', () => {
    expect(r.items.map((i) => i.productName)).toEqual(['05纯低温胶', '05纯低温胶', '06纯低温胶']);
  });
  it('尺寸正确（宽 长 毫米）', () => {
    expect(r.items.map((i) => [i.widthMm, i.heightMm])).toEqual([
      [2500, 893],
      [2500, 893],
      [420, 50000],
    ]);
  });
  it('数量与单位正确', () => {
    expect(r.items.map((i) => [i.qty, i.unit])).toEqual([
      [21, '张'],
      [25, '张'],
      [22, '卷'],
    ]);
  });
  it('rawSpec 保留原文', () => {
    expect(r.items[0].rawSpec).toBe('2500*893');
  });
  it('无 products 时不产 warning', () => {
    expect(r.warnings).toHaveLength(0);
  });
});

describe('parseOrder · 分隔符与全半角', () => {
  it('全角数字 + × 分隔符 + 全角冒号', () => {
    const r = parseOrder('客户：测试\n样品 ２５００×８９３ ５张');
    expect(r.customer).toBe('测试');
    expect(r.items[0].widthMm).toBe(2500);
    expect(r.items[0].heightMm).toBe(893);
    expect(r.items[0].qty).toBe(5);
    expect(r.items[0].unit).toBe('张');
  });
  it('半角冒号 + x 分隔符', () => {
    const r = parseOrder('客户:李四\n样品 100x200 3卷');
    expect(r.customer).toBe('李四');
    expect(r.items[0].widthMm).toBe(100);
    expect(r.items[0].heightMm).toBe(200);
  });
  it('数量与单位间可有空格', () => {
    const r = parseOrder('样品 100*200 21 张');
    expect(r.items[0].qty).toBe(21);
    expect(r.items[0].unit).toBe('张');
  });
});

describe('parseOrder · 品名匹配', () => {
  const products: Product[] = [
    { id: 1, name: '05纯低温胶', aliases: ['05胶'] },
    { id: 2, name: '06纯低温胶' },
  ];

  it('精确匹配', () => {
    const r = parseOrder('05纯低温胶 2500*893 21张', products);
    expect(r.items[0].matchType).toBe('exact');
    expect(r.items[0].matchedProduct?.id).toBe(1);
    expect(r.warnings).toHaveLength(0);
  });
  it('别名匹配', () => {
    const r = parseOrder('05胶 2500*893 21张', products);
    expect(r.items[0].matchType).toBe('alias');
    expect(r.items[0].matchedProduct?.id).toBe(1);
  });
  it('模糊匹配（子串包含）', () => {
    const r = parseOrder('05纯低温 2500*893 21张', products);
    expect(r.items[0].matchType).toBe('fuzzy');
    expect(r.items[0].matchedProduct?.id).toBe(1);
  });
  it('匹配不到 → matchType none 且产 warning', () => {
    const r = parseOrder('不存在的胶 2500*893 21张', products);
    expect(r.items[0].matchType).toBe('none');
    expect(r.items[0].matchedProduct).toBeUndefined();
    expect(r.warnings.some((w) => w.kind === 'product-unmatched')).toBe(true);
  });
});

describe('parseOrder · 告警与边界', () => {
  it('格式错误行（缺尺寸 / 数量）产 parse-error，不计入 items', () => {
    const r = parseOrder('客户：x\n这是一行乱填');
    expect(r.items).toHaveLength(0);
    expect(r.warnings.some((w) => w.kind === 'parse-error')).toBe(true);
  });
  it('空行被忽略', () => {
    const r = parseOrder('\n\n样品 100*200 3张\n\n');
    expect(r.items).toHaveLength(1);
  });
});
