# Repository Guidelines

## Project Structure & Module Organization
Blossom Bookings is a React 19 demo using Vite, React Router, and Tailwind CSS 4.
- `src/pages/` contains route screens; `src/components/` contains reusable UI.
- `src/App.jsx` defines routes; `src/BookingContext.jsx` owns shared booking, search, favorites, and theme state.
- `src/lib/booking.js` owns date validation, pricing, filtering, and booking creation. Keep persistence in `src/lib/storage.js`.
- `src/data/stays.js` provides fictional inventory; `src/styles.css` defines shared styles and theme tokens. Vite serves the local images from `public/images/`.
- `tests/` contains logic and UI tests. `docs/issues/` and `docs/design/` contain feature specifications.

## Build, Test, and Development Commands
Use the checked-in Codex environment and its setup script (`./bin/setup`). Main uses Node.js 24.21.0. Launch Preview app from the active checkout and open its printed URL.
- `npm run dev`: start the development server on the printed loopback URL.
- `npm run build`: generate production output in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm test`: run Vitest once.
- `npm run test:watch`: run Vitest interactively.
- `npm run lint`: check JavaScript, JSX, and React Hooks rules with ESLint.

## Coding Style & Naming Conventions
Follow existing ES modules, two-space indentation, double quotes, and semicolons. Use PascalCase for React components and component filenames, camelCase for functions and variables, and uppercase constants where appropriate. Keep reusable business logic outside components. Use shared CSS tokens for theme colors. ESLint is configured; no dedicated formatter is configured.

## Testing Guidelines
Use Vitest with jsdom and React Testing Library. Name logic tests `*.test.js` and UI tests `*.test.jsx` under `tests/`. Shared setup resets browser storage and supplies dialog mocks. Cover observable behavior, including invalid dates, pricing, persistence, and duplicate submissions. No coverage threshold is configured. Run tests, lint, and build before submitting; report existing exercise failures separately from regressions.

## Commit & Pull Request Guidelines
Use concise imperative subjects, such as `Fix checkout date validation`. Describe changes and validation results in PRs, link relevant `BB-###` issues, and include screenshots for UI changes.

## Demo & Checkpoint Scope
Read `CHECKPOINT.md` for the work assigned to this starter. Use fictional data only; never introduce real payments or reservations. Branches served at the same URL share browser storage.
