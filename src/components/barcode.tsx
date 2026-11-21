import { code128 } from "@/lib/code128";

/** Scannable Code 128 barcode as crisp SVG bars. */
export function Barcode({ value, height = 44 }: { value: string; height?: number }) {
  const widths = code128(value);
  if (!widths) return null;
  const quiet = 10;
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  const bars: { x: number; w: number }[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg viewBox={`0 0 ${total} 10`} preserveAspectRatio="none" width="100%" height={height} shapeRendering="crispEdges" aria-label={`Barcode ${value}`}>
      <rect width={total} height="10" fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="10" fill="#000" />
      ))}
    </svg>
  );
}
