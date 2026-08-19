# Resolves Remy's config directory. Prefer ~/.remy; keep using
# ~/.mission-control when that's where an existing install already lives.
if [ -n "${MC_CONFIG_DIR:-}" ]; then
  MC_DIR="$MC_CONFIG_DIR"
elif [ -d "$HOME/.remy" ]; then
  MC_DIR="$HOME/.remy"
elif [ -d "$HOME/.mission-control" ]; then
  MC_DIR="$HOME/.mission-control"
else
  MC_DIR="$HOME/.remy"
fi
