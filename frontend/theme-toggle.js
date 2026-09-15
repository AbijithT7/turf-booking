/**
 * TurfArena - Global Theme System & Shared Header Controller
 */
(function () {
  const STORAGE_KEY = "turf_theme";
  const DEFAULT_THEME = "dark";

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "dark" || saved === "light" ? saved : DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateToggleButtons(theme);
  }

  function updateToggleButtons(theme) {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const label = nextTheme === "light" ? "Light" : "Dark";
    const icon = nextTheme === "light" ? "fa-sun" : "fa-moon";

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.innerHTML = `<i class="fa-solid ${icon}"></i><span class="theme-toggle-label">${label}</span>`;
      btn.setAttribute("aria-label", `Switch to ${label.toLowerCase()} mode`);
      btn.setAttribute("title", `Switch to ${label.toLowerCase()} mode`);
    });
  }

  function toggleTheme() {
    const current =
      document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
    const next = current === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
    applyTheme(next);
  }

  function initThemeToggle() {
    applyTheme(getSavedTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.removeEventListener("click", toggleTheme);
      btn.addEventListener("click", toggleTheme);
    });
  }

  // Pre-paint application to prevent theme flash
  try {
    const initialTheme = getSavedTheme();
    document.documentElement.setAttribute("data-theme", initialTheme);
  } catch (e) {}

  // Responsive Mobile Navigation Drawer Toggles
  window.toggleMobileNav = function () {
    const drawer = document.getElementById("mobileNavDrawer");
    if (drawer) {
      drawer.classList.toggle("open");
    }
  };

  window.closeMobileNav = function () {
    const drawer = document.getElementById("mobileNavDrawer");
    if (drawer) {
      drawer.classList.remove("open");
    }
  };

  // Close drawer if user clicks outside
  document.addEventListener("click", function (e) {
    const drawer = document.getElementById("mobileNavDrawer");
    const toggleBtn = document.getElementById("mobileMenuBtn");
    if (drawer && drawer.classList.contains("open")) {
      if (!drawer.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        drawer.classList.remove("open");
      }
    }
  });

  // Global HTML Sanitizer
  window.escapeHtml = function (str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // Global Logout Handler
  window.handleLogout = async function () {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch (e) {}
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
  };

  // Shared Global Header Auth Synchronizer
  window.syncGlobalHeaderAuth = async function () {
    const authActions = document.getElementById("userAuthActions");
    const mobileAuth = document.getElementById("mobileAuthSlot");
    if (!authActions && !mobileAuth) return null;

    let user = null;
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        user = data.user;
      }
    } catch (e) {
      user = null;
    }

    if (user) {
      const firstName = window.escapeHtml((user.name || "Player").split(" ")[0]);
      const isAdmin = user.role === "admin";

      if (authActions) {
        authActions.innerHTML = `
          ${isAdmin ? `
            <a href="admin-dashboard.html" class="btn btn-outline btn-sm" title="HQ Admin Center">
              <i class="fa-solid fa-shield"></i> Admin
            </a>
          ` : ""}
          <a href="user-dashboard.html" class="btn btn-outline btn-sm" title="Player Dashboard">
            <i class="fa-solid fa-circle-user"></i> <span>${firstName}</span>
          </a>
          <button onclick="handleLogout()" class="btn btn-ghost btn-sm" title="Sign Out" aria-label="Sign Out">
            <i class="fa-solid fa-power-off" style="color: var(--danger);"></i>
          </button>
        `;
      }

      if (mobileAuth) {
        mobileAuth.innerHTML = `
          <a href="user-dashboard.html" class="mobile-nav-link" onclick="closeMobileNav()">
            <i class="fa-solid fa-circle-user"></i> My Dashboard (${firstName})
          </a>
          ${isAdmin ? `
            <a href="admin-dashboard.html" class="mobile-nav-link" onclick="closeMobileNav()">
              <i class="fa-solid fa-shield"></i> Admin Controller
            </a>
          ` : ""}
          <button onclick="handleLogout()" class="btn btn-danger btn-sm" style="width: 100%; margin-top: 8px;">
            <i class="fa-solid fa-power-off"></i> Sign Out
          </button>
        `;
      }
    } else {
      if (authActions) {
        authActions.innerHTML = `
          <a href="user-login.html" class="btn btn-outline btn-sm">
            <i class="fa-solid fa-user"></i> Login
          </a>
          <a href="user-login.html" class="btn btn-primary btn-sm">
            Sign Up
          </a>
        `;
      }

      if (mobileAuth) {
        mobileAuth.innerHTML = `
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <a href="user-login.html" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;" onclick="closeMobileNav()">
              Login
            </a>
            <a href="user-login.html" class="btn btn-primary btn-sm" style="flex: 1; text-align: center;" onclick="closeMobileNav()">
              Sign Up
            </a>
          </div>
        `;
      }
    }

    return user;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initThemeToggle();
      window.syncGlobalHeaderAuth();
    });
  } else {
    initThemeToggle();
    window.syncGlobalHeaderAuth();
  }
})();
