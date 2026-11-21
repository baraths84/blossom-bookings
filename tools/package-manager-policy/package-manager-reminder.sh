#!/bin/bash
# Run in the user's environment. --check [directory] prints results; --remind shows
# one macOS dialog when a tool is outdated, at most once per 72 hours.

mode=${1:---check}
if [[ $# -gt 2 || ( "$mode" != --check && "$mode" != --remind ) || ( "$mode" == --remind && $# -gt 1 ) ]]; then
  printf 'Usage: %s [--check [project-directory] | --remind]\n' "$0" >&2
  exit 2
fi
if (( EUID == 0 )); then
  printf 'Run this script as the developer. Package manager probes must not run as root.\n' >&2
  exit 1
fi
if [[ "$mode" == --remind ]]; then
  console_uid=$(/usr/bin/stat -f '%u' /dev/console) || exit 1
  [[ "$console_uid" == "$EUID" ]] || exit 0
fi

# Reminders use home-directory defaults. A pilot check can probe a project pin.
check_directory=${2:-${HOME:?Missing user home directory}}
cd -- "$check_directory" || exit 1
export COREPACK_ENABLE_NETWORK=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_ENABLE_AUTO_PIN=0

below_minimum() {
  local version=$1 minimum=$2 part
  local -a current required
  IFS=. read -r -a current <<< "${version%%[-+]*}"
  IFS=. read -r -a required <<< "$minimum"
  for part in 0 1 2; do
    (( current[part] < required[part] )) && return 0
    (( current[part] > required[part] )) && return 1
  done
  # At the same major, minor and patch, a prerelease sorts below the release.
  [[ "${version%%+*}" == *-* ]]
}

tools=(npm pnpm yarn bun)
minimums=(11.10.0 10.17.0 4.12.0 1.3.0)
version_pattern='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
outdated=()
for index in "${!tools[@]}"; do
  tool=${tools[index]}
  minimum=${minimums[index]}
  if ! executable=$(type -P "$tool"); then
    printf '%s: not on this PATH\n' "$tool"
    continue
  fi
  if ! version=$("$executable" --version </dev/null 2>/dev/null) || [[ ! "$version" =~ $version_pattern ]]; then
    printf '%s: version unknown (%s)\n' "$tool" "$executable"
    continue
  fi

  if below_minimum "$version" "$minimum"; then
    status=outdated
    outdated+=("$tool $version — requires $minimum or later")
  else
    status=meets-minimum
  fi
  printf '%s %s: %s (%s)\n' "$tool" "$version" "$status" "$executable"
done
[[ "$mode" == --remind && ${#outdated[@]} -gt 0 ]] || exit 0

umask 077
state_dir="$HOME/Library/Application Support/Package Manager Reminder"
/bin/mkdir -p "$state_dir" || exit 1
lock_file="$state_dir/reminder.lock"
# macOS shlock serializes competing checks and recovers locks from dead PIDs.
if /usr/bin/shlock -p "$$" -f "$lock_file"; then
  trap '/bin/rm -f "$lock_file" "$state_dir/last-shown.$$"' EXIT
else
  lock_status=$?
  # shlock returns 1 if another process holds the lock.
  [[ $lock_status -eq 1 && -f "$lock_file" ]] && exit 0
  printf 'Could not create the reminder lock at %s.\n' "$lock_file" >&2
  exit "$lock_status"
fi
trap 'exit 1' HUP INT TERM

stamp="$state_dir/last-shown"
now=$(/bin/date +%s) || exit 1
if [[ -f "$stamp" ]] && read -r last < "$stamp" && [[ "$last" =~ ^[1-9][0-9]{0,11}$ ]]; then
  (( last <= now && now - last < 72 * 60 * 60 )) && exit 0
fi

tool_list=$(printf '%s\n' "${outdated[@]}")
if ! /usr/bin/osascript - "$tool_list" <<'APPLESCRIPT'
on run argv
  set toolList to item 1 of argv
  set messageText to "Please upgrade or switch to the required versions for the December 3, 2026 policy." & return & return & toolList
  display dialog messageText with title "Package manager update" buttons {"OK"} default button "OK" giving up after 120
end run
APPLESCRIPT
then
  printf 'Could not display the reminder in the user session.\n' >&2
  exit 1
fi
/bin/date +%s > "$state_dir/last-shown.$$" && /bin/mv -f "$state_dir/last-shown.$$" "$stamp"
