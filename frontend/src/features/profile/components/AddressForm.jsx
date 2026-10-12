import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { fieldError, toApiError } from '../../../lib/apiError.js';

export const addressSchema = z.object({
  label: z.enum(['home', 'work', 'other']),
  name: z.string().trim().min(1, 'Enter a name').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line1: z.string().trim().min(3, 'Enter your house / street').max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  state: z.string().trim().min(2, 'Enter your state').max(80),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
});

const blank = {
  label: 'home',
  name: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
};

/** Create / edit an address in a dialog. Server-side validation errors are mapped onto fields. */
export default function AddressForm({ open, onClose, initial, onSubmit, defaultValues = {} }) {
  const form = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: { ...blank, ...defaultValues, ...initial },
  });
  const { register, handleSubmit, formState, setError } = form;
  const e = formState.errors;

  const submit = async (values) => {
    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v !== undefined),
    );
    try {
      await onSubmit(clean);
      onClose();
    } catch (err) {
      const api = toApiError(err);
      Object.keys(blank).forEach((f) => {
        const msg = fieldError(api.details, f);
        if (msg) setError(f, { message: msg });
      });
      if (!api.details) setError('root', { message: api.message });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit address' : 'New address'}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Save as</legend>
          <div className="flex gap-2">
            {['home', 'work', 'other'].map((l) => (
              <label key={l} className="cursor-pointer">
                <input type="radio" value={l} className="peer sr-only" {...register('label')} />
                <span className="inline-block rounded-full border-2 border-line px-4 py-1.5 font-bold capitalize peer-checked:border-kulhad peer-checked:bg-kulhad peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2">
                  {l}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            autoComplete="name"
            error={e.name?.message}
            {...register('name')}
          />
          <Input
            label="Mobile number"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            error={e.phone?.message}
            {...register('phone')}
          />
        </div>
        <Input
          label="House / flat, street"
          autoComplete="address-line1"
          error={e.line1?.message}
          {...register('line1')}
        />
        <Input
          label="Area (optional)"
          autoComplete="address-line2"
          error={e.line2?.message}
          {...register('line2')}
        />
        <Input label="Landmark (optional)" error={e.landmark?.message} {...register('landmark')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="City"
            autoComplete="address-level2"
            error={e.city?.message}
            {...register('city')}
          />
          <Input
            label="State"
            autoComplete="address-level1"
            error={e.state?.message}
            {...register('state')}
          />
          <Input
            label="Pincode"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            error={e.pincode?.message}
            {...register('pincode')}
          />
        </div>
        {e.root && (
          <p role="alert" className="text-sm font-medium text-nonveg">
            {e.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save address
        </Button>
      </form>
    </Modal>
  );
}
