# Repository Guidelines

## Project structure

Blossom Bookings is a fictional lodging demo built with React, React Router, Vite, and Tailwind CSS. `src/App.jsx` maps routes to screens in `src/pages/`. Put reusable UI in `src/components/` and shared booking, search, favorites, and theme state in `src/BookingContext.jsx`.

Keep date validation and pricing in `src/lib/booking.js`, browser persistence in `src/lib/storage.js`, and fictional inventory in `src/data/stays.js`. Place stay photos in `public/images/`. Consult `docs/issues/` for ticket criteria and `docs/design/` for design references. Check the directory’s `AGENTS.md` when editing components, pages, library code, or tests.

## Development commands

- `./bin/setup` installs the pinned Node.js 24.21.0 runtime and locked dependencies in the workshop environment.
- `npm run dev` starts Vite. Open the loopback URL printed in the terminal.
- `npm run build` creates the production bundle in `dist/`. Run `npm run preview` to serve that build locally.
- `npm run lint` runs ESLint, including React Hooks checks.
- `mise run ci` runs the repository’s full checks, including plugin tests and Chromium smoke tests.

## Coding style

Use ES modules, two-space indentation, double quotes, and semicolons in JavaScript and JSX. Use PascalCase for React components and their filenames, as in `PriceSummary.jsx`, and camelCase for functions and variables. Reuse theme tokens from `src/styles.css`. Preserve accessible form labels and give non-submit buttons inside forms `type="button"`.

## Testing

Run `npm test` for a single Vitest run or `npm run test:watch` while editing. Put logic tests in `tests/*.test.js` and React Testing Library tests in `tests/*.test.jsx`. UI tests use jsdom. Cover observable outcomes such as checkout rejecting invalid dates or a saved stay surviving a reload. Put browser flows in `browser/*.spec.mjs`. No numeric coverage threshold is configured.

## Commits and pull requests

Use a short imperative commit subject, following the history’s “Remove repository guidelines and workshop checkpoint” example. In the PR description, explain the change and report the checks run. Link the relevant `BB-###` ticket when applicable and include screenshots for visible UI changes.
