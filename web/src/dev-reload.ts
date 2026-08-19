/// Dev-only. The collaborative preview often cannot hold Vite's HMR websocket,
/// so we poll a version the server bumps on file changes and reload the page.
if (import.meta.env.DEV) {
  const read = () => fetch("/__dev_version", { cache: "no-store" }).then((r) => r.text());
  void read()
    .then((initial) => {
      let version = initial;
      setInterval(() => {
        void read()
          .then((next) => {
            if (next !== version) location.reload();
            version = next;
          })
          .catch(() => {});
      }, 700);
    })
    .catch(() => {});
}
