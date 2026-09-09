(function () {
  const STORAGE_KEY = "turf_theme";
  const DEFAULT_THEME = "dark";

  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : DEFAULT_THEME;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateToggleButtons(theme);
  }

  function updateToggleButtons(theme) {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const label = nextTheme === "light" ? "Light Mode" : "Dark Mode";
    const icon = nextTheme === "light" ? "fa-sun" : "fa-moon";

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + label;
      btn.setAttribute("aria-label", "Switch to " + label.toLowerCase());
    });
  }

  function toggleTheme() {
    const current =
      document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  function initThemeToggle() {
    applyTheme(getSavedTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", toggleTheme);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
