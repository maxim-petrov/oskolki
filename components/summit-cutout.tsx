// Remove the generator's faint export haze without changing the native PNG.
// Actor faces and black outlines are ~253 alpha; a 1/2 cutoff keeps their color.
export function SummitCutout({
  id,
  bounds: [x, y, width, height],
}: {
  id: string;
  bounds: [number, number, number, number];
}) {
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
      <feComponentTransfer>
        <feFuncA type="discrete" tableValues="0 1" />
      </feComponentTransfer>
    </filter>
  );
}
