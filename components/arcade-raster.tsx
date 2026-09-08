'use client';
import { useEffect, useRef } from 'react';

type Rect = readonly [number, number, number, number];
const atlases = new Map<string, Promise<HTMLCanvasElement>>();

// Keep the native generated texture intact. The exporter baked a gray checker
// into RGB; only neutral pixels connected to the outside are transparent.
// Enclosed whites (eyes, sneakers, shield cross) remain part of the sprite.
function loadAtlas(src: string) {
  let pending = atlases.get(src);
  if (pending) return pending;
  pending = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(image, 0, 0);
      const bitmap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = bitmap.data,
        width = canvas.width,
        height = canvas.height;
      const total = width * height,
        seen = new Uint8Array(total);
      const queue = new Int32Array(total);
      let head = 0,
        tail = 0;
      const visit = (index: number) => {
        if (seen[index]) return;
        const at = index * 4;
        const low = Math.min(pixels[at], pixels[at + 1], pixels[at + 2]);
        const high = Math.max(pixels[at], pixels[at + 1], pixels[at + 2]);
        if (pixels[at + 3] >= 128 && (low < 90 || high - low > 20)) return;
        seen[index] = 1;
        queue[tail++] = index;
      };
      for (let x = 0; x < width; x++) {
        visit(x);
        visit((height - 1) * width + x);
      }
      for (let y = 1; y < height - 1; y++) {
        visit(y * width);
        visit(y * width + width - 1);
      }
      while (head < tail) {
        const at = queue[head++],
          x = at % width;
        pixels[at * 4 + 3] = 0;
        if (x > 0) visit(at - 1);
        if (x < width - 1) visit(at + 1);
        if (at >= width) visit(at - width);
        if (at < total - width) visit(at + width);
      }
      ctx.putImageData(bitmap, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => {
      atlases.delete(src);
      reject(new Error(`Texture unavailable: ${src}`));
    };
    image.src = src;
  });
  atlases.set(src, pending);
  return pending;
}

// A small backing canvas sets the actual pixel grid. CSS enlarges it without
// smoothing; high-resolution source detail cannot leak into the game view.
export function ArcadeRaster({
  src,
  crop,
  frame,
  width,
  height,
  className,
  style,
}: {
  src: string;
  crop: Rect;
  frame: Rect;
  width: number;
  height: number;
  className: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cx, cy, cw, ch] = crop,
    [fx, fy, fw, fh] = frame;
  useEffect(() => {
    let disposed = false;
    const node = ref.current;
    if (!node) return;
    node.dataset.ready = 'false';
    loadAtlas(src)
      .then((atlas) => {
        if (disposed) return;
        const ctx = node.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          atlas,
          cx,
          cy,
          cw,
          ch,
          ((cx - fx) * width) / fw,
          ((cy - fy) * height) / fh,
          (cw * width) / fw,
          (ch * height) / fh,
        );
        node.dataset.ready = 'true';
      })
      .catch(() => {
        if (!disposed) node.dataset.ready = 'error';
      });
    return () => {
      disposed = true;
    };
  }, [src, cx, cy, cw, ch, fx, fy, fw, fh, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={className}
      style={style}
      data-atlas={src}
      aria-hidden="true"
    />
  );
}
