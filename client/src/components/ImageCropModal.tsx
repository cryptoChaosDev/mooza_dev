import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { Loader2, X, Check, ZoomIn } from 'lucide-react';
import { useScrollLock } from "../lib/scrollLock";

type Props = {
  file: File;
  aspect: number;
  cropShape?: 'rect' | 'round';
  title?: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
};

/** Wrap a Blob into a File so callers can reuse their existing FormData flow. */
export function blobToFile(blob: Blob, name: string, type = 'image/jpeg'): File {
  return new File([blob], name, { type });
}

/** Read a File into a data URL. */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Load an HTMLImageElement from a (local) data URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draw the cropped region of the source image onto a canvas and return a JPEG
 * Blob. The source is a freshly-selected local File (data URL), so there is no
 * cross-origin tainting and toBlob works without CORS issues.
 */
async function getCroppedBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropPixels.width);
  canvas.height = Math.round(cropPixels.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, cropPixels.width, cropPixels.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas is empty'))),
      'image/jpeg',
      0.9,
    );
  });
}

export default function ImageCropModal({ file, aspect, cropShape = 'rect', title, onCancel, onCropped }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useScrollLock(true);

  useEffect(() => {
    let cancelled = false;
    readFileAsDataURL(file).then(url => { if (!cancelled) setImageSrc(url); });
    return () => { cancelled = true; };
  }, [file]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      onCropped(blob);
    } catch {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <button onClick={onCancel} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
        <span className="font-semibold text-white text-sm">{title ?? 'Обрезка изображения'}</span>
        <button
          onClick={handleSave}
          disabled={saving || !croppedAreaPixels}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Сохранить
        </button>
      </div>

      {/* Cropper area */}
      <div className="relative flex-1 min-h-0 bg-slate-900">
        {imageSrc ? (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={28} className="text-slate-500 animate-spin" />
          </div>
        )}
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-800 flex-shrink-0">
        <ZoomIn size={16} className="text-slate-400 flex-shrink-0" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          className="flex-1 accent-primary-500"
          aria-label="Масштаб"
        />
      </div>
    </div>,
    document.body,
  );
}
