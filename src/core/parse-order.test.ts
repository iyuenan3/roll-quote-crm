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
  it('空输入返回空结果', () => {
    const r = parseOrder('');
    expect(r.items).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.customer).toBeUndefined();
  });
});

describe('parseOrder · 解析加固（回归）', () => {
  it('品名含「数字x数字」不被尺寸吞：取数量前最后一个尺寸', () => {
    const r = parseOrder('3x5加强胶 2500*893 21张');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].productName).toBe('3x5加强胶');
    expect(r.items[0].widthMm).toBe(2500);
    expect(r.items[0].heightMm).toBe(893);
    expect(r.items[0].qty).toBe(21);
  });
  it('小数尺寸报 parse-error，不静默截断', () => {
    const r = parseOrder('样品 100.5*200 3张');
    expect(r.items).toHaveLength(0);
    expect(r.warnings.some((w) => w.kind === 'parse-error')).toBe(true);
  });
  it('小数数量报 parse-error', () => {
    const r = parseOrder('样品 100*200 2.5张');
    expect(r.items).toHaveLength(0);
    expect(r.warnings.some((w) => w.kind === 'parse-error')).toBe(true);
  });
  it('缺品名（行首即尺寸）报 parse-error，不入 items', () => {
    const r = parseOrder('100*200 3张');
    expect(r.items).toHaveLength(0);
    expect(r.warnings.some((w) => w.kind === 'parse-error')).toBe(true);
  });
  it('空品名不会 fuzzy 误绑产品', () => {
    const r = parseOrder('100*200 3张', [{ id: 1, name: '05纯低温胶' }]);
    expect(r.items).toHaveLength(0);
  });
  it('fuzzy 多命中 → ambiguous + 告警，不静默取首个', () => {
    const products: Product[] = [
      { id: 1, name: '05纯低温胶' },
      { id: 2, name: '06纯低温胶' },
    ];
    const r = parseOrder('低温 100*200 3张', products);
    expect(r.items[0].matchType).toBe('ambiguous');
    expect(r.items[0].matchedProduct).toBeUndefined();
    expect(r.items[0].candidates?.map((c) => c.id)).toEqual([1, 2]);
    expect(r.warnings.some((w) => w.kind === 'product-ambiguous')).toBe(true);
  });
});
