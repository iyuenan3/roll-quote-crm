import { useEffect, useState } from 'react';
import type { Product } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

export function ProductsPage() {
  const [list, setList] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [aliases, setAliases] = useState('');
  const [specNote, setSpecNote] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('张');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setList(await getDb().listProducts());
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    setError('');
    if (!name.trim()) {
      setError('品名必填');
      return;
    }
    setBusy(true);
    try {
      await getDb().createProduct({
        name: name.trim(),
        code: code.trim(),
        aliases: aliases
          .split(/[,，、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        specNote: specNote.trim(),
        defaultUnit,
      });
      setName('');
      setCode('');
      setAliases('');
      setSpecNote('');
      setDefaultUnit('张');
      await load();
    } catch (e) {
      setError(errMsg(e)); // 品名重复会得「记录已存在（唯一约束冲突）」
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">产品</h2>
      <p className="page-sub">维护产品与别名。下单解析时按品名精确 → 别名 → 模糊匹配。</p>

      <div className="card">
        <h3>新增产品</h3>
        <div className="form-row">
          <div className="field">
            <label>品名 *（唯一）</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 05纯低温胶" />
          </div>
          <div className="field">
            <label>编码</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label>别名（逗号分隔）</label>
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="05胶, 低温胶05" />
          </div>
          <div className="field">
            <label>默认单位</label>
            <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)}>
              <option value="张">张</option>
              <option value="卷">卷</option>
            </select>
          </div>
          <div className="field">
            <label>规格备注</label>
            <input value={specNote} onChange={(e) => setSpecNote(e.target.value)} />
          </div>
          <button className="btn" onClick={submit} disabled={busy}>
            添加
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h3>产品列表（{list.length}）</h3>
        {list.length === 0 ? (
          <p className="empty">暂无产品，先在上方添加。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>品名</th>
                <th>编码</th>
                <th>别名</th>
                <th>默认单位</th>
                <th>规格备注</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.code || '-'}</td>
                  <td>{p.aliases.length ? p.aliases.join('、') : '-'}</td>
                  <td>{p.defaultUnit}</td>
                  <td>{p.specNote || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
