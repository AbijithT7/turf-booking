# ⚽ TurfArena — Modern Sports Turf Booking & Community Platform

> **A state-of-the-art, full-stack sports venue reservation engine, player community lobby, and venue administration suite.**

Made by **Abijith Thennarasu**, Vellore Institute of Technology, Chennai.

---

## 🌟 Overview

**TurfArena** is a high-performance web platform designed to streamline sports turf reservations and connect active player communities. Built with modern UI design principles ("Nocturnal Pitch" aesthetics, glassmorphism, responsive micro-interactions), TurfArena offers an intuitive experience for athletes, team managers, and venue administrators.

---

## 🚀 Key Features

### 🏟️ Instant Turf Reservation & Slot Matrix
* **Interactive Time Slot Selector**: Real-time hourly slot matrix showing instant availability (Available, Booked, Maintenance).
* **360° Virtual Pitch Tours**: Integrated **Pannellum WebGL 360° Panorama Viewer** allowing players to virtually inspect field turf, lighting, and amenities before booking.
* **Mock UPI & QR Checkout**: Built-in payment gateway simulator complete with dynamic QR codes, total price calculation, and instant booking confirmation receipts.

### ⚽ Community & Players Lobby
* **Free Agent Draft Board**: Solo players can post profiles and get recruited by teams needing fill-in players.
* **Turf Wars (Team Challenges)**: Squads can issue match challenges to rival teams with built-in 50/50 turf fee split computation.
* **Tournament Gateway**: Browse local weekend leagues, check prize pools, and register teams directly.

### 👤 Athlete Dashboard
* View all past and upcoming turf bookings.
* Cancel reservations or download booking receipts.
* Personal athlete profile display with sport preferences and stats.

### 🛡️ Admin Command Suite
* **Real-time Slot Controller**: Toggle slot status between Available, Reserved, and Maintenance with single-click admin actions.
* **Revenue & Venue Analytics**: Live dashboard showcasing total booking revenue, venue utilization rates, and active players.
* **Turf Configuration**: Add new turfs, modify hourly pricing, and update venue descriptions.

### 🌓 Dynamic Nocturnal Pitch Theme Engine
* Dual Light & Dark mode support built with CSS variables.
* Remembers user preference across sessions with zero flash-on-load.

---

## 🛠️ Technology Stack

| Component | Technologies Used |
| :--- | :--- |
| **Frontend** | HTML5, Vanilla JavaScript (ES6+), Modern CSS3 Tokens, FontAwesome 6, Pannellum JS |
| **Typography** | *Plus Jakarta Sans* (Body/UI) & *Space Grotesk* (Headings/Monospace Data) |
| **Backend API** | Node.js, Express.js, CORS, dotenv |
| **Database** | SQLite 3 (`sqlite` async wrapper) with auto-seeding schema (`backend/turf.db`) |
| **Security** | Bcrypt password hashing for user & admin authentication |

---

## 📂 Project Structure

```
Turf_Booking/
├── backend/
│   ├── server.js              # Express API Server & SQLite DB Manager
│   ├── turf.db                # SQLite Database (seeded automatically)
│   ├── package.json           # Backend dependencies
│   └── package-lock.json
│
├── frontend/
│   ├── index.html             # Main Landing, Turf Explorer & Booking Modal
│   ├── community.html           # Players Lobby, Turf Wars & Tournaments
│   ├── user-dashboard.html      # Athlete Profile & Booking History
│   ├── user-login.html         # Player Authentication (Login / Register)
│   ├── admin-login.html        # Admin Authentication
│   ├── admin-dashboard.html    # Venue Admin Slot Suite
│   ├── theme.css              # Global Design Tokens & Glassmorphic Utilities
│   ├── theme-toggle.js        # Theme Switcher Engine
│   └── *.jpg / *.png / *.gif  # High-resolution pitch imagery & 360° Panoramas
│
├── README.md                  # Project Documentation
└── package.json               # Root package descriptor
```

---

## ⚙️ Getting Started

### Prerequisites
* **Node.js** (v16.0 or higher)
* **npm** (v7.0 or higher)

### 1. Installation

Clone the repository and install backend dependencies:

<<<<<<< HEAD
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/TurfArena.git
   cd TurfArena
   ```

2. **Setup the Backend:**
   Navigate to the backend directory and install dependencies.
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the `backend` directory and add your MongoDB connection string and JWT secret (if applicable).
   ```env
   MONGO_URI=mongodb://127.0.0.1:27017/turfarena
   PORT=3000
   ```

4. **Start the Backend Server:**
   ```bash
   node server.js
   ```

5. **Run the Frontend:**
   The frontend uses standard web files. For the best experience, serve the root directory using a local development server like `Live Server` in VS Code or `http-server`:
   ```bash
   npx http-server ./
   ```
   *Navigate to `http://localhost:8080` (or your respective port) in your browser.*

## 📂 Folder Structure

```
Turf-Booking/
│
├── backend/                   # Node.js Express API server
│   ├── models/                # Mongoose Database Schemas
│   ├── routes/                # API Endpoints
│   └── server.js              # Entry point for backend
│
├── css/                       # Frontend Stylesheets
│   ├── global.css             # Base styles and CSS variables
│   ├── index.css              # Home/Booking page styles
│   └── community.css          # Community Hub styles
│
├── js/                        # Frontend JavaScript logic
│   ├── index.js               # Booking logic, modal handling
│   ├── community.js           # Lobby and post handling
│   ├── nav.js                 # Global navigation & routing
│   └── theme.js               # Dark/Light mode toggler
│
├── index.html                 # Main Landing & Booking Page
├── community.html             # Community Hub (Lobby/Wars/Tournaments)
├── user-dashboard.html        # User Profile and Booking History
├── admin-login.html           # Admin Portal Auth
├── admin-dashboard.html       # Admin control panel
│
└── package.json               # Backend dependencies
=======
```bash
cd Turf_Booking/backend
npm install
>>>>>>> 89ba83b (Clean up repository: remove duplicate and useless files)
```

### 2. Run the Backend Server

<<<<<<< HEAD
*   **Abijith Thennarasu** 
*   **Ranse Roger** 


=======
Start the Express backend server (runs on port `5000` by default):

```bash
node server.js
```

Upon launch, the server automatically initializes SQLite `turf.db` and seeds initial sports turfs (*Apex Arena 7v7*, *Thunder Pitch*, *Paddy Field*) if not present.

### 3. Launch the Application

Open your browser and navigate to:
```
http://localhost:5000
```
*(Or open `frontend/index.html` via Live Server)*

---

## 🔑 Default Credentials (Testing)

| Role | Email | Password |
| :--- | :--- | :--- |
| **User / Athlete** | `test@turf.com` | `password123` |
| **Admin Operator** | `admin@turfarena.com` | `admin123` |

---

## 📡 API Reference Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `GET /api/turfs` | `GET` | Retrieve list of all sports turfs |
| `GET /api/turfs/:id` | `GET` | Retrieve details & slot availability for a turf |
| `POST /api/bookings` | `POST` | Book a turf slot |
| `GET /api/bookings` | `GET` | Fetch user booking history |
| `POST /api/users/register` | `POST` | Register a new user |
| `POST /api/users/login` | `POST` | Authenticate user |
| `POST /api/admin/login` | `POST` | Authenticate admin operator |
| `PUT /api/admin/slots` | `PUT` | Update slot status (Available / Booked / Maintenance) |
| `GET /api/community/free-agents` | `GET` | List active free agents |
| `GET /api/community/turf-wars` | `GET` | List active team challenges |

---

## 👨‍💻 Author & Attribution

**Made by Abijith Thennarasu**  
*Vellore Institute of Technology, Chennai*

---

## 📄 License
>>>>>>> 89ba83b (Clean up repository: remove duplicate and useless files)

