/**
 * AdminKeyPanel.jsx
 * --------------------------------------------------------------
 * A drop-in "AI Access Keys" settings panel. Add this component
 * anywhere in your existing admin/settings area (it renders its own
 * heading, so just place it inside a page/section).
 *
 * It talks to the routes described in middleware/nextjs-key-routes.js
 * (GET/POST /api/ai-access/keys, DELETE /api/ai-access/keys/:id).
 * Those routes must already sit behind your site's normal login —
 * this component assumes the user viewing it is already authenticated.
 *
 * USAGE
 *   import AdminKeyPanel from '@/examples/AdminKeyPanel';
 *   ...
 *   <AdminKeyPanel />
 *
 * This is plain React + inline styles so it has zero dependency on
 * whatever UI library your admin panel uses — restyle freely, or lift
 * the logic (the fetch calls + state) into your own component shell.
 */

'use client';

import { useEffect, useState } from 'react';

export default function AdminKeyPanel() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [justCreatedKey, setJustCreatedKey] = useState(null); // shown once
  const [error, setError] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-access/keys');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load keys');
      setKeys(data.keys);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshUpdateStatus() {
    try {
      const res = await fetch('/api/ai-access/update-status');
      const data = await res.json();
      if (data.ok) setUpdateStatus(data);
    } catch (err) {
      // silently ignore — this is a non-critical notification
    }
  }

  useEffect(() => {
    refresh();
    refreshUpdateStatus();
  }, []);

  async function handleGenerate() {
    setError(null);
    try {
      const res = await fetch('/api/ai-access/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || 'Unnamed key', scope: [] }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to generate key');
      setJustCreatedKey(data.rawKey);
      setLabel('');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevoke(id) {
    if (!confirm('এই key revoke করলে এটা দিয়ে আর AI সাইটে ঢুকতে পারবে না। নিশ্চিত?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/ai-access/keys/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to revoke key');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={styles.card}>
      {updateStatus && (updateStatus.updateAvailable || updateStatus.forceUpdateRequired) && (
        <div
          style={{
            ...styles.newKeyBox,
            background: updateStatus.forceUpdateRequired ? '#fdecea' : '#eaf4ff',
            borderColor: updateStatus.forceUpdateRequired ? '#e99' : '#9cf',
          }}
        >
          <strong>
            {updateStatus.forceUpdateRequired
              ? `⚠️ AI Access-এর নতুন ভার্সন v${updateStatus.latestVersion} আবশ্যিক — আপডেট না করা পর্যন্ত AI অ্যাক্সেস বন্ধ থাকবে।`
              : `AI Access-এর নতুন ভার্সন v${updateStatus.latestVersion} এসেছে।`}
          </strong>
          {updateStatus.changelog && <p style={{ margin: '6px 0' }}>{updateStatus.changelog}</p>}
          {updateStatus.downloadUrl && (
            <a href={updateStatus.downloadUrl} target="_blank" rel="noreferrer">
              <button className="primary" style={styles.primaryButton}>
                ডাউনলোড / বিস্তারিত দেখুন
              </button>
            </a>
          )}
        </div>
      )}

      <h3 style={styles.heading}>AI Access Keys</h3>
      <p style={styles.subtext}>
        এই key দিয়ে AI এজেন্ট আপনার সাইটে safely ঢুকতে পারবে — password ছাড়াই। প্রতিটা key
        <strong> একবারই </strong>
        ব্যবহার করা যাবে — AI একবার এটা দিয়ে "লগইন" করে ফেললে key-টা নিজে থেকেই অকেজো হয়ে যাবে।
        পরের বার কাজ করাতে চাইলে নতুন একটা key জেনারেট করে দিতে হবে।
      </p>

      <div style={styles.row}>
        <input
          style={styles.input}
          placeholder="Key-এর নাম (যেমন: Agency Review Bot)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button style={styles.primaryButton} onClick={handleGenerate}>
          + Generate Key
        </button>
      </div>

      {justCreatedKey && (
        <div style={styles.newKeyBox}>
          <strong>এই key-টা এখনই কপি করে রাখুন — আর কখনো দেখানো হবে না:</strong>
          <code style={styles.keyText}>{justCreatedKey}</code>
          <button
            style={styles.secondaryButton}
            onClick={() => navigator.clipboard.writeText(justCreatedKey)}
          >
            Copy
          </button>
          <p style={{ ...styles.subtext, margin: '8px 0 0 0' }}>
            মনে রাখবেন — এটা শুধু একবারই কাজ করবে। AI একবার এটা দিয়ে অ্যাক্সেস নিয়ে নিলে এই key আর
            রিইউজ করা যাবে না।
          </p>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {loading ? (
        <p>লোড হচ্ছে...</p>
      ) : keys.length === 0 ? (
        <p style={styles.subtext}>এখনো কোনো key তৈরি হয়নি।</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>নাম</th>
              <th style={styles.th}>Key</th>
              <th style={styles.th}>তৈরি</th>
              <th style={styles.th}>ব্যবহৃত</th>
              <th style={styles.th}>স্ট্যাটাস</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td style={styles.td}>{k.label}</td>
                <td style={styles.td}>
                  <code>{k.preview}</code>
                </td>
                <td style={styles.td}>{new Date(k.createdAt).toLocaleDateString()}</td>
                <td style={styles.td}>
                  {k.usedAt ? new Date(k.usedAt).toLocaleDateString() : 'এখনো না'}
                </td>
                <td style={styles.td}>
                  {k.status === 'revoked' ? 'Revoked' : k.status === 'used' ? 'Used (one-time)' : 'Active'}
                </td>
                <td style={styles.td}>
                  {k.status === 'active' && (
                    <button style={styles.dangerButton} onClick={() => handleRevoke(k.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles = {
  card: {
    border: '1px solid #e2e2e2',
    borderRadius: 12,
    padding: 20,
    maxWidth: 680,
    fontFamily: 'inherit',
  },
  heading: { margin: '0 0 4px 0' },
  subtext: { color: '#666', fontSize: 14, margin: '0 0 16px 0' },
  row: { display: 'flex', gap: 8, marginBottom: 12 },
  input: { flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc' },
  primaryButton: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    marginLeft: 8,
  },
  dangerButton: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #e33',
    background: '#fff',
    color: '#e33',
    cursor: 'pointer',
  },
  newKeyBox: {
    background: '#fff8e1',
    border: '1px solid #f0d58c',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  keyText: { display: 'block', margin: '6px 0', wordBreak: 'break-all' },
  error: { color: '#e33', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', borderBottom: '1px solid #e2e2e2', padding: '6px 4px' },
  td: { borderBottom: '1px solid #f0f0f0', padding: '6px 4px' },
};
