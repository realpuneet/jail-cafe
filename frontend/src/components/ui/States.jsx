import Button from './Button.jsx';

/** Empty list / nothing here yet. */
export function EmptyState({ title, message, action, icon = '🫖' }) {
  return (
    <div className="mx-auto max-w-sm py-14 text-center">
      <div className="mb-4 text-6xl" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-2xl">{title}</h2>
      {message && <p className="mt-2 text-muted">{message}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/** Failed request with retry. */
export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div role="alert" className="mx-auto max-w-sm py-14 text-center">
      <div className="mb-4 text-6xl" aria-hidden="true">
        🚧
      </div>
      <h2 className="text-2xl">Caught behind bars</h2>
      <p className="mt-2 text-muted">{message}</p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button onClick={onRetry} variant="outline">
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
