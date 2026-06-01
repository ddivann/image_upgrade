export type SpriteSource = Blob | string | HTMLImageElement | ImageBitmap;

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить изображение: ${src}`));
    image.src = src;
  });
}

async function toImageBitmap(source: SpriteSource): Promise<ImageBitmap> {
  if (source instanceof ImageBitmap) {
    return source;
  }

  if (typeof source === 'string') {
    const image = await loadImageElement(source);
    return await createImageBitmap(image);
  }

  if (source instanceof HTMLImageElement) {
    if (!source.complete) {
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error('Ошибка загрузки HTMLImageElement'));
      });
    }
    return await createImageBitmap(source);
  }

  return await createImageBitmap(source);
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return await canvas.convertToBlob({ type });
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось создать Blob из canvas'));
        return;
      }
      resolve(blob);
    }, type);
  });
}

export async function splitSprite(source: SpriteSource, rows: number, cols: number): Promise<Blob[]> {
  if (rows <= 0 || cols <= 0) {
    throw new Error('rows и cols должны быть больше 0');
  }

  const bitmap = await toImageBitmap(source);
  const fullWidth = bitmap.width;
  const fullHeight = bitmap.height;
  const tileWidth = Math.floor(fullWidth / cols);
  const tileHeight = Math.floor(fullHeight / rows);

  const tiles: Blob[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const sourceX = col * tileWidth;
      const sourceY = row * tileHeight;
      const width = col === cols - 1 ? fullWidth - sourceX : tileWidth;
      const height = row === rows - 1 ? fullHeight - sourceY : tileHeight;

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
      if (!ctx) {
        throw new Error('CanvasRenderingContext2D не поддерживается');
      }

      ctx.drawImage(bitmap, sourceX, sourceY, width, height, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, 'image/png');
      tiles.push(blob);
    }
  }

  return tiles;
}
