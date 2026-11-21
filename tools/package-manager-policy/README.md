# macOS package manager policy

These scripts support a three-day release-age policy with a December 3, 2026 upgrade deadline. Run them as the developer with the `PATH` used for their work. Corepack network access, download prompts, and automatic pinning are disabled for the probes.

| Manager | Minimum version | Three-day setting |
| --- | --- | --- |
| npm | 11.10.0 | `min-release-age=3` in `.npmrc` |
| pnpm | 10.17.0 | `minimumReleaseAge: 4320` in pnpm configuration (minutes) |
| Yarn | 4.12.0 | `npmMinimalAgeGate: "3d"` in `.yarnrc.yml` |
| Bun | 1.3.0 | `minimumReleaseAge = 259200` under `[install]` in `bunfig.toml` (seconds) |

pnpm 10.17.0 includes a fix for the release-age check on exact-version installs with cached registry metadata. The npm minimum covers the age setting. npm's package exclusion setting requires 11.17.0. [pnpm release notes](https://github.com/pnpm/pnpm/releases/tag/v10.17.0) · [npm release notes](https://github.com/npm/cli/releases/tag/v11.17.0)

## Pilot

Run the commands below from this folder.

```sh
/bin/bash inventory.sh
/bin/bash package-manager-reminder.sh --check
/bin/bash package-manager-reminder.sh --check "/path/to/representative/project"
```

Inventory lists executable copies in `PATH` and common installation directories, including Deno. For each manager, `active on PATH` marks the executable this environment selects. Other paths are marked `inventory only`. Cleanup is optional. An older installation may still support a project, and two paths may point to the same executable.

Compare the home-directory check from device management with the check in a work project and the version printed in the developer's terminal. Corepack can select a different version from a project's pin. Direct a project-pin change to the repository owner. Record `version unknown` and `not on this PATH` separately in pilot reporting. The check's exit status indicates whether the script ran, and each output line gives the tool's status.

Verify the age setting separately through the registry the team uses. For a fresh install, use an internal package with an older release and one published within three days. With a version range that accepts both, verify that the manager selects the older release.

## Reminders

After validating the paths on a managed Mac, schedule this command daily in the logged-in user's GUI session with their validated `PATH`. Use the installed script's absolute path in the job.

```sh
/bin/bash package-manager-reminder.sh --remind
```

The reminder checks each of npm, pnpm, Yarn, and Bun using the first executable on the supplied `PATH` from the user's home directory. One dismissible dialog shows the version, required minimum, and selected executable path for each outdated tool. For example, with npm 11.10.0 selected and npm 9 installed elsewhere, npm stays out of the dialog. Switching to npm 9 makes it eligible for a reminder on the next check.

The script records the last successful dialog under `~/Library/Application Support/Package Manager Reminder/` and waits 72 hours before showing another. A failed dialog can retry on the next run. Switching back to a supported version resolves the reminder for that tool.

## Regression checks

Run `/bin/bash test-policy.sh` as a non-root user. The tests use temporary package managers and simulate the macOS dialog and console session. For the live pilot, verify that one outdated tool produces a dialog in the intended session and that upgrading it stops the reminders.
