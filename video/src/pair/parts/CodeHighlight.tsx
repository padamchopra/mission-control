/// The ring drawn around a six-digit code while the two are being compared.
///
/// One component used for both ends, so the two rings cannot drift apart —
/// only `left` and `top` differ at the call sites. The radius is tighter than
/// the 16-to-18 of the panels it sits inside: nested rounded rectangles have to
/// step *down* in radius or the corners read as mismatched, which is exactly
/// what an equal-radius ring inside the dialog's code box looked like.
export const CodeHighlight: React.FC<{
  left: number;
  top: number;
  opacity: number;
  scale: number;
}> = ({ left, top, opacity, scale }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 370,
      height: 74,
      borderRadius: 12,
      border: "3px solid #60a5fa",
      boxShadow: "0 0 24px -4px rgba(96, 165, 250, 0.45)",
      opacity,
      scale,
    }}
  />
);
