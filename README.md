# TurfArena

TurfArena is a demo full-stack sports turf booking application for browsing seeded venues, checking date-based slot availability, requesting bookings, and finding teammates through community posts.

The project uses a static HTML/CSS/JavaScript frontend served by an Express backend with SQLite persistence. Availability is refreshed by API requests; the app does **not** currently implement WebSockets/SSE-based live updates, online payment processing, or a tournament bracket/fixture engine. Treat this as a learning/demo project, not a production booking platform.

## Features

- Browse seeded sports turfs and their hourly prices.
- Check booked and blocked slots for a selected date.
- Book one or more slots in a single request.
- Register and log in as a user.
- View booking history and community activity from the user dashboard.
- Create team openings and request to join other teams.
- Create community posts for solo players, teams, and tournaments.
- Submit and manage community participation requests.
- Use the admin dashboard to block and unblock slots and review bookings.
- Switch between the application's light and dark themes.

## Tech Stack

- Node.js and Express
- SQLite with `sqlite` and `sqlite3`
- bcrypt for user password hashing
- Vanilla HTML, CSS, and JavaScript
- Font Awesome and Pannellum loaded from CDNs by the frontend

## Project Structure

```text
Turf_Booking/
├── backend/
│   ├── server.js       # Express server and API routes
│   ├── api-smoke.js    # API smoke test
│   ├── db.js           # SQLite connection, startup initialization, demo seed data
│   ├── migrations.js   # Guarded database migrations and account provisioning
│   ├── middleware/     # Authentication and request validation
│   ├── migrations/     # SQL schema/data migrations
│   ├── tests/          # Authentication/security tests
│   ├── reset-db.js     # Destructive dev-only helper: drops TeamOpenings and TeamRequests
│   ├── package.json
│   └── turf.db         # Created at runtime; ignored/generated locally
├── frontend/
│   ├── index.html      # Turf browsing and booking
│   ├── community.html  # Community posts and team matching
│   ├── user-login.html
│   ├── user-dashboard.html
│   ├── admin-login.html
│   ├── admin-dashboard.html
│   ├── theme.css
│   └── theme-toggle.js
├── package.json        # Root convenience scripts
└── README.md
```

## Requirements

- Node.js 18 or newer
- npm

## Installation

From the repository root:

```bash
npm install --prefix backend
```

The root package has no runtime dependencies. Installing in `backend` installs the server dependencies.

## Run the Application

Start the backend from the repository root:

```bash
npm run dev
```

Or run it directly:

```bash
cd backend
npm start
```

Open [http://localhost:5000](http://localhost:5000) in a browser. Express serves the frontend and API from the same origin, so opening the HTML files directly is not recommended.

Set a different port with an environment variable before starting the server:

```powershell
$env:PORT = 5050
npm run dev
```

```bash
PORT=5050 npm run dev
```

## Application Pages

| Page            | URL                | Purpose                                            |
| --------------- | ------------------ | -------------------------------------------------- |
| Home            | `/`                | Browse turfs, view availability, and make bookings |
| User login      | `/user-login.html` | Register or log in as a user                       |
| User dashboard  | `/user-dashboard`  | View bookings, posts, and join requests            |
| Community       | `/community.html`  | Find teammates and publish community posts         |
| Admin login     | `/admin`           | Open the admin login screen                        |
| Admin dashboard | `/admin-dashboard` | Review bookings and manage blocked slots           |

## Seeded Test Accounts

The backend creates the default user only when the `Users` table is empty:

| Role | Email           | Password      |
| ---- | --------------- | ------------- |
| User | `test@turf.com` | `password123` |

Development installs may seed a demo admin account using fallback credentials. Do not use these credentials on a deployed or shared instance:

| Role       | Email                 | Password   |
| ---------- | --------------------- | ---------- |
| Admin demo | `admin@turfarena.com` | `admin123` |

The demo credentials are for local development only. Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and a strong `SESSION_SECRET` before production. Production startup now refuses to provision an admin without explicit admin credentials; existing non-admin accounts are not auto-promoted.

## API Reference

### Authentication and Users

| Method | Endpoint             | Description                   |
| ------ | -------------------- | ----------------------------- |
| `POST` | `/api/auth/register` | Register a user               |
| `POST` | `/api/auth/login`    | Log in a user                 |
| `GET`  | `/api/users`         | List users for the admin view (admin session required) |
| `POST` | `/api/auth/logout`   | Destroy the current session |
| `GET`  | `/api/auth/me`       | Return the current authenticated user |

### Turfs and Bookings

| Method   | Endpoint                        | Description                                |
| -------- | ------------------------------- | ------------------------------------------ |
| `GET`    | `/api/turfs`                    | Return all turfs and prices                |
| `GET`    | `/api/bookings?date=YYYY-MM-DD` | Return bookings grouped by turf for a date |
| `GET`    | `/api/bookings`                 | Return all bookings for the admin view     |
| `POST`   | `/api/bookings`                 | Create bookings for selected slots         |
| `DELETE` | `/api/bookings/:id`             | Delete a booking                           |
| `GET`    | `/api/user/bookings/:phone`     | Return a user's booking history            |

### Availability and Team Matching

| Method   | Endpoint                             | Description                           |
| -------- | ------------------------------------ | ------------------------------------- |
| `GET`    | `/api/blocked-slots?date=YYYY-MM-DD` | Return blocked slots for a date       |
| `POST`   | `/api/blocked-slots`                 | Block a turf slot                     |
| `DELETE` | `/api/blocked-slots`                 | Unblock a turf slot                   |
| `GET`    | `/api/openings`                      | List team openings grouped by turf    |
| `POST`   | `/api/openings`                      | Create a team opening                 |
| `POST`   | `/api/openings/:id/request`          | Request to join an opening            |
| `GET`    | `/api/user/openings/:phone`          | Return a user's openings and requests |
| `POST`   | `/api/requests/:id/respond`          | Approve or reject a team request      |

### Community

| Method   | Endpoint                                | Description                              |
| -------- | --------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/community`                        | List community posts and requests        |
| `POST`   | `/api/community`                        | Create a community post                  |
| `DELETE` | `/api/community/:id`                    | Delete a community post                  |
| `POST`   | `/api/community/:id/request`            | Apply to a community post                |
| `PATCH`  | `/api/community/:id/request/:requestId` | Update an application status             |
| `DELETE` | `/api/community/:id/request/:requestId` | Remove an application                    |
| `GET`    | `/api/user/community/:phone`            | Return posts and applications for a user |

## Database

On first startup, the server creates `backend/turf.db` and the tables for users, turfs, bookings, blocked slots, team openings, team requests, community posts, and community requests. It also seeds three turfs, a default user, and sample community posts when those tables are empty.

The following helper is destructive and for local development only. It drops `TeamOpenings` and `TeamRequests` and does not reset other tables. It refuses to run in production and requires an explicit confirmation environment variable. Back up your database before running it:

```bash
CONFIRM_RESET_DB=1 node backend/reset-db.js
```

PowerShell:

```powershell
$env:CONFIRM_RESET_DB = "1"
node backend/reset-db.js
Remove-Item Env:CONFIRM_RESET_DB
```

The server recreates the dropped tables on its next startup. This command does not reset every table or delete all application data.

## Testing

Run the API smoke test from the repository root:

```bash
npm run test:api
```

The smoke test starts the backend if it is not already running and checks the turf, opening, booking, blocked-slot, community, and user endpoints.

The frontend currently has a manual smoke-test script placeholder:

```bash
npm run test:frontend
```

## Notes for Deployment

- The application is a local/demo implementation. Server-side session authentication and role checks exist, but this is not a claim of production readiness.
- Configure an exact `FRONTEND_ORIGIN`, `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the deployment environment. Never publish `.env` or database/session files.
- Passwords are bcrypt-hashed. Use unique admin credentials; the fallback credentials are only for local development.
- Before public deployment, audit every route for authorization and personal-data exposure, test date/slot rules and concurrency, add pagination and automated CI, and establish a backup/migration strategy.
- Because the current backend shares one SQLite connection, API and community requests are serialized to prevent transaction interleaving. This is a correctness-first demo safeguard; move to a connection/transaction architecture designed for concurrency before expecting production traffic.
- Booking confirmation is currently an application record, not a verified payment transaction. Community “tournament” posts are listings, not tournament brackets or fixtures.

## Author

Created by Abijith Thennarasu.
