import { Helmet } from 'react-helmet-async';
import { env } from '../../lib/env.js';

/** Per-page <title>, description and OpenGraph/Twitter tags. */
export default function Seo({
  title,
  description = 'Order chai, snacks and fast food, book a table or plan your party at Jail Ki Chai.',
  image,
  noindex = false,
}) {
  const full = title ? `${title} · ${env.appName}` : env.appName;
  return (
    <Helmet>
      <title>{full}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex" />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={env.appName} />
      <meta property="og:title" content={full} />
      <meta property="og:description" content={description} />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
    </Helmet>
  );
}
