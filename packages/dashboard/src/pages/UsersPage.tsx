import React, { useState, useEffect } from 'react';
import {
  fetchUsers,
  createUser,
  patchUser,
  deactivateUser,
  type UserRecord,
} from '../api/client';
import { useAuth } from '../hooks/useAuth';

const ROLES = ['agent', 'supervisor', 'admin'] as const;
type Role = (typeof ROLES)[number];

/** Human-readable display labels for role slugs */
export const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrator',
  supervisor: 'Supervisor',
  agent:      'Case Manager',
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin:      { bg: '#FEE2E2', text: '#991B1B' },
  supervisor: { bg: '#FEF3C7', text: '#7A4F00' },
  agent:      { bg: '#EBF4FF', text: '#1A4A6B' },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid #CBD5E0',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

// ─── Add User Form ────────────────────────────────────────────────────────────

interface AddUserFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

function AddUserForm({ onCreated, onCancel }: AddUserFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }
    setSaving(true);
    setError(null);
    try {
      await createUser({ email, role, password });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e', marginBottom: 14 }}>Add New User</div>

      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#C53030', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="casemanager@org.ca" autoFocus style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={inputStyle}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Temporary Password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters" style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '6px 14px', background: '#fff', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#718096' }}>
          Cancel
        </button>
        <button type="submit" disabled={saving}
          style={{ padding: '6px 14px', background: saving ? '#718096' : '#2D6A4F', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Creating…' : 'Create User'}
        </button>
      </div>
    </form>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: UserRecord;
  isSelf: boolean;
  onRoleChange: (id: string, role: Role) => Promise<void>;
  onToggleActive: (id: string, active: boolean) => Promise<void>;
}

function UserRow({ user, isSelf, onRoleChange, onToggleActive }: UserRowProps) {
  const [roleSaving, setRoleSaving] = useState(false);
  const [activeSaving, setActiveSaving] = useState(false);
  const roleColors = ROLE_COLORS[user.role] ?? { bg: '#EDF2F7', text: '#4A5568' };

  return (
    <tr style={{ borderBottom: '1px solid #EDF2F7', opacity: user.is_active ? 1 : 0.55 }}>
      {/* Email */}
      <td style={{ padding: '11px 14px', fontSize: 13, color: '#1a1a2e', fontWeight: isSelf ? 700 : 400 }}>
        {user.email}
        {isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: '#718096', fontWeight: 400 }}>(you)</span>}
      </td>

      {/* Role selector */}
      <td style={{ padding: '11px 14px' }}>
        <select
          value={user.role}
          disabled={roleSaving || isSelf}
          onChange={async (e) => {
            setRoleSaving(true);
            await onRoleChange(user.id, e.target.value as Role);
            setRoleSaving(false);
          }}
          style={{
            padding: '4px 8px',
            border: '1px solid #E2E8F0',
            borderRadius: 5,
            fontSize: 11.5,
            fontWeight: 700,
            background: roleColors.bg,
            color: roleColors.text,
            cursor: isSelf ? 'not-allowed' : 'pointer',
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
          ))}
        </select>
      </td>

      {/* Status badge */}
      <td style={{ padding: '11px 14px' }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          background: user.is_active ? '#C6F6D5' : '#EDF2F7',
          color: user.is_active ? '#276749' : '#718096',
        }}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>

      {/* Created */}
      <td style={{ padding: '11px 14px', fontSize: 12, color: '#718096' }}>
        {formatDate(user.created_at)}
      </td>

      {/* Last login */}
      <td style={{ padding: '11px 14px', fontSize: 12, color: '#718096' }}>
        {formatDate(user.last_login_at)}
      </td>

      {/* Actions */}
      <td style={{ padding: '11px 14px' }}>
        {!isSelf && (
          <button
            disabled={activeSaving}
            onClick={async () => {
              setActiveSaving(true);
              await onToggleActive(user.id, !user.is_active);
              setActiveSaving(false);
            }}
            style={{
              padding: '4px 10px',
              fontSize: 11.5,
              borderRadius: 5,
              border: '1px solid #E2E8F0',
              background: user.is_active ? '#FFF5F5' : '#F0FFF4',
              color: user.is_active ? '#C53030' : '#276749',
              cursor: activeSaving ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {activeSaving ? '…' : user.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (id: string, role: Role) => {
    setActionError(null);
    try {
      await patchUser(id, { role });
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    setActionError(null);
    try {
      if (active) {
        await patchUser(id, { is_active: true });
      } else {
        await deactivateUser(id);
      }
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active: active } : u));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const activeCount  = users.filter((u) => u.is_active).length;
  const adminCount   = users.filter((u) => u.role === 'admin' && u.is_active).length;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#718096', fontSize: 13 }}>Loading users…</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>User Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
            {activeCount} active user{activeCount !== 1 ? 's' : ''} · {adminCount} admin{adminCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ padding: '7px 16px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add User
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <AddUserForm
          onCreated={() => { setShowAddForm(false); load(); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Error banners */}
      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#C53030', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}
      {actionError && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#C53030', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#C53030', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Users table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F7FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Email', 'Role', 'Status', 'Created', 'Last Login', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={currentUser?.id === u.id}
                onRoleChange={handleRoleChange}
                onToggleActive={handleToggleActive}
              />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#A0AEC0', fontSize: 13 }}>
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info note */}
      <div style={{ marginTop: 12, fontSize: 11, color: '#A0AEC0' }}>
        Roles: <strong>Agent</strong> — own events only · <strong>Supervisor</strong> — all events + case submission · <strong>Admin</strong> — full access including user management
      </div>
    </div>
  );
}
