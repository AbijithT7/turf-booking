# TurfArena

TurfArena is a full-stack sports turf booking application for browsing venues, reserving time slots, finding teammates, and managing blocked slots.

The project uses a static HTML/CSS/JavaScript frontend served by an Express backend. SQLite is created and seeded automatically when the backend starts.

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
│   ├── server.js       # Express server, routes, schema, and seed data
│   ├── api-smoke.js    # API smoke test
│   ├── reset-db.js     # Drops team-opening tables
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

The admin login is currently checked in the frontend and is not backed by an API authentication route:

| Role       | Email                 | Password   |
| ---------- | --------------------- | ---------- |
| Admin demo | `admin@turfarena.com` | `admin123` |

These credentials are for local demonstration only. They must be replaced before deploying the application.

## API Reference

### Authentication and Users

| Method | Endpoint             | Description                   |
| ------ | -------------------- | ----------------------------- |
| `POST` | `/api/auth/register` | Register a user               |
| `POST` | `/api/auth/login`    | Log in a user                 |
| `GET`  | `/api/users`         | List users for the admin view |

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

To recreate the team-opening tables during local development:

```bash
node backend/reset-db.js
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

- The application is a local/demo implementation and has no production admin authorization middleware.
- CORS is enabled globally by the backend.
- Passwords for regular users are hashed with bcrypt; the demo admin credentials are stored in frontend JavaScript.
- Replace the demo credentials, add real authorization, validate ownership on write operations, and use a production database before deployment.

## Author

Created by Abijith Thennarasu.
