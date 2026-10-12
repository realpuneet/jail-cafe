import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Badge, VegMark } from '../../../components/common/Badges.jsx';
import Img from '../../../components/common/Img.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { fieldError, toApiError } from '../../../lib/apiError.js';
import { api, unwrap, unwrapWithMeta } from '../../../lib/axios.js';
import { formatPrice } from '../../../lib/format.js';
import { useAuthStore } from '../../auth/authStore.js';
import { toast } from '../../ui/uiStore.js';
import {
  CheckField,
  LoadMore,
  Panel,
  SelectField,
  Switch,
  TextAreaField,
} from '../components/Fields.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { flatten, useAdminList } from '../hooks.js';
import { paiseToRupees, rupeesToPaise } from '../money.js';

const money = z
  .string()
  .refine((v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0, 'Enter an amount');
const option = z.object({
  name: z.string().trim().min(1, 'Name'),
  price: money,
  isVeg: z.boolean().optional(),
});
const itemSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  categoryId: z.string().min(1, 'Choose a category'),
  isVeg: z.enum(['veg', 'nonveg']),
  price: money,
  mrp: z.string().optional(),
  description: z.string().max(500).optional(),
  prepTimeMinutes: z.string().optional(),
  sortOrder: z.string().optional(),
  tags: z.string().optional(),
  variants: z.array(option.omit({ isVeg: true })).max(10),
  addOns: z.array(option).max(20),
});

function ItemForm({ item, categories, onClose, onSaved }) {
  const [image, setImage] = useState(item?.image ?? null);
  const { register, control, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name ?? '',
      categoryId: item?.categoryId ?? categories[0]?._id ?? '',
      isVeg: item?.isVeg === false ? 'nonveg' : 'veg',
      price: paiseToRupees(item?.price),
      mrp: paiseToRupees(item?.mrp),
      description: item?.description ?? '',
      prepTimeMinutes: String(item?.prepTimeMinutes ?? 15),
      sortOrder: String(item?.sortOrder ?? 0),
      tags: (item?.tags ?? []).join(', '),
      variants: (item?.variants ?? []).map((v) => ({
        name: v.name,
        price: paiseToRupees(v.price),
      })),
      addOns: (item?.addOns ?? []).map((a) => ({
        name: a.name,
        price: paiseToRupees(a.price),
        isVeg: a.isVeg !== false,
      })),
    },
  });
  const variants = useFieldArray({ control, name: 'variants' });
  const addOns = useFieldArray({ control, name: 'addOns' });
  const e = formState.errors;

  const submit = async (v) => {
    const body = {
      name: v.name,
      categoryId: v.categoryId,
      isVeg: v.isVeg === 'veg',
      price: rupeesToPaise(v.price),
      mrp: rupeesToPaise(v.mrp),
      description: v.description || undefined,
      image: image ?? undefined,
      prepTimeMinutes: v.prepTimeMinutes ? Number(v.prepTimeMinutes) : undefined,
      sortOrder: v.sortOrder ? Number(v.sortOrder) : undefined,
      tags: v.tags
        ? v.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      variants: v.variants.map((x) => ({ name: x.name, price: rupeesToPaise(x.price) })),
      addOns: v.addOns.map((x) => ({
        name: x.name,
        price: rupeesToPaise(x.price),
        isVeg: x.isVeg !== false,
      })),
    };
    try {
      if (item) await api.patch(`/menu-items/${item._id}`, body);
      else await api.post('/menu-items', body);
      toast.success(item ? 'Item updated' : 'Item created');
      onSaved();
      onClose();
    } catch (err) {
      const a = toApiError(err);
      ['name', 'price', 'mrp', 'categoryId'].forEach((f) => {
        const m = fieldError(a.details, f);
        if (m) setError(f, { message: m });
      });
      if (!a.details) setError('root', { message: a.message });
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'New menu item'} size="lg">
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <ImageUploader value={image} onChange={setImage} folder="menu" label="Photo" />
        <Input label="Name" error={e.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" error={e.categoryId?.message} {...register('categoryId')}>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Type" {...register('isVeg')}>
            <option value="veg">Vegetarian</option>
            <option value="nonveg">Non-vegetarian</option>
          </SelectField>
          <Input
            label="Price (₹)"
            inputMode="decimal"
            error={e.price?.message}
            hint="GST inclusive"
            {...register('price')}
          />
          <Input
            label="MRP (₹, optional)"
            inputMode="decimal"
            error={e.mrp?.message}
            {...register('mrp')}
          />
          <Input label="Prep time (min)" inputMode="numeric" {...register('prepTimeMinutes')} />
          <Input label="Sort order" inputMode="numeric" {...register('sortOrder')} />
        </div>
        <TextAreaField label="Description" {...register('description')} />
        <Input label="Tags (comma separated)" {...register('tags')} />

        <fieldset className="rounded-xl border-2 border-line p-3">
          <legend className="px-1 font-bold">Variants (sizes)</legend>
          <p className="mb-2 text-sm text-muted">
            If you add variants, each needs its full price and the base price is ignored.
          </p>
          {variants.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-[1fr_7rem_auto] items-start gap-2">
              <Input
                aria-label={`Variant ${i + 1} name`}
                placeholder="e.g. Large"
                error={e.variants?.[i]?.name?.message}
                {...register(`variants.${i}.name`)}
              />
              <Input
                aria-label={`Variant ${i + 1} price`}
                placeholder="₹"
                inputMode="decimal"
                error={e.variants?.[i]?.price?.message}
                {...register(`variants.${i}.price`)}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove variant ${i + 1}`}
                onClick={() => variants.remove(i)}
              >
                ✕
              </Button>
            </div>
          ))}
          {variants.fields.length < 10 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => variants.append({ name: '', price: '' })}
            >
              + Add variant
            </Button>
          )}
        </fieldset>

        <fieldset className="rounded-xl border-2 border-line p-3">
          <legend className="px-1 font-bold">Add-ons</legend>
          {addOns.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-[1fr_7rem_auto_auto] items-start gap-2">
              <Input
                aria-label={`Add-on ${i + 1} name`}
                placeholder="e.g. Extra cheese"
                error={e.addOns?.[i]?.name?.message}
                {...register(`addOns.${i}.name`)}
              />
              <Input
                aria-label={`Add-on ${i + 1} price`}
                placeholder="₹"
                inputMode="decimal"
                error={e.addOns?.[i]?.price?.message}
                {...register(`addOns.${i}.price`)}
              />
              <CheckField label="Veg" className="mt-3" {...register(`addOns.${i}.isVeg`)} />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove add-on ${i + 1}`}
                onClick={() => addOns.remove(i)}
              >
                ✕
              </Button>
            </div>
          ))}
          {addOns.fields.length < 20 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => addOns.append({ name: '', price: '', isVeg: true })}
            >
              + Add add-on
            </Button>
          )}
        </fieldset>
        {e.root && (
          <p role="alert" className="font-medium text-nonveg">
            {e.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          {item ? 'Save changes' : 'Create item'}
        </Button>
      </form>
    </Modal>
  );
}

const catSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  description: z.string().max(300).optional(),
  sortOrder: z.string().optional(),
});
function CategoryForm({ category, onClose, onSaved }) {
  const [image, setImage] = useState(category?.image ?? null);
  const { register, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(catSchema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      sortOrder: String(category?.sortOrder ?? 0),
    },
  });
  const submit = async (v) => {
    const body = {
      name: v.name,
      description: v.description || undefined,
      image: image ?? undefined,
      sortOrder: Number(v.sortOrder || 0),
    };
    try {
      if (category) await api.patch(`/categories/${category._id}`, body);
      else await api.post('/categories', body);
      toast.success('Category saved');
      onSaved();
      onClose();
    } catch (err) {
      setError('root', { message: toApiError(err).message });
    }
  };
  return (
    <Modal open onClose={onClose} title={category ? 'Edit category' : 'New category'}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <ImageUploader value={image} onChange={setImage} folder="menu" label="Image" />
        <Input label="Name" error={formState.errors.name?.message} {...register('name')} />
        <TextAreaField label="Description" {...register('description')} />
        <Input label="Sort order" inputMode="numeric" {...register('sortOrder')} />
        {formState.errors.root && (
          <p role="alert" className="font-medium text-nonveg">
            {formState.errors.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save
        </Button>
      </form>
    </Modal>
  );
}

/** Menu manager. Staff can flip stock on/off; admins also create, edit, delete and manage categories. */
export default function MenuManagerPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState('items');
  const [editing, setEditing] = useState(null); // item | 'new' | null
  const [editingCat, setEditingCat] = useState(null);
  const [search, setSearch] = useState('');

  const items = useAdminList(['menu-items'], '/menu-items/manage');
  const cats = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get('/categories/manage', { params: { limit: 100 } }).then(unwrapWithMeta),
  });
  const categories = [...(cats.data?.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'menu-items'] });
    qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    qc.invalidateQueries({ queryKey: ['menu'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
  };

  const stock = useMutation({
    mutationFn: ({ id, isAvailable }) =>
      api.patch(`/menu-items/${id}/availability`, { isAvailable }).then(unwrap),
    onMutate: async ({ id, isAvailable }) => {
      await qc.cancelQueries({ queryKey: ['admin', 'menu-items'] });
      const snapshots = qc.getQueriesData({ queryKey: ['admin', 'menu-items'] });
      qc.setQueriesData(
        { queryKey: ['admin', 'menu-items'] },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              data: p.data.map((i) => (i._id === id ? { ...i, isAvailable } : i)),
            })),
          },
      );
      return { snapshots };
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshots.forEach(([k, d]) => qc.setQueryData(k, d));
      toast.error(toApiError(err).message);
    },
    onSettled: refresh,
  });
  const removeItem = useMutation({
    mutationFn: (id) => api.delete(`/menu-items/${id}`),
    onSuccess: () => {
      toast.success('Item removed');
      refresh();
    },
    onError: (e) => toast.error(toApiError(e).message),
  });
  const removeCat = useMutation({
    mutationFn: (id) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      toast.success('Category removed');
      refresh();
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const list = flatten(items.data).filter(
    (i) => i.isActive !== false && (!search || i.name.toLowerCase().includes(search.toLowerCase())),
  );
  const catName = new Map(categories.map((c) => [c._id, c.name]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl">Menu</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <div
              role="group"
              aria-label="Section"
              className="flex rounded-full border-2 border-line p-0.5"
            >
              {[
                ['items', 'Items'],
                ['categories', 'Categories'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                  className={`rounded-full px-4 py-1.5 font-bold ${tab === k ? 'bg-chai-700 text-white dark:bg-saffron dark:text-iron' : ''}`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {isAdmin && (
            <Button onClick={() => (tab === 'items' ? setEditing('new') : setEditingCat('new'))}>
              + New {tab === 'items' ? 'item' : 'category'}
            </Button>
          )}
        </div>
      </div>

      {tab === 'items' ? (
        <Panel>
          <label htmlFor="adm-search" className="sr-only">
            Search menu items
          </label>
          <input
            id="adm-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="mb-4 h-11 w-full rounded-full border-2 border-line bg-surface px-4 focus:border-kulhad focus:outline-none"
          />
          {!isAdmin && (
            <p className="mb-3 text-sm text-muted">
              Use the switch to mark an item sold out or available again. Customers see the change
              within seconds.
            </p>
          )}
          <ul className="divide-y divide-line">
            {list.map((i) => (
              <li key={i._id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  <Img
                    src={i.image?.url}
                    alt=""
                    width={120}
                    sizes="56px"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">
                    <VegMark isVeg={i.isVeg} /> <span className="truncate">{i.name}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {catName.get(i.categoryId) ?? '—'} · {formatPrice(i.price)}
                    {i.variants?.length ? ` · ${i.variants.length} sizes` : ''}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-bold">
                  {i.isAvailable ? 'In stock' : <Badge tone="danger">Sold out</Badge>}
                  <Switch
                    checked={i.isAvailable}
                    onChange={(v) => stock.mutate({ id: i._id, isAvailable: v })}
                    label={`${i.name} in stock`}
                  />
                </label>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(i)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        window.confirm(`Remove ${i.name}?`) && removeItem.mutate(i._id)
                      }
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
            {items.isLoading && <li className="py-6 text-center">Loading…</li>}
            {!items.isLoading && list.length === 0 && (
              <li className="py-8 text-center text-muted">No items found.</li>
            )}
          </ul>
          <LoadMore query={items} />
        </Panel>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {categories.map((c) => (
              <li key={c._id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {c.name} {!c.isActive && <Badge tone="danger">Hidden</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    Order {c.sortOrder}
                    {c.description ? ` · ${c.description}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditingCat(c)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.confirm(`Remove ${c.name}?`) && removeCat.mutate(c._id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <ItemForm
          item={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {editingCat && (
        <CategoryForm
          category={editingCat === 'new' ? null : editingCat}
          onClose={() => setEditingCat(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
