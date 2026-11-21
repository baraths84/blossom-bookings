#!/bin/bash
# macOS inventory of executable package managers, including inactive installs.

if (( EUID == 0 )); then
  printf 'Run inventory as the developer. Package manager probes must not run as root.\n' >&2
  exit 1
fi
cd -- "${HOME:?Missing user home directory}" || exit 1
shopt -s nullglob
export COREPACK_ENABLE_NETWORK=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_ENABLE_AUTO_PIN=0
errors=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/package-manager-inventory.XXXXXX") || exit 1
trap '/bin/rm -f "$errors"' EXIT

IFS=: read -r -a directories <<< "$PATH"
directories+=(
  /opt/homebrew/bin /usr/local/bin /opt/local/bin /usr/bin
  /opt/homebrew/opt/node@*/bin /usr/local/opt/node@*/bin
  "$HOME/.volta/bin" "$HOME/.bun/bin" "$HOME/.deno/bin"
  "$HOME/.local/share/pnpm" "$HOME/Library/pnpm" "$HOME/Library/pnpm/bin"
  "$HOME/.asdf/shims" "$HOME/.local/share/mise/shims" "$HOME/.nvm/versions/node/"*/bin
  "$HOME/.fnm/node-versions/"*/installation/bin
  "$HOME/Library/Application Support/fnm/node-versions/"*/installation/bin
  "$HOME/.nodenv/shims" "$HOME/.nodenv/versions/"*/bin "$HOME/.proto/shims" "$HOME/.proto/bin"
  "$HOME/.npm-global/bin" "$HOME/n/bin" "$HOME/.local/bin" "$HOME/.nix-profile/bin"
)

printf 'macOS %s %s\n' "$(/usr/bin/sw_vers -productVersion)" "$(/usr/bin/uname -m)"
for tool in npm pnpm yarn bun deno; do
  active=$(type -P "$tool")
  seen=$'\n'
  found=0
  for directory in "${directories[@]}"; do
    executable="${directory:-.}/$tool"
    [[ -f "$executable" && -x "$executable" ]] || continue
    [[ "$seen" == *$'\n'"$executable"$'\n'* ]] && continue
    seen+="$executable"$'\n'
    found=1
    marker=""
    probe_path=$PATH
    if [[ "$executable" == "$active" ]]; then
      marker="  <- active on PATH"
    else
      # Let an inactive install use its sibling node executable when available.
      probe_path="${directory:-.}:$PATH"
    fi
    if output=$(PATH="$probe_path" "$executable" --version </dev/null 2>"$errors") && [[ -n "$output" ]]; then
      version=${output%%$'\n'*}
      if [[ "$tool" == deno ]]; then
        version=${version#deno }
        version=${version%% *}
      fi
    else
      reason=""
      IFS= read -r reason < "$errors"
      version="unknown${reason:+: ${reason:0:80}}"
    fi
    printf '%-5s %-14s %s%s\n' "$tool" "$version" "$executable" "$marker"
  done
  (( found )) || printf '%-5s not found in scanned paths\n' "$tool"
done
