/// A Remy window on the other machine, minding its own business. Dim enough to
/// read as "a UI, idling" without competing with the thing being explained.
export const SkeletonPane: React.FC = () => (
  <div style={{ height: 440, display: "flex", flexDirection: "column", gap: 14 }}>
    <div
      style={{
        width: 168,
        height: 20,
        borderRadius: 10,
        backgroundColor: "rgba(255, 255, 255, 0.08)",
      }}
    />
    {[0, 1, 2, 3].map((row) => (
      <div
        key={row}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "20px 22px",
          borderRadius: 18,
          border: "1.5px solid rgba(255, 255, 255, 0.05)",
          backgroundColor: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: "rgba(255, 255, 255, 0.08)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <div
            style={{
              width: row === 1 ? "46%" : row === 3 ? "38%" : "58%",
              height: 18,
              borderRadius: 9,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
            }}
          />
          <div
            style={{
              width: row === 2 ? "62%" : "34%",
              height: 14,
              borderRadius: 7,
              backgroundColor: "rgba(255, 255, 255, 0.045)",
            }}
          />
        </div>
      </div>
    ))}
  </div>
);
