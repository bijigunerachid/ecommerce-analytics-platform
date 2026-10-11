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

## Pages

| Page | Who | What |
| --- | --- | --- |
| Dashboard `/` | everyone | KPIs, charts, inventory watchlist, anomalies, pipeline health |
| Orders `/orders` | everyone | Search by customer, email or order number; filter by status, dates, customer |
| Order `/orders/:id` | everyone; admins change status | Line items and totals. Only the allowed next statuses are offered; cancelling (which restocks) asks for confirmation |
| New order `/orders/new` | admin | Search-as-you-type customer and product pickers, quantities, live estimate |
| Products `/products` | everyone; admins edit | Search name/SKU; filter by category, status, low stock; create, edit, delete |
| Categories `/categories` | everyone; admins edit | Product counts; create, edit, delete |
| Customers `/customers` | everyone; admins edit | Order count and total spent; link to their orders |
| Inventory `/inventory` | everyone; admins adjust | The stock ledger with links to orders; restock and adjustment form |
| Users `/users` | admin | Staff accounts; create admins and analysts |

Admin-only controls are hidden from analysts and admin-only routes redirect them. This is for
clarity only: the API enforces every permission.

### Forms and errors

- **Two layers of validation:** client-side checks mirror the API's rules for instant feedback,
  and the API's `VALIDATION_ERROR` details are mapped back onto the matching fields.
- **Conflicts** (duplicate SKU or email, deleting something still in use) appear in a banner
  inside the form or confirmation dialog, which stays open so nothing is lost.
- **Successful actions** show a short notification.

### Idempotent orders and adjustments

New orders and stock adjustments send an `Idempotency-Key` header:

- The key is created when the form opens and kept for retries. If a request fails with a network
  error, the order may or may not have been placed. Pressing the button again with the same data
  is safe, because the server returns the original order instead of creating a second one or
  deducting stock twice.
- Changing the order (customer, products, quantities) creates a new key, since it is a different
  request.
- If stock runs out, the API's `INSUFFICIENT_STOCK` details highlight each affected line with
  the quantity still available.

## Structure

```
src/
  api/          fetch wrapper (cookies, errors → ApiError, 401 → session expired) and endpoints
  auth/         AuthProvider (session restore via /auth/me), RequireAuth route guard
  theme/        ThemeProvider: light / dark / system, saved per browser
  hooks/        useApiQuery (fetch state, abort, keep data while refetching), useListParams and
                useDateRange (list/range state in the URL), useForm (values, errors, submit)
  components/   ui/ (buttons, fields, modal, toasts, badges), charts/, and data/ (sortable
                paginated ResourceTable, EntityPicker combobox)
  features/     dashboard panels, each fetching its own data
  layouts/      app shell: sidebar on desktop, drawer on mobile
  pages/        Login, Dashboard (lazy-loaded), Orders, Order, New order, Products,
                Categories, Customers, Inventory, Users, Not found
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
- **Dialogs:** labelled, focus moves to the first field, Tab stays inside, Escape closes, and
  focus returns to the button that opened them. The pickers follow the combobox pattern
  (arrow keys, Enter, Escape).
- **Tables:** sortable headers announce their state with `aria-sort`; on small screens a table
  scrolls inside its card instead of widening the page.
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
| ![Mobile](screenshots/04-dashboard-mobile.png) | ![Orders](screenshots/05-orders.png) |
| ![New order](screenshots/06-new-order.png) | ![Order detail](screenshots/07-order-detail.png) |
| ![Inventory ledger](screenshots/08-inventory.png) | ![Product form](screenshots/09-product-form.png) |

The dashboard screenshots show the 90-day synthetic dataset (`npm run generate-data`) processed through the
full pipeline (relay → Kafka → Spark). They were captured with a headless browser.
