// The generated sheets contain a light export matte. This render-time mask
// removes it while retaining the untouched source images and their pixel edges.
export function DeadCellsCutout({
  id,
  bounds,
}: {
  id: string;
  bounds: number[];
}) {
  const [x, y, width, height] = bounds;
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={x}
      y={y}
      width={width}
      height={height}
      colorInterpolationFilters="sRGB"
    >
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 3"
      />
      <feComponentTransfer result="silhouette">
        <feFuncA type="discrete" tableValues="0 1 1 1" />
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="silhouette" operator="in" />
    </filter>
  );
}
