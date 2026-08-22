import { Check } from "./Icons";

/// The link drawn in the gap between the two windows, from the code on the
/// asking machine to the same code on the machine being asked. It lives entirely
/// in the seam, so it never covers either window.
///
/// Endpoints are fixed to where the two code displays actually sit in the
/// two-window stage: (884, 463) on the left, (1036, 560) on the right.
export const SeamLink: React.FC<{
  draw: number;
  badge: number;
  label: number;
  tone: "asking" | "paired";
}> = ({ draw, badge, label, tone }) => (
  <>
    <svg
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, width: 1920, height: 1080 }}
      fill="none"
    >
      <path
        d="M884 463 C 922 463, 998 560, 1036 560"
        pathLength={1}
        stroke={tone === "paired" ? "#00bc7d" : "#1b4ed8"}
        strokeWidth={tone === "paired" ? 5 : 4}
        strokeLinecap="round"
        strokeDasharray={`${draw} 1`}
      />
      <circle cx="884" cy="463" r="8" fill={tone === "paired" ? "#00bc7d" : "#1b4ed8"} />
      <circle
        cx="1036"
        cy="560"
        r="8"
        fill={tone === "paired" ? "#00bc7d" : "#1b4ed8"}
        opacity={draw > 0.96 ? 1 : 0}
      />
    </svg>

    <div
      style={{
        position: "absolute",
        left: 916,
        top: 467,
        width: 88,
        height: 88,
        borderRadius: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "paired" ? "#00bc7d" : "#1b4ed8",
        border: "5px solid #fcfcfc",
        boxShadow: "0 10px 26px -8px rgba(39, 39, 42, 0.3)",
        opacity: badge,
        scale: badge,
      }}
    >
      <Check size={44} color="#ffffff" />
    </div>

    <div
      style={{
        position: "absolute",
        left: 890,
        top: 404,
        width: 140,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 0",
        borderRadius: 999,
        border: "1.5px solid #e4e4e7",
        backgroundColor: "#ffffff",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 23,
        fontWeight: 500,
        color: tone === "paired" ? "#007a55" : "#1b4ed8",
        boxShadow: "0 6px 16px -6px rgba(39, 39, 42, 0.22)",
        opacity: label,
      }}
    >
      {tone === "paired" ? "paired" : "same code"}
    </div>
  </>
);
