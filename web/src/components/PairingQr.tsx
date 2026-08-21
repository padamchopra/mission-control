import { encode } from "uqr";

/// A pairing QR as a person photographs it from the other device. The link is
/// also copyable, so this is the phone's path rather than the only path.

export function PairingQr({ value }: { value: string }) {
  const qr = encode(value, { border: 1 });
  const size = qr.size;
  const cell = 3;
  const boxes: string[] = [];
  const dark = (x: number, y: number): boolean => {
    const data = qr.data as boolean[][] | boolean[] | Uint8Array;
    if (Array.isArray(data) && Array.isArray((data as boolean[][])[0])) {
      return Boolean((data as boolean[][])[y]?.[x]);
    }
    return Boolean((data as boolean[] | Uint8Array)[y * size + x]);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (dark(x, y)) boxes.push(`M${x * cell},${y * cell}h${cell}v${cell}h-${cell}z`);
    }
  }
  return (
    <svg
      width={size * cell}
      height={size * cell}
      viewBox={`0 0 ${size * cell} ${size * cell}`}
      className="rounded-md bg-white p-1"
      role="img"
      aria-label="Pairing QR"
    >
      <path d={boxes.join("")} fill="#111" />
    </svg>
  );
}
