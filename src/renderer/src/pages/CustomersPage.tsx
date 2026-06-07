import { useEffect, useState } from 'react';
import type { Customer } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

export function CustomersPage() {
  const [list, setList] = useState<Customer[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setList(await getDb().listCustomers());
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
      setError('客户名必填');
      return;
    }
    setBusy(true);
    try {
      await getDb().createCustomer({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      setName('');
      setPhone('');
      setAddress('');
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">客户</h2>
      <p className="page-sub">维护客户档案。下单与报价都按客户区分。</p>

      <div className="card">
        <h3>新增客户</h3>
        <div className="form-row">
          <div className="field">
            <label>客户名 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 张三" />
          </div>
          <div className="field">
            <label>电话</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>地址</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <button className="btn" onClick={submit} disabled={busy}>
            添加
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h3>客户列表（{list.length}）</h3>
        {list.length === 0 ? (
          <p className="empty">暂无客户，先在上方添加。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>客户名</th>
                <th>电话</th>
                <th>地址</th>
                <th>建档时间</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.address || '-'}</td>
                  <td>{c.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
