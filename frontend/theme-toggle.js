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

  // Central In-Flight & Cached Auth Promise Manager
  let cachedUser = null;
  let authChecked = false;
  let authPromise = null;

  window.invalidateAuthCache = function () {
    cachedUser = null;
    authChecked = false;
    authPromise = null;
  };

  window.getAuthUser = async function (forceRefresh = false) {
    if (!forceRefresh && authChecked) {
      return cachedUser;
    }
    if (!forceRefresh && authPromise) {
      return authPromise;
    }

    // Fast-path: If visitor has no currentUser in storage and not forced, they are unauthenticated.
    // Prevents browser DevTools console from logging unwanted 401 errors on initial page load.
    if (!forceRefresh && !localStorage.getItem("currentUser")) {
      cachedUser = null;
      authChecked = true;
      return null;
    }

    authPromise = (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) {
          // Session expired or unauthenticated - handle silently and clear stale hint
          cachedUser = null;
          localStorage.removeItem("currentUser");
        } else if (res.ok) {
          const data = await res.json();
          cachedUser = data.user || null;
          if (cachedUser) {
            localStorage.setItem("currentUser", JSON.stringify(cachedUser));
          }
        } else {
          cachedUser = null;
        }
      } catch (e) {
        // Network or fetch failure - handle silently
        cachedUser = null;
      } finally {
        authChecked = true;
        authPromise = null;
      }
      return cachedUser;
    })();

    return authPromise;
  };

  // Global Logout Handler
  window.handleLogout = async function () {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch (e) {}
    window.invalidateAuthCache();
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
  };

  // Shared Global Header Auth Synchronizer
  window.syncGlobalHeaderAuth = async function (userParam) {
    const authActions = document.getElementById("userAuthActions");
    const mobileAuth = document.getElementById("mobileAuthSlot");
    if (!authActions && !mobileAuth) return null;

    const pathname = window.location.pathname.toLowerCase();
    const page = pathname.split("/").pop() || "index.html";
    const isAdminLoginPage = page === "admin-login.html";

    const user = userParam !== undefined ? userParam : await window.getAuthUser();

    if (user) {
      const firstName = window.escapeHtml((user.name || "Player").split(" ")[0]);
      const isAdmin = user.role === "admin";
      const isOwner = user.role === "owner";

      if (authActions) {
        if (isAdmin) {
          authActions.innerHTML = `
            <div class="admin-control-cluster" role="group" aria-label="Admin Control Hub">
              <span class="admin-chip"><i class="fa-solid fa-shield"></i> Admin</span>
              <a href="admin-dashboard.html" class="btn btn-outline btn-sm ${page === 'admin-dashboard.html' ? 'active' : ''}" title="HQ Admin Center">
                <i class="fa-solid fa-chart-line"></i> Admin Console
              </a>
              <a href="admin-owners.html" class="btn btn-outline btn-sm ${page === 'admin-owners.html' ? 'active' : ''}" title="Owner Facility Assignments">
                <i class="fa-solid fa-user-tie"></i> Owners
              </a>
              <button onclick="handleLogout()" class="btn btn-ghost btn-sm" title="Sign Out" aria-label="Sign Out">
                <i class="fa-solid fa-power-off" style="color: var(--danger);"></i>
              </button>
            </div>
          `;
        } else if (isOwner) {
          authActions.innerHTML = `
            <div class="auth-group">
              <a href="owner-dashboard.html" class="btn btn-primary btn-sm ${page === 'owner-dashboard.html' ? 'active' : ''}" title="Turf Owner Portal">
                <i class="fa-solid fa-building"></i> Owner Console
              </a>
              <button onclick="handleLogout()" class="btn btn-ghost btn-sm" title="Sign Out" aria-label="Sign Out">
                <i class="fa-solid fa-power-off" style="color: var(--danger);"></i>
              </button>
            </div>
          `;
        } else {
          authActions.innerHTML = `
            <div class="auth-group">
              <a href="user-dashboard.html" class="btn btn-outline btn-sm ${page === 'user-dashboard.html' ? 'active' : ''}" title="Player Dashboard">
                <i class="fa-solid fa-circle-user"></i> <span>${firstName}</span>
              </a>
              <button onclick="handleLogout()" class="btn btn-ghost btn-sm" title="Sign Out" aria-label="Sign Out">
                <i class="fa-solid fa-power-off" style="color: var(--danger);"></i>
              </button>
            </div>
          `;
        }
      }

      if (mobileAuth) {
        if (isAdmin) {
          mobileAuth.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft);">
              <div class="admin-chip" style="width: fit-content;"><i class="fa-solid fa-shield"></i> Admin Controls</div>
              <a href="admin-dashboard.html" class="mobile-nav-link ${page === 'admin-dashboard.html' ? 'active' : ''}" onclick="closeMobileNav()">
                <i class="fa-solid fa-chart-line"></i> Admin Console
              </a>
              <a href="admin-owners.html" class="mobile-nav-link ${page === 'admin-owners.html' ? 'active' : ''}" onclick="closeMobileNav()">
                <i class="fa-solid fa-user-tie"></i> Owner Assignments
              </a>
              <button onclick="handleLogout()" class="btn btn-danger btn-sm" style="width: 100%; margin-top: 4px;">
                <i class="fa-solid fa-power-off"></i> Sign Out
              </button>
            </div>
          `;
        } else if (isOwner) {
          mobileAuth.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft);">
              <a href="owner-dashboard.html" class="mobile-nav-link ${page === 'owner-dashboard.html' ? 'active' : ''}" onclick="closeMobileNav()">
                <i class="fa-solid fa-building"></i> Owner Console
              </a>
              <button onclick="handleLogout()" class="btn btn-danger btn-sm" style="width: 100%; margin-top: 4px;">
                <i class="fa-solid fa-power-off"></i> Sign Out
              </button>
            </div>
          `;
        } else {
          mobileAuth.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft);">
              <a href="user-dashboard.html" class="mobile-nav-link ${page === 'user-dashboard.html' ? 'active' : ''}" onclick="closeMobileNav()">
                <i class="fa-solid fa-circle-user"></i> My Dashboard (${firstName})
              </a>
              <button onclick="handleLogout()" class="btn btn-danger btn-sm" style="width: 100%; margin-top: 4px;">
                <i class="fa-solid fa-power-off"></i> Sign Out
              </button>
            </div>
          `;
        }
      }
    } else {
      // Unauthenticated visitor
      if (isAdminLoginPage) {
        // Player sign in option should NOT be there in admin portal page
        if (authActions) {
          authActions.innerHTML = `
            <div class="admin-badge-indicator">
              <i class="fa-solid fa-shield"></i> Facility Admin Gateway
            </div>
          `;
        }
        if (mobileAuth) {
          mobileAuth.innerHTML = `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft);">
              <div class="admin-badge-indicator" style="width: 100%; justify-content: center;">
                <i class="fa-solid fa-shield"></i> Facility Admin Gateway
              </div>
            </div>
          `;
        }
      } else {
        // Public pages: Organized login & signup tabs on the right corner, plus subtle Admin Portal link
        if (authActions) {
          authActions.innerHTML = `
            <div class="auth-group">
              <a href="user-login.html" class="btn btn-outline btn-sm" title="Player Sign In">
                <i class="fa-solid fa-user"></i> Sign In
              </a>
              <a href="user-login.html?mode=signup" class="btn btn-primary btn-sm" title="Register New Account">
                Sign Up
              </a>
              <span class="auth-divider"></span>
              <a href="admin-login.html" class="admin-portal-btn" title="Arena Admin & Facility Management">
                <i class="fa-solid fa-shield-halved"></i> Admin
              </a>
            </div>
          `;
        }

        if (mobileAuth) {
          mobileAuth.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft);">
              <div style="display: flex; gap: 8px;">
                <a href="user-login.html" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;" onclick="closeMobileNav()">
                  Sign In
                </a>
                <a href="user-login.html?mode=signup" class="btn btn-primary btn-sm" style="flex: 1; text-align: center;" onclick="closeMobileNav()">
                  Sign Up
                </a>
              </div>
              <a href="admin-login.html" class="admin-portal-btn" style="text-align: center; justify-content: center;" onclick="closeMobileNav()">
                <i class="fa-solid fa-shield-halved"></i> Admin Facility Portal
              </a>
            </div>
          `;
        }
      }
    }

    return user;
  };

  // Universal Navigation & Active State Synchronizer
  function initNavigationSync() {
    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash;
    let page = pathname.split("/").pop() || "index.html";
    if (page === "" || page === "/") page = "index.html";

    function setActiveKey(key) {
      document.querySelectorAll(".top-nav .nav-link, .mobile-nav-drawer .mobile-nav-link").forEach((link) => {
        const linkKey = link.getAttribute("data-nav");
        if (linkKey && linkKey === key) {
          link.classList.add("active");
        } else if (linkKey) {
          link.classList.remove("active");
        }
      });
    }

    // Auto-detect and set data-nav attributes if missing
    document.querySelectorAll(".top-nav .nav-link, .mobile-nav-drawer .mobile-nav-link").forEach((link) => {
      const href = (link.getAttribute("href") || "").toLowerCase();
      if (!link.getAttribute("data-nav")) {
        if (href.includes("#available-turfs")) {
          link.setAttribute("data-nav", "book");
        } else if (href === "index.html" || href === "/" || href === "./") {
          link.setAttribute("data-nav", "home");
        } else if (href.includes("tournaments.html")) {
          link.setAttribute("data-nav", "tournaments");
        } else if (href.includes("community.html")) {
          link.setAttribute("data-nav", "community");
        } else if (href.includes("admin-login.html") || href.includes("/admin")) {
          link.setAttribute("data-nav", "admin-portal");
        } else if (href.includes("admin-dashboard.html")) {
          link.setAttribute("data-nav", "admin-dashboard");
        } else if (href.includes("admin-owners.html")) {
          link.setAttribute("data-nav", "admin-owners");
        } else if (href.includes("owner-dashboard.html")) {
          link.setAttribute("data-nav", "owner-dashboard");
        } else if (href.includes("user-dashboard.html")) {
          link.setAttribute("data-nav", "user-dashboard");
        }
      }
    });

    if (page === "index.html" || page === "") {
      const turfsSection = document.getElementById("available-turfs");
      const isBookHash = hash === "#available-turfs";

      if (isBookHash) {
        setActiveKey("book");
        if (turfsSection) {
          setTimeout(() => {
            turfsSection.scrollIntoView({ behavior: "smooth" });
          }, 120);
        }
      } else {
        setActiveKey("home");
      }

      // Smooth click handling on page without page reload
      document.querySelectorAll('a[href="#available-turfs"], a[href="index.html#available-turfs"]').forEach((a) => {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          if (turfsSection) {
            turfsSection.scrollIntoView({ behavior: "smooth" });
            history.replaceState(null, null, "#available-turfs");
            setActiveKey("book");
          }
        });
      });

      document.querySelectorAll('a[href="index.html"], a[href="#top"]').forEach((a) => {
        a.addEventListener("click", function (e) {
          if (window.location.hash || window.scrollY > 200) {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
            history.replaceState(null, null, window.location.pathname);
            setActiveKey("home");
          }
        });
      });

      // Passive scroll spy on index.html
      let scrollTimer = null;
      window.addEventListener(
        "scroll",
        function () {
          if (scrollTimer) return;
          scrollTimer = setTimeout(() => {
            scrollTimer = null;
            if (!turfsSection) return;
            const rect = turfsSection.getBoundingClientRect();
            if (rect.top <= 200 && rect.bottom >= 150) {
              setActiveKey("book");
            } else if (rect.top > 200) {
              setActiveKey("home");
            }
          }, 100);
        },
        { passive: true }
      );
    } else if (page === "community.html") {
      setActiveKey("community");
    } else if (page === "tournaments.html") {
      setActiveKey("tournaments");
    } else if (page === "admin-login.html") {
      setActiveKey("admin-portal");
    } else if (page === "admin-dashboard.html") {
      setActiveKey("admin-dashboard");
    } else if (page === "admin-owners.html") {
      setActiveKey("admin-owners");
    } else if (page === "owner-dashboard.html") {
      setActiveKey("owner-dashboard");
    } else if (page === "user-dashboard.html") {
      setActiveKey("user-dashboard");
    }
  }

  window.initNavigationSync = initNavigationSync;

  // Safe idempotent bootstrap
  let isBootstrapped = false;
  function bootstrap() {
    if (isBootstrapped) return;
    isBootstrapped = true;
    initThemeToggle();
    initNavigationSync();
    window.syncGlobalHeaderAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
