import { Image } from '@imagekit/react';
import { isImageKitUrl } from '../../lib/imagekit.js';

const FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f4e7d3"/><g fill="#c78a47"><rect x="60" y="0" width="10" height="300" opacity=".25"/><rect x="130" y="0" width="10" height="300" opacity=".25"/><rect x="200" y="0" width="10" height="300" opacity=".25"/><rect x="270" y="0" width="10" height="300" opacity=".25"/><rect x="340" y="0" width="10" height="300" opacity=".25"/></g><path d="M150 120h100l-10 90a20 20 0 0 1-20 18h-40a20 20 0 0 1-20-18z" fill="#a9672a"/><path d="M250 138h14a14 14 0 0 1 0 28h-18" fill="none" stroke="#a9672a" stroke-width="8" stroke-linecap="round"/></svg>`,
  );

/**
 * Lazy image. ImageKit images get automatic resize/quality/format and a responsive srcset
 * through the ImageKit React SDK; anything else (or no image) falls back gracefully.
 * @param {{src?: string, alt: string, width?: number, sizes?: string, eager?: boolean, className?: string}} props
 */
export default function Img({
  src,
  alt,
  width = 640,
  sizes = '(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw',
  eager = false,
  className = '',
  ...rest
}) {
  const common = {
    alt,
    className,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    fetchPriority: eager ? 'high' : 'auto',
    ...rest,
  };
  if (!src) return <img src={FALLBACK} {...common} />;
  if (isImageKitUrl(src)) {
    return (
      <Image
        src={src}
        width={width}
        sizes={sizes}
        transformation={[{ quality: 75, format: 'auto' }]}
        {...common}
      />
    );
  }
  return <img src={src} {...common} />;
}
