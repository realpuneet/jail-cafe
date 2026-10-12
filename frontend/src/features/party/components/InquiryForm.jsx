import { useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import { fieldError, toApiError } from '../../../lib/apiError.js';
import { newIdempotencyKey } from '../../../lib/id.js';
import { addDays, istDate } from '../../booking/dates.js';
import { useAuthStore } from '../../auth/authStore.js';
import { toast } from '../../ui/uiStore.js';
import { createInquiry } from '../api.js';
import { EVENT_TYPES } from '../status.js';

const MIN_LEAD_DAYS = 3;
const schema = z.object({
  eventType: z.enum(['birthday', 'kitty', 'anniversary', 'corporate', 'other']),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  guests: z.coerce
    .number({ invalid_type_error: 'Enter the number of guests' })
    .int()
    .min(1, 'At least 1 guest')
    .max(1000),
  startTime: z.string().optional(),
  name: z.string().trim().min(1, 'Enter your name').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]),
  requirements: z.string().trim().max(1000).optional(),
});

/** Party inquiry form. Package (optional) comes from the card the visitor clicked. */
export default function InquiryForm({ pkg, user }) {
  const navigate = useNavigate();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const minDate = useMemo(() => addDays(istDate(), MIN_LEAD_DAYS), []);
  const { register, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      eventType: pkg?.type ?? 'birthday',
      eventDate: '',
      guests: pkg?.minGuests ?? 20,
      startTime: '',
      name: user?.name ?? '',
      phone: user?.phone?.replace('+91', '') ?? '',
      email: user?.email ?? '',
      requirements: '',
    },
  });
  const e = formState.errors;
  const keyRef = useRef({ sig: '', key: '' });

  const submit = useMutation({
    mutationFn: (values) => {
      const body = {
        ...values,
        packageId: pkg?._id,
        startTime: values.startTime || undefined,
        email: values.email || undefined,
        requirements: values.requirements || undefined,
      };
      const sig = JSON.stringify(body);
      if (keyRef.current.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey() };
      return createInquiry(body, keyRef.current.key);
    },
    onSuccess: (inquiry) => {
      toast.success('Inquiry sent! We will reply with a quote soon.');
      navigate(`/party/inquiries/${inquiry._id}`);
    },
    onError: (err) => {
      const api = toApiError(err);
      ['eventDate', 'guests', 'phone', 'email'].forEach((f) => {
        const msg = fieldError(api.details, f);
        if (msg) setError(f, { message: msg });
      });
      if (!api.details) setError('root', { message: api.message });
    },
  });

  const onSubmit = (values) => {
    if (!authed) return navigate('/login', { state: { from: { pathname: '/party' } } });
    return submit.mutateAsync(values).catch(() => {});
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="card space-y-4 p-5 sm:p-6"
      aria-labelledby="inq-h"
    >
      <div>
        <h2 id="inq-h" className="text-3xl">
          {pkg ? `Enquire about ${pkg.name}` : 'Plan your party'}
        </h2>
        <p className="text-muted">
          Tell us the basics. We reply with a quote, you pay a small token to lock the date.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ev-type" className="mb-1.5 block text-sm font-bold">
            Occasion
          </label>
          <select
            id="ev-type"
            className="h-12 w-full rounded-xl border-2 border-line bg-surface px-3"
            {...register('eventType')}
          >
            {EVENT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Date"
          type="date"
          min={minDate}
          hint={`At least ${MIN_LEAD_DAYS} days from today`}
          error={e.eventDate?.message}
          {...register('eventDate')}
        />
        <Input
          label="Number of guests"
          type="number"
          inputMode="numeric"
          min={1}
          error={e.guests?.message}
          hint={pkg ? `${pkg.minGuests}-${pkg.maxGuests} guests for this package` : undefined}
          {...register('guests')}
        />
        <Input label="Preferred start time (optional)" type="time" {...register('startTime')} />
        <Input
          label="Your name"
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
        label="Email (optional)"
        type="email"
        autoComplete="email"
        error={e.email?.message}
        {...register('email')}
      />
      <div>
        <label htmlFor="ev-req" className="mb-1.5 block text-sm font-bold">
          Anything we should know? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="ev-req"
          rows={3}
          maxLength={1000}
          placeholder="Theme, cake, dietary needs, decorations…"
          className="w-full rounded-xl border-2 border-line bg-surface p-3 focus:border-kulhad focus:outline-none"
          {...register('requirements')}
        />
      </div>
      {e.root && (
        <p role="alert" className="text-sm font-medium text-nonveg">
          {e.root.message}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={submit.isPending}>
        {authed ? 'Request a quote' : 'Login to request a quote'}
      </Button>
    </form>
  );
}
