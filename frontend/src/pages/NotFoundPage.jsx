import Seo from '../components/common/Seo.jsx';
import Button from '../components/ui/Button.jsx';
import { EmptyState } from '../components/ui/States.jsx';

export default function NotFoundPage() {
  return (
    <div className="container-page">
      <Seo title="Page not found" noindex />
      <EmptyState
        icon="🚔"
        title="404 — this page escaped"
        message="We couldn't find what you were looking for."
        action={<Button to="/">Back home</Button>}
      />
    </div>
  );
}
