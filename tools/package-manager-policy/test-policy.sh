#!/bin/bash
set -eu

script_dir=$(cd -- "$(/usr/bin/dirname "$0")" && pwd)
reminder="$script_dir/package-manager-reminder.sh"
fixture=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/package-manager-policy.XXXXXX") || exit 1
trap '/bin/rm -rf -- "$fixture"' EXIT
export HOME="$fixture/home"
alternate_bin="$HOME/.nvm/versions/node/v16.20.2/bin"
export PATH="$fixture/bin:$alternate_bin"
export TMPDIR="$fixture/tmp"
project="$fixture/project with spaces"
/bin/mkdir -p "$TMPDIR" "$project" "$fixture/bin" "$alternate_bin"

function /usr/bin/sw_vers { printf 'test\n'; }
function /usr/bin/stat { printf '%s\n' "${console_uid:-$EUID}"; }
function /usr/bin/shlock { (set -C; printf '%s\n' "$2" > "$4") 2>/dev/null; }
function /usr/bin/osascript {
  [[ "$1" == - && ! -f "$fixture/display-failure" ]] || return 1
  printf '%s\n' "$2" >> "$fixture/dialogs"
  printf 'shown\n' >> "$fixture/dialog-count"
}

# Source in a child shell so the macOS command doubles are available to it.
run_reminder() ( source "$reminder" "$@" )
contains() {
  [[ "$1" == *"$2"* ]] || { printf 'Expected %s in:\n%s\n' "$2" "$1" >&2; exit 1; }
}
write_probe() {
  /bin/cat > "$1" <<'PROBE'
#!/bin/bash
[[ "$1" == --version && "$COREPACK_ENABLE_NETWORK" == 0 ]] || exit 1
tool=${0##*/}
if [[ -f "$PWD/$tool.version" ]]; then
  /bin/cat "$PWD/$tool.version"
else
  /bin/cat "${0%/*}/$tool.version"
fi
PROBE
  /bin/chmod +x "$1"
}
for tool in npm pnpm yarn bun deno; do
  write_probe "$fixture/bin/$tool"
done
write_probe "$alternate_bin/npm"
printf '11.10.0\n' > "$fixture/bin/npm.version"
printf '10.16.0\n' > "$fixture/bin/pnpm.version"
printf '4.12.0-rc.1\n' > "$fixture/bin/yarn.version"
printf '1.3.0+build.1\n' > "$fixture/bin/bun.version"
printf 'deno 2.5.0 (stable)\nv8 example\n' > "$fixture/bin/deno.version"
printf '9.0.0\n' > "$alternate_bin/npm.version"
printf '4.13.0\n' > "$project/yarn.version"

home_result=$(run_reminder --check)
contains "$home_result" 'npm 11.10.0: meets-minimum'
contains "$home_result" 'pnpm 10.16.0: outdated'
contains "$home_result" 'yarn 4.12.0-rc.1: outdated'
contains "$home_result" 'bun 1.3.0+build.1: meets-minimum'
contains "$(run_reminder --check "$project")" 'yarn 4.13.0: meets-minimum'
[[ "$home_result" != *'deno'* && "$home_result" != *"$alternate_bin"* ]]
inventory=$(source "$script_dir/inventory.sh")
contains "$inventory" "$fixture/bin/npm  <- active on PATH"
contains "$inventory" "9.0.0"
contains "$inventory" "$alternate_bin/npm  (inventory only)"
contains "$inventory" "2.5.0"
[[ ! -e "$HOME/Library" ]]

state="$HOME/Library/Application Support/Package Manager Reminder"
console_uid=99999999 run_reminder --remind > /dev/null
[[ ! -e "$state" ]]
: > "$fixture/display-failure"
if run_reminder --remind > /dev/null 2>&1; then exit 1; fi
[[ ! -f "$state/last-shown" ]]
/bin/rm "$fixture/display-failure"
run_reminder --remind > /dev/null & first_pid=$!
run_reminder --remind > /dev/null & second_pid=$!
wait "$first_pid"
wait "$second_pid"
run_reminder --remind > /dev/null
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 1 ]]
dialog=$(<"$fixture/dialogs")
contains "$dialog" "pnpm 10.16.0"
contains "$dialog" "yarn 4.12.0-rc.1"
[[ "$dialog" != *'npm 9.0.0'* && "$dialog" != *'deno'* ]]

printf '%s\n' "$(( $(/bin/date +%s) - 72 * 60 * 60 ))" > "$state/last-shown"
run_reminder --remind > /dev/null
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 2 ]]
printf '10.17.0\n' > "$fixture/bin/pnpm.version"
printf '4.12.0\n' > "$fixture/bin/yarn.version"
printf '1\n' > "$state/last-shown"
run_reminder --remind > /dev/null
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 2 ]]

# The nvm copy is still discoverable even when npm is absent from PATH.
inventory=$(PATH="$project" source "$script_dir/inventory.sh")
contains "$inventory" "$alternate_bin/npm  (inventory only)"
result=$(PATH="$project" run_reminder --remind)
contains "$result" 'npm: not on this PATH'
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 2 ]]

# Reordering PATH makes the same older copy eligible, then ineligible again.
result=$(PATH="$alternate_bin:$fixture/bin" run_reminder --remind)
contains "$result" "npm 9.0.0: outdated ($alternate_bin/npm)"
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 3 ]]
dialog=$(<"$fixture/dialogs")
contains "$dialog" "npm 9.0.0 — requires 11.10.0 or later"$'\n'"$alternate_bin/npm"
[[ "$dialog" != *"$fixture/bin/npm"* ]]
printf '1\n' > "$state/last-shown"
result=$(run_reminder --remind)
contains "$result" "npm 11.10.0: meets-minimum ($fixture/bin/npm)"
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 3 ]]

/bin/rm "$fixture/bin/yarn.version" "$fixture/bin/bun"
result=$(run_reminder --remind)
contains "$result" 'yarn: version unknown'
contains "$result" 'bun: not on this PATH'
[[ $(/usr/bin/wc -l < "$fixture/dialog-count") -eq 3 ]]
printf 'Passed inventory, version, project-pin, session, and reminder checks.\n'
