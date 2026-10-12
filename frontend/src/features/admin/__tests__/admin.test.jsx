import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('../../../lib/axios.js', () => ({ api: { get: vi.fn() }, unwrap: (r) => r.data.data }));
vi.mock('@imagekit/react', () => ({
  upload: vi.fn(),
  Image: (p) => <img alt={p.alt} src={p.src} />,
}));

import { upload } from '@imagekit/react';
import { api } from '../../../lib/axios.js';
import { BarChart, LineChart, niceScale } from '../components/Charts.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { fromLocalInput, paiseToRupees, rupeesToPaise, toLocalInput } from '../money.js';
import { monthCells } from '../pages/BookingsPage.jsx';
import { playAlert, unlockAudio } from '../sound.js';

describe('money helpers', () => {
  it('converts rupees <-> paise without float drift', () => {
    expect(rupeesToPaise('199.99')).toBe(19999);
    expect(rupeesToPaise('1,250')).toBe(125000);
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise('')).toBeUndefined();
    expect(rupeesToPaise('abc')).toBeUndefined();
    expect(paiseToRupees(12550)).toBe('125.5');
    expect(paiseToRupees(undefined)).toBe('');
  });
  it('round-trips datetime-local values', () => {
    const iso = '2026-10-20T08:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(undefined)).toBe('');
  });
});

describe('niceScale', () => {
  it('picks round tick values that cover the data', () => {
    expect(niceScale(0).max).toBe(1);
    const s = niceScale(8700);
    expect(s.max).toBeGreaterThanOrEqual(8700);
    expect(s.values[0]).toBe(0);
    expect(new Set(s.values.map((v) => v % s.step)).size).toBe(1);
    expect(niceScale(7).max).toBe(8);
  });
});

describe('charts are accessible', () => {
  const data = [
    { label: 'Mon', value: 10 },
    { label: 'Tue', value: 30 },
    { label: 'Wed', value: 0 },
  ];
  it('LineChart exposes an accessible name and a data table', () => {
    const { container } = render(
      <LineChart data={data} caption="Revenue by day" format={(n) => `₹${n}`} />,
    );
    expect(screen.getByRole('img', { name: /Revenue by day.*3 points.*₹30/ })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Tue');
    expect([...container.querySelectorAll('circle > title')].map((t) => t.textContent)).toEqual([
      'Mon: ₹10',
      'Tue: ₹30',
      'Wed: ₹0',
    ]);
  });
  it('BarChart renders one bar per datum and handles all-zero data', () => {
    const { container, rerender } = render(<BarChart data={data} caption="Orders" />);
    expect(container.querySelectorAll('rect[data-bar]')).toHaveLength(3);
    rerender(<BarChart data={data.map((d) => ({ ...d, value: 0 }))} caption="Orders" />);
    expect(screen.getByRole('img', { name: /Orders/ })).toBeInTheDocument();
  });
});

describe('monthCells', () => {
  it('pads to the weekday and lists every day', () => {
    const cells = monthCells('2026-10'); // 1 Oct 2026 is a Thursday
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[4]).toBe('2026-10-01');
    expect(cells.at(-1)).toBe('2026-10-31');
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(monthCells('2024-02').filter(Boolean)).toHaveLength(29);
  });
});

describe('alert sound', () => {
  it('stays silent until audio is unlocked, then plays a two-tone alert', () => {
    expect(playAlert()).toBe(false);
    const osc = {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn();
      createOscillator = () => osc;
      createGain = () => gain;
    }
    window.AudioContext = FakeCtx;
    expect(unlockAudio()).toBe(true);
    expect(playAlert()).toBe(true);
    expect(osc.start).toHaveBeenCalledTimes(2);
  });
});

describe('ImageUploader', () => {
  const file = (over = {}) => new File(['x'], 'chai.png', { type: 'image/png', ...over });

  it('signs via the API, uploads straight to ImageKit and returns only the stored fields', async () => {
    api.get.mockResolvedValue({
      data: {
        data: {
          token: 't',
          expire: 123,
          signature: 's',
          publicKey: 'pk',
          urlEndpoint: 'https://ik.imagekit.io/x',
          uploadFolder: '/jailkichai/menu',
        },
      },
    });
    upload.mockResolvedValue({
      fileId: 'f1',
      url: 'https://ik.imagekit.io/x/a.png',
      filePath: '/jailkichai/menu/a.png',
      thumbnailUrl: 'https://ik.imagekit.io/x/t.png',
      extra: 'dropped',
    });
    const onChange = vi.fn();
    render(<ImageUploader onChange={onChange} folder="menu" />);
    await userEvent.upload(screen.getByLabelText('Image'), file());
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        fileId: 'f1',
        url: 'https://ik.imagekit.io/x/a.png',
        filePath: '/jailkichai/menu/a.png',
        thumbnailUrl: 'https://ik.imagekit.io/x/t.png',
      }),
    );
    expect(api.get).toHaveBeenCalledWith('/uploads/auth', { params: { folder: 'menu' } });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 't',
        signature: 's',
        publicKey: 'pk',
        expire: 123,
        folder: '/jailkichai/menu',
        useUniqueFileName: true,
      }),
    );
  });

  it('rejects wrong types and oversize files before any network call', async () => {
    upload.mockClear();
    api.get.mockClear();
    const { container } = render(<ImageUploader onChange={() => {}} />);
    const input = container.querySelector('input[type=file]');
    await userEvent.upload(input, file({ type: 'application/pdf' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPG, PNG or WebP/);
    const big = file();
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await userEvent.upload(input, big);
    expect(await screen.findByRole('alert')).toHaveTextContent(/under 5 MB/);
    expect(api.get).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows the API error when ImageKit is not configured', async () => {
    api.get.mockRejectedValue({
      response: { status: 503, data: { message: 'Image storage is not configured' } },
    });
    render(<ImageUploader onChange={() => {}} />);
    await userEvent.upload(screen.getByLabelText('Image'), file());
    expect(await screen.findByRole('alert')).toHaveTextContent('Image storage is not configured');
  });
});
