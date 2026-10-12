import { useRef } from 'react';
import { useGsapReveal } from '../../hooks/useGsapReveal.js';

/**
 * Staggers direct `[data-reveal]` children into view. Pass `deps` to replay when data changes
 * (e.g. category tab switch).
 */
export default function StaggerList({
  as: Tag = 'div',
  className,
  children,
  deps = [],
  stagger = 0.06,
  y = 22,
  ...rest
}) {
  const ref = useRef(null);
  useGsapReveal(ref, { selector: '[data-reveal]', stagger, y, deps });
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
