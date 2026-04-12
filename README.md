# TurfArena ♛

![TurfArena Hero Banner](hero-image-placeholder.png) <!-- Update with an actual screenshot of the app's hero section -->

TurfArena is a modern, full-stack web application designed to streamline the process of booking sports turfs and fostering local sports communities. It provides an intuitive interface for athletes to find nearby turfs, check real-time availability, and book slots instantly without the hassle of double bookings.

## 🚀 Features

### Core Capabilities
*   **Real-time Turf Booking:** Browse available turfs, see live schedules, and book 1-hour slots instantly.
*   **360° Turf View:** Integrated `Pannellum` immersive panoramic virtual tours of the grounds before you book.
*   **Mock UPI Payments:** Built-in mockup of Razorpay/UPI payment flow with QR code generation.
*   **Dynamic Theming:** Seamless switching between Dark and Light modes.
*   **Mobile Responsive:** Fully responsive design with a clean, app-like mobile experience.

### Community Hub (Players Lobby)
*   **Free Agent Lobby:** Post your availability as a solo player or find players to fill your squad's empty spots.
*   **Turf Wars:** Challenge other local teams to matches and split the turf cost 50/50.
*   **Tournaments:** Host or register your team for local weekend leagues and tournaments.

### Admin Dashboard
*   **Management:** Admin panel to manage turf listings, block off slots, and view comprehensive booking reports.
*   **Analytics:** Dedicated views for revenue tracking and user statistics.

## 🛠️ Technology Stack

**Frontend:**
*   HTML5
*   CSS3 (Custom CSS Properties for theming, No CSS Frameworks)
*   Vanilla JavaScript (ES6)
*   Pannellum JS (for 360° Panorama viewing)

**Backend:**
*   Node.js
*   Express.js
*   MongoDB (Mongoose ODM)
*   Bcrypt (for Admin and User Authentication)
*   CORS / dotenv (Environment management)

## ⚙️ Getting Started

### Prerequisites

*   **Node.js** (v14 or higher)
*   **MongoDB** (Local instance or MongoDB Atlas URI)

### Installation

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
```

## 👥 Contributors

*   **Abijith Thennarasu** 
*   **Ranse Roger** 



