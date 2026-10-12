import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';

const W = 640;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

/** "Nice" axis maximum and tick values for a data max. */
export function niceScale(max, ticks = 4) {
  if (max <= 0) return { max: 1, step: 1, values: [0, 1] };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  return {
    max: top,
    step,
    values: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step),
  };
}

function Axes({ scale, format, x }) {
  return (
    <g>
      {scale.values.map((v) => {
        const y = PAD.t + (1 - v / scale.max) * (H - PAD.t - PAD.b);
        return (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {format(v)}
            </text>
          </g>
        );
      })}
      {x}
    </g>
  );
}

/** Visually hidden data table so screen readers get the numbers, not just a picture. */
function DataTable({ caption, data, format }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Label</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <td>{d.label}</td>
            <td>{format(d.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Line + area chart. data: [{label, value}]. Points are keyboard-focusable and carry <title> tooltips.
 */
export function LineChart({
  data,
  format = String,
  caption = 'Line chart',
  color = 'var(--color-kulhad)',
}) {
  const ref = useRef(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const scale = niceScale(max);
  const x = (i) =>
    PAD.l +
    (data.length > 1 ? (i / (data.length - 1)) * (W - PAD.l - PAD.r) : (W - PAD.l - PAD.r) / 2);
  const y = (v) => PAD.t + (1 - v / scale.max) * (H - PAD.t - PAD.b);
  const line = data
    .map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(' ');
  const area = data.length
    ? `${line} L${x(data.length - 1).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`
    : '';
  const every = Math.ceil(data.length / 7);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from('[data-area]', { opacity: 0, duration: 0.8 });
      gsap.from('[data-dot]', {
        scale: 0,
        transformOrigin: '50% 50%',
        stagger: 0.02,
        duration: 0.3,
      });
    },
    { scope: ref, dependencies: [line] },
  );

  return (
    <figure ref={ref} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${caption}. ${data.length} points, maximum ${format(max)}.`}
        className="h-auto w-full"
      >
        <Axes
          scale={scale}
          format={format}
          x={data.map((d, i) =>
            i % every === 0 ? (
              <text
                key={d.label}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted)"
              >
                {d.label}
              </text>
            ) : null,
          )}
        />
        {area && <path data-area d={area} fill={color} opacity="0.12" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {data.map((d, i) => (
          <circle
            key={d.label}
            data-dot
            cx={x(i)}
            cy={y(d.value)}
            r="4"
            fill="var(--surface)"
            stroke={color}
            strokeWidth="2.5"
            tabIndex={0}
          >
            <title>{`${d.label}: ${format(d.value)}`}</title>
          </circle>
        ))}
      </svg>
      <DataTable caption={caption} data={data} format={format} />
    </figure>
  );
}

/** Vertical bars. Bars grow with scaleY (transform only). */
export function BarChart({
  data,
  format = String,
  caption = 'Bar chart',
  color = 'var(--color-saffron)',
}) {
  const ref = useRef(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const scale = niceScale(max);
  const slot = (W - PAD.l - PAD.r) / Math.max(data.length, 1);
  const bw = Math.min(slot * 0.7, 28);
  const every = Math.ceil(data.length / 12);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from('[data-bar]', {
        scaleY: 0,
        transformOrigin: '50% 100%',
        stagger: 0.015,
        duration: 0.5,
      });
    },
    { scope: ref, dependencies: [data.map((d) => d.value).join(',')] },
  );

  return (
    <figure ref={ref} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${caption}. ${data.length} bars, maximum ${format(max)}.`}
        className="h-auto w-full"
      >
        <Axes
          scale={scale}
          format={format}
          x={data.map((d, i) =>
            i % every === 0 ? (
              <text
                key={d.label}
                x={PAD.l + slot * i + slot / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted)"
              >
                {d.label}
              </text>
            ) : null,
          )}
        />
        {data.map((d, i) => {
          const h = (d.value / scale.max) * (H - PAD.t - PAD.b);
          return (
            <rect
              key={d.label}
              data-bar
              x={PAD.l + slot * i + (slot - bw) / 2}
              y={H - PAD.b - h}
              width={bw}
              height={Math.max(h, d.value > 0 ? 1 : 0)}
              rx="3"
              fill={color}
              tabIndex={0}
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <DataTable caption={caption} data={data} format={format} />
    </figure>
  );
}
