# Frontend

React 19 single-page app in plain JavaScript (no TypeScript), built with Vite 7 and styled with
Tailwind CSS v4. Routing uses React Router 7, charts use Recharts 3, and icons come from
lucide-react.

![Dashboard (light)](screenshots/02-dashboard-light.png)

## Running

```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The API must be running (`npm run dev` in `backend/`). The Vite dev server **proxies `/api` to the
backend** (port from `API_PORT` in the root `.env`, default 4000; override with
`VITE_API_PROXY_TARGET`). Because the browser only ever talks to its own origin, the HttpOnly,
`SameSite=Strict` session cookie works without any CORS setup.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Vitest + Testing Library (jsdom), API mocked with MSW |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build (also proxies `/api`) |
| `npm run lint` / `npm run format:check` | ESLint (incl. React Hooks rules) / Prettier |

## Structure

```
src/
  api/          fetch wrapper (cookies, errors → ApiError, 401 → session expired) and endpoints
  auth/         AuthProvider (session restore via /auth/me), RequireAuth route guard
  theme/        ThemeProvider: light / dark / system, saved per browser
  hooks/        useApiQuery (fetch state, abort, keep data while refetching), useDateRange (URL)
  components/   ui/ (buttons, cards, states, status badges) and charts/ (frames, tooltips, bars)
  features/     dashboard panels, each fetching its own data
  layouts/      app shell: sidebar on desktop, drawer on mobile
  pages/        Login, Dashboard (lazy-loaded), Not found
  routes.jsx    route table (used by the app and by tests)
```

- **Auth:** the session token lives in an HttpOnly cookie, so JavaScript can't read it. On load
  the app asks `/api/auth/me` who is signed in. Any 401 afterwards clears the session and routes
  back to `/login`, returning to the original page after sign-in. Route guards are a UI
  convenience; the API enforces authentication and roles itself.
- **Data fetching:** each dashboard panel loads independently, so one failing endpoint shows an
  error with a retry button in its own card while the rest of the dashboard works. Refetches keep
  the previous data on screen instead of flashing loading skeletons.
- **Date range:** stored in the URL (`?range=30d` or `?from=…&to=…`), so views can be bookmarked
  and shared. It applies to every panel. Dates are UTC, matching the API.
- **Code splitting:** the dashboard and charting library load lazily, so the sign-in page stays
  light.

## Visual design and accessibility

- **Tokens:** colors are CSS variables in `src/index.css`, mapped to Tailwind utilities
  (`bg-surface`, `text-ink-secondary`, …). Dark mode redefines the same tokens under `.dark`, and
  the saved theme is applied before first paint, so there is no light flash.
- **Charts** follow a validated reference palette:
  - Categorical series colors (blue, orange) were checked with a color-vision-deficiency
    validator in both themes.
  - Status colors (good / warning / serious / critical) are separate and always paired with an
    icon and a label.
  - Text never takes a series color.
- **Chart forms** match the data's job:
  - The single headline number (net revenue) is a hero figure.
  - Trends over time are a 2px line with a light area wash.
  - Rankings (products, categories, statuses) are labeled horizontal bars with the value at the
    tip.
  - New vs returning customers is a two-series stacked column with a legend.
  - No chart uses two y-axes.
- **Every chart has a table view** (the chart/table toggle), so values are readable without
  hovering and without relying on color.
- **Interaction and semantics:**
  - Keyboard focus is visible, and there is a skip link.
  - Icon-only buttons have accessible names.
  - Form errors are linked with `aria-describedby`.
  - Status changes are announced with `role="alert"`.
- **Responsive:** single column on phones (no horizontal scroll at 390px), sidebar drawer below
  1024px.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | API base URL baked into the build. Keep `/api` when the API is served from the same origin (dev proxy or a reverse proxy). |
| `VITE_API_PROXY_TARGET` | `http://localhost:${API_PORT}` | Where the dev/preview server forwards `/api` |
| `VITE_CURRENCY` | `EUR` | Currency used to display money values |

## Screenshots

| | |
| --- | --- |
| ![Sign in](screenshots/01-login.png) | ![Dashboard, dark, 90 days](screenshots/03-dashboard-dark-90d.png) |
| ![Mobile](screenshots/04-dashboard-mobile.png) | |

The screenshots show the 90-day synthetic dataset (`npm run generate-data`) processed through the
full pipeline (relay → Kafka → Spark). They were captured with a headless browser.
