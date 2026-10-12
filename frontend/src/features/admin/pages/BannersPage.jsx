import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Img from '../../../components/common/Img.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { api } from '../../../lib/axios.js';
import { toast } from '../../ui/uiStore.js';
import { CheckField, LoadMore, Panel, SelectField, Switch } from '../components/Fields.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { flatten, useAdminList } from '../hooks.js';
import { fromLocalInput, toLocalInput } from '../money.js';

const POSITIONS = [
  ['home_hero', 'Home – top'],
  ['home_secondary', 'Home – secondary'],
  ['menu', 'Menu page'],
  ['party', 'Party page'],
];

function BannerForm({ banner, onClose, onSaved }) {
  const [image, setImage] = useState(banner?.image ?? null);
  const { register, handleSubmit, formState, setError } = useForm({
    defaultValues: {
      title: banner?.title ?? '',
      subtitle: banner?.subtitle ?? '',
      linkUrl: banner?.linkUrl ?? '',
      position: banner?.position ?? 'home_hero',
      sortOrder: String(banner?.sortOrder ?? 0),
      startsAt: toLocalInput(banner?.startsAt),
      endsAt: toLocalInput(banner?.endsAt),
      isActive: banner?.isActive ?? true,
    },
  });
  const submit = async (v) => {
    if (!image) return setError('root', { message: 'Upload an image first.' });
    const body = {
      title: v.title,
      subtitle: v.subtitle || undefined,
      image,
      linkUrl: v.linkUrl || undefined,
      position: v.position,
      sortOrder: Number(v.sortOrder || 0),
      startsAt: fromLocalInput(v.startsAt),
      endsAt: fromLocalInput(v.endsAt),
      isActive: v.isActive,
    };
    try {
      if (banner) await api.patch(`/banners/${banner._id}`, body);
      else await api.post('/banners', body);
      toast.success('Banner saved');
      onSaved();
      onClose();
    } catch (err) {
      setError('root', { message: toApiError(err).message });
    }
  };
  return (
    <Modal open onClose={onClose} title={banner ? 'Edit banner' : 'New banner'} size="lg">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <ImageUploader
          value={image}
          onChange={setImage}
          folder="banners"
          label="Banner image (wide, ~16:7)"
        />
        <Input label="Title" {...register('title', { required: true })} />
        <Input label="Subtitle" {...register('subtitle')} />
        <Input label="Link (in-app path like /menu, or https URL)" {...register('linkUrl')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Position" {...register('position')}>
            {POSITIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <Input label="Sort order" inputMode="numeric" {...register('sortOrder')} />
          <Input label="Show from" type="datetime-local" {...register('startsAt')} />
          <Input label="Show until" type="datetime-local" {...register('endsAt')} />
        </div>
        <CheckField label="Active" {...register('isActive')} />
        {formState.errors.root && (
          <p role="alert" className="font-medium text-nonveg">
            {formState.errors.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save banner
        </Button>
      </form>
    </Modal>
  );
}

export default function BannersPage() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(null);
  const list = useAdminList(['banners'], '/banners/manage');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
    qc.invalidateQueries({ queryKey: ['banners'] });
  };
  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/banners/${id}`, { isActive }),
    onSuccess: refresh,
    onError: (e) => toast.error(toApiError(e).message),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/banners/${id}`),
    onSuccess: () => {
      toast.success('Banner deleted');
      refresh();
    },
  });
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-4xl">Banners</h1>
        <Button onClick={() => setEdit('new')}>+ New banner</Button>
      </div>
      <Panel>
        <ul className="divide-y divide-line">
          {flatten(list.data).map((b) => (
            <li key={b._id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="h-14 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                <Img
                  src={b.image?.url}
                  alt=""
                  width={240}
                  sizes="112px"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{b.title}</p>
                <p className="text-sm text-muted">
                  {POSITIONS.find(([v]) => v === b.position)?.[1]}
                  {b.endsAt
                    ? ` · until ${new Date(b.endsAt).toLocaleDateString('en-IN')}`
                    : ''}{' '}
                  {!b.isActive && <Badge tone="danger">Off</Badge>}
                </p>
              </div>
              <Switch
                checked={b.isActive}
                onChange={(v) => toggle.mutate({ id: b._id, isActive: v })}
                label={`${b.title} active`}
              />
              <Button size="sm" variant="outline" onClick={() => setEdit(b)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.confirm('Delete this banner?') && remove.mutate(b._id)}
              >
                Delete
              </Button>
            </li>
          ))}
          {!list.isLoading && flatten(list.data).length === 0 && (
            <li className="py-8 text-center text-muted">No banners yet.</li>
          )}
        </ul>
        <LoadMore query={list} />
      </Panel>
      {edit && (
        <BannerForm
          banner={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
