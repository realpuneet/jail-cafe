import { useId, useRef, useState } from 'react';
import { upload } from '@imagekit/react';
import { api, unwrap } from '../../../lib/axios.js';
import { toApiError } from '../../../lib/apiError.js';
import Img from '../../../components/common/Img.jsx';
import Button from '../../../components/ui/Button.jsx';

const MAX_MB = 5;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Direct-to-ImageKit upload. The API only signs the request (GET /uploads/auth); the file never
 * passes through our server. Returns the stored shape { fileId, url, filePath, thumbnailUrl }.
 * @param {{value?: object, onChange: (img: object|null) => void, folder?: string, label?: string}} props
 */
export default function ImageUploader({ value, onChange, folder = 'menu', label = 'Image' }) {
  const id = useId();
  const input = useRef(null);
  const abort = useRef(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const pick = async (file) => {
    setError('');
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return setError('Use a JPG, PNG or WebP image.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Image must be under ${MAX_MB} MB.`);
    abort.current = new AbortController();
    try {
      setProgress(0);
      const auth = await api.get('/uploads/auth', { params: { folder } }).then(unwrap);
      const res = await upload({
        file,
        fileName: file.name,
        folder: auth.uploadFolder,
        useUniqueFileName: true,
        token: auth.token,
        expire: auth.expire,
        signature: auth.signature,
        publicKey: auth.publicKey,
        onProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
        abortSignal: abort.current.signal,
      });
      onChange({
        fileId: res.fileId,
        url: res.url,
        filePath: res.filePath,
        thumbnailUrl: res.thumbnailUrl,
      });
    } catch (err) {
      setError(
        err?.name === 'AbortError'
          ? 'Upload cancelled.'
          : err?.response
            ? toApiError(err).message
            : (err?.message ?? 'Upload failed.'),
      );
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-bold" id={`${id}-l`}>
        {label}
      </p>
      <div className="flex items-center gap-4">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          <Img
            src={value?.url}
            alt={value ? 'Current image' : ''}
            width={240}
            sizes="112px"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="space-y-2">
          <input
            ref={input}
            id={id}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-labelledby={`${id}-l`}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => input.current?.click()}
              loading={progress !== null}
            >
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && progress === null && (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Remove
              </Button>
            )}
            {progress !== null && (
              <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            )}
          </div>
          {progress !== null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Upload progress"
              className="h-2 w-40 overflow-hidden rounded bg-line"
            >
              <div
                className="h-full origin-left bg-kulhad"
                style={{ transform: `scaleX(${progress / 100})` }}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-nonveg">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
