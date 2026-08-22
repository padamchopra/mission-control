/// The handful of Lucide glyphs the app itself uses on these surfaces, drawn
/// inline so the video carries no icon dependency. Same 24-unit grid, same
/// stroke geometry, so a frame here matches a screenshot of the window.

type IconProps = { size: number; color: string; strokeWidth?: number };

const box = (size: number) => ({
  width: size,
  height: size,
  flexShrink: 0 as const,
});

export const Laptop: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <path
      d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Monitor: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <rect
      x="2"
      y="3"
      width="20"
      height="14"
      rx="2"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 21h8M12 17v4"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Server: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <rect
      x="2"
      y="2"
      width="20"
      height="8"
      rx="2"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <rect
      x="2"
      y="14"
      width="20"
      height="8"
      rx="2"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <path
      d="M6 6h.01M6 18h.01"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);

export const HardDrive: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <path
      d="M22 12H2m3.45-6.89L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11ZM6 16h.01M10 16h.01"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RefreshCw: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <path
      d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Check: React.FC<IconProps> = ({ size, color, strokeWidth = 2.6 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <path
      d="M20 6 9 17l-5-5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Link2: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <path
      d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Kanban: React.FC<IconProps> = ({ size, color, strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={box(size)}>
    <path
      d="M6 5v11M12 5v6M18 5v14"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/// The macOS pointer, so a click in the video looks like a click. The tip sits
/// at the top-left of the box, which is what callers position.
export const Pointer: React.FC<{ size: number }> = ({ size }) => (
  <svg
    viewBox="0 0 24 32"
    fill="none"
    style={{ width: size, height: (size * 32) / 24, flexShrink: 0 }}
  >
    <path
      d="M3 2v24l6.5-6.5 4 9.6 4-1.8-4-9.6H21Z"
      fill="#ffffff"
      stroke="#27272a"
      strokeWidth="1.7"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);
