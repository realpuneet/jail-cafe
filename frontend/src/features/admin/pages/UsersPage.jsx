import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { fieldError, toApiError } from '../../../lib/apiError.js';
import { api } from '../../../lib/axios.js';
import { formatPhone } from '../../../lib/format.js';
import { useDebounce } from '../../../hooks/useDebounce.js';
import { useAuthStore } from '../../auth/authStore.js';
import { toast } from '../../ui/uiStore.js';
import { LoadMore, Panel, SelectField, Switch } from '../components/Fields.jsx';
import { flatten, useAdminList } from '../hooks.js';

function StaffForm({ onClose, onSaved }) {
  const { register, handleSubmit, formState, setError } = useForm({
    defaultValues: { name: '', phone: '', email: '', password: '', role: 'staff' },
  });
  const submit = async (v) => {
    try {
      await api.post('/users', v);
      toast.success('User created');
      onSaved();
      onClose();
    } catch (err) {
      const a = toApiError(err);
      ['name', 'phone', 'email', 'password'].forEach((f) => {
        const m = fieldError(a.details, f);
        if (m) setError(f, { message: m });
      });
      setError('root', { message: a.message });
    }
  };
  const e = formState.errors;
  return (
    <Modal open onClose={onClose} title="Add team member">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input label="Name" error={e.name?.message} {...register('name', { required: true })} />
        <Input
          label="Mobile"
          inputMode="numeric"
          error={e.phone?.message}
          {...register('phone', { required: true })}
        />
        <Input
          label="Email (login)"
          type="email"
          error={e.email?.message}
          {...register('email', { required: true })}
        />
        <Input
          label="Password (min 10 characters)"
          type="password"
          autoComplete="new-password"
          error={e.password?.message}
          {...register('password', { required: true, minLength: 10 })}
        />
        <SelectField label="Role" {...register('role')}>
          <option value="staff">Staff</option>
          <option value="rider">Rider</option>
          <option value="admin">Admin</option>
        </SelectField>
        {e.root && (
          <p role="alert" className="font-medium text-nonveg">
            {e.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Create
        </Button>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user?._id);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const q = useDebounce(search, 300);
  const params = {
    ...(role ? { role } : {}),
    ...(q.replace(/\D/g, '').length >= 3 ? { search: q.replace(/\D/g, '') } : {}),
  };
  const list = useAdminList(['users'], '/users', params);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const fail = (e) => toast.error(toApiError(e).message);
  const setRoleM = useMutation({
    mutationFn: ({ id, role: r }) => api.patch(`/users/${id}/role`, { role: r }),
    onSuccess: () => {
      toast.success('Role updated');
      refresh();
    },
    onError: fail,
  });
  const setActive = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/users/${id}/status`, { isActive }),
    onSuccess: refresh,
    onError: fail,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl">Users</h1>
        <Button onClick={() => setAdding(true)}>+ Add team member</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="u-search">
          Search by phone
        </label>
        <input
          id="u-search"
          type="search"
          inputMode="numeric"
          placeholder="Search by phone (3+ digits)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 min-w-60 flex-1 rounded-full border-2 border-line bg-surface px-4 focus:border-kulhad focus:outline-none"
        />
        <label className="sr-only" htmlFor="u-role">
          Filter by role
        </label>
        <select
          id="u-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-11 rounded-full border-2 border-line bg-surface px-4"
        >
          <option value="">All roles</option>
          {['customer', 'staff', 'rider', 'admin'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        <ul className="divide-y divide-line">
          {flatten(list.data).map((u) => (
            <li key={u._id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {u.name || 'Unnamed'} {!u.isActive && <Badge tone="danger">Disabled</Badge>}
                </p>
                <p className="text-sm text-muted">
                  {formatPhone(u.phone)}
                  {u.email ? ` · ${u.email}` : ''} · joined{' '}
                  {new Date(u.createdAt).toLocaleDateString('en-IN')}
                </p>
              </div>
              <select
                aria-label={`Role of ${u.name || u.phone}`}
                value={u.role}
                disabled={u._id === me}
                onChange={(e) =>
                  window.confirm(`Change role to ${e.target.value}?`) &&
                  setRoleM.mutate({ id: u._id, role: e.target.value })
                }
                className="h-10 rounded-lg border-2 border-line bg-surface px-2 disabled:opacity-60"
              >
                {['customer', 'staff', 'rider', 'admin'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                Active
                <Switch
                  checked={u.isActive}
                  disabled={u._id === me}
                  onChange={(v) => setActive.mutate({ id: u._id, isActive: v })}
                  label={`${u.name || u.phone} active`}
                />
              </label>
            </li>
          ))}
          {list.isLoading && <li className="py-6 text-center">Loading…</li>}
          {!list.isLoading && flatten(list.data).length === 0 && (
            <li className="py-8 text-center text-muted">No users match.</li>
          )}
        </ul>
        <LoadMore query={list} />
      </Panel>
      {adding && <StaffForm onClose={() => setAdding(false)} onSaved={refresh} />}
    </div>
  );
}
