import { useEffect, useState } from 'react';
import type { Company } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

export function SettingsPage() {
  const [c, setC] = useState<Company>({ name: '', address: '', phone: '', terms: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setC(await getDb().getCompany());
      } catch (e) {
        setMsg(errMsg(e));
      }
    })();
  }, []);

  const save = async () => {
    setMsg('');
    setBusy(true);
    try {
      await getDb().upsertCompany(c);
      setMsg('✅ 已保存');
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const f = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC({ ...c, [k]: e.target.value });

  return (
    <div>
      <h2 className="page-title">公司信息</h2>
      <p className="page-sub">用于送货单抬头与条款。</p>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>公司名称（送货单抬头）</label>
          <input value={c.name} onChange={f('name')} style={{ width: '100%' }} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>地址</label>
          <input value={c.address} onChange={f('address')} style={{ width: '100%' }} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>电话</label>
          <input value={c.phone} onChange={f('phone')} style={{ width: '100%' }} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>条款（送货单底部）</label>
          <input value={c.terms} onChange={f('terms')} style={{ width: '100%' }} />
        </div>
        <button className="btn" onClick={save} disabled={busy}>
          保存
        </button>
        {msg && (
          <p className="error" style={{ color: msg.startsWith('✅') ? 'var(--ok)' : undefined }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
