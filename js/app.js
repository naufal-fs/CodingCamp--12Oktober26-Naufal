/* ============================================================
   Life Dashboard — app.js
   Single vanilla JavaScript file. No frameworks, no modules.
   All state is persisted to localStorage under dashboard_* keys.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- A. Storage helpers + keys ---------- */

  // Every localStorage key is namespaced with dashboard_ for collision-free, discoverable storage.
  const STORAGE_KEYS = {
    NAME: "dashboard_name",            // plain string
    TASKS: "dashboard_tasks",          // JSON array of {id, text, done}
    LINKS: "dashboard_links",          // JSON array of {id, name, url}
    TIMER_MIN: "dashboard_timer_minutes", // string number
    THEME: "dashboard_theme"           // "light" | "dark"
  };

  // Load a JSON value; returns fallback on parse error or missing key.
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  // Save a value as JSON.
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Load a raw string value (for NAME, TIMER_MIN, THEME).
  function loadRaw(key, fallback) {
    return localStorage.getItem(key) ?? fallback;
  }

  // Save a raw string value.
  function saveRaw(key, value) {
    localStorage.setItem(key, value);
  }

  // Unique ID generator with a fallback for older browsers.
  function uid() {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /* ---------- B. Clock + greeting + custom name ---------- */

  // Map an hour (0-23) to a time-of-day greeting.
  function getGreeting(hour) {
    if (hour >= 5 && hour <= 11) return "Good Morning";
    if (hour >= 12 && hour <= 17) return "Good Afternoon";
    if (hour >= 18 && hour <= 21) return "Good Evening";
    return "Good Night"; // 22-23 and 0-4
  }

  // Update the live clock, the date, and the greeting line.
  function updateClock() {
    const now = new Date();

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    clockEl.textContent = `${hh}:${mm}:${ss}`;

    // Long-form date, e.g. "Tuesday, January 27, 2026"
    dateEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const greeting = getGreeting(now.getHours());
    const name = loadRaw(STORAGE_KEYS.NAME, "");
    // Show the name only when one has been saved.
    greetingTextEl.textContent = name ? `${greeting}, ${name}!` : `${greeting}!`;
  }

  /* ---------- C. Focus timer ---------- */

  let timerInterval = null;
  let secondsLeft = 0;
  let totalSeconds = 0;
  let isRunning = false;

  // Read the persisted minutes, clamped to 1-120.
  function readTimerMinutes() {
    const m = parseInt(loadRaw(STORAGE_KEYS.TIMER_MIN, "25"), 10) || 25;
    return Math.max(1, Math.min(120, m));
  }

  // Format a number of seconds as MM:SS.
  function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  // Render the current secondsLeft into the display.
  function renderTimer() {
    timerDisplayEl.textContent = formatTime(secondsLeft);
  }

  // Set up the timer with a given minutes value (no save, no running reset).
  function setupTimer(minutes) {
    totalSeconds = minutes * 60;
    secondsLeft = totalSeconds;
    renderTimer();
  }

  // Apply minutes from the input: clamp, persist, stop timer, reset countdown.
  function applyMinutes(value) {
    const m = Math.max(1, Math.min(120, parseInt(value, 10) || 25));
    saveRaw(STORAGE_KEYS.TIMER_MIN, String(m));
    timerMinutesEl.value = m;
    clearInterval(timerInterval);
    isRunning = false;
    setupTimer(m);
  }

  /* ---------- D. Tasks ---------- */

  let tasks = load(STORAGE_KEYS.TASKS, []);

  function saveTasks() {
    save(STORAGE_KEYS.TASKS, tasks);
  }

  // Return a copy of the tasks sorted by the current sort selection.
  function sortedTasks() {
    const mode = sortSelectEl.value;
    if (mode === "alpha") {
      // Case-insensitive alphabetical sort.
      return [...tasks].sort((a, b) =>
        a.text.localeCompare(b.text, "en", { sensitivity: "base" })
      );
    }
    if (mode === "status") {
      // Incomplete tasks first, done tasks last; stable for equal groups.
      return [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
    }
    // Manual = preserve insertion order.
    return [...tasks];
  }

  // Render the task list into the DOM.
  function renderTasks() {
    taskListEl.innerHTML = "";
    const list = sortedTasks();
    list.forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-item" + (task.done ? " done" : "");
      li.dataset.id = task.id;

      // Checkbox — toggles done state.
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.done;
      checkbox.addEventListener("change", () => {
        const t = tasks.find((x) => x.id === task.id);
        if (t) {
          t.done = checkbox.checked;
          saveTasks();
          // Re-render so status sort can re-order if active.
          renderTasks();
        }
      });

      // Task text — click to edit inline.
      const span = document.createElement("span");
      span.className = "task-text";
      span.textContent = task.text;
      span.setAttribute("contenteditable", "true");
      span.spellcheck = false;
      span.addEventListener("blur", () => {
        const t = tasks.find((x) => x.id === task.id);
        if (!t) return;
        const v = span.textContent.trim();
        if (v === "") {
          // Revert to the stored text when edited to empty.
          span.textContent = t.text;
        } else {
          t.text = v;
          saveTasks();
          // No re-render: the span already shows the new text, and
          // re-rendering would drop focus / cursor position unnecessarily.
        }
      });
      span.addEventListener("keydown", (e) => {
        // Enter commits the edit.
        if (e.key === "Enter") {
          e.preventDefault();
          span.blur();
        }
      });

      // Delete button.
      const delBtn = document.createElement("button");
      delBtn.className = "task-delete";
      delBtn.textContent = "✕";
      delBtn.title = "Delete";
      delBtn.setAttribute("aria-label", "Delete task");
      delBtn.addEventListener("click", () => {
        tasks = tasks.filter((x) => x.id !== task.id);
        saveTasks();
        renderTasks();
      });

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(delBtn);
      taskListEl.appendChild(li);
    });
  }

  // Show a transient duplicate-task error message.
  function showTaskError(msg) {
    taskErrorEl.textContent = msg;
    clearTimeout(showTaskError._t);
    showTaskError._t = setTimeout(() => {
      taskErrorEl.textContent = "";
    }, 2500);
  }

  // Add a task from the input value (also called on Enter).
  function addTask() {
    const text = taskInputEl.value.trim();
    if (text === "") {
      showTaskError(""); // clear any stale error
      return;
    }
    // Prevent duplicates (case-insensitive comparison).
    const duplicate = tasks.some(
      (t) => t.text.toLowerCase() === text.toLowerCase()
    );
    if (duplicate) {
      showTaskError("That task already exists!");
      return;
    }
    tasks.push({ id: uid(), text: text, done: false });
    saveTasks();
    renderTasks();
    taskInputEl.value = "";
    taskErrorEl.textContent = "";
  }

  /* ---------- E. Quick links ---------- */

  let links = load(STORAGE_KEYS.LINKS, null);

  // First run only: seed default links when the key is entirely absent.
  if (links === null) {
    links = [
      { id: uid(), name: "Google", url: "https://google.com" },
      { id: uid(), name: "Gmail", url: "https://gmail.com" },
      { id: uid(), name: "Calendar", url: "https://calendar.google.com" }
    ];
    save(STORAGE_KEYS.LINKS, links);
  } else if (!Array.isArray(links)) {
    // Defensive: recover if stored value is not an array.
    links = [];
  }

  function saveLinks() {
    save(STORAGE_KEYS.LINKS, links);
  }

  // Render the quick links as colored buttons.
  function renderLinks() {
    linkListEl.innerHTML = "";
    links.forEach((link) => {
      const a = document.createElement("a");
      a.className = "link-button";
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = link.name;

      // Remove (X) button — stopPropagation so the anchor does not navigate.
      const removeBtn = document.createElement("button");
      removeBtn.className = "link-remove";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remove";
      removeBtn.setAttribute("aria-label", "Remove link");
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        links = links.filter((x) => x.id !== link.id);
        saveLinks();
        renderLinks();
      });

      a.appendChild(removeBtn);
      linkListEl.appendChild(a);
    });
  }

  // Add a link from the name/url inputs.
  function addLink() {
    const name = linkNameEl.value.trim();
    let url = linkUrlEl.value.trim();
    if (name === "" || url === "") {
      return; // brief does not require an error message for links
    }
    // Auto-prefix https:// if the user omitted a scheme.
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    links.push({ id: uid(), name: name, url: url });
    saveLinks();
    renderLinks();
    linkNameEl.value = "";
    linkUrlEl.value = "";
  }

  /* ---------- F. Dark mode ---------- */

  // Apply a theme and persist it.
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggleEl.textContent = theme === "dark" ? "☀️" : "🌙";
    saveRaw(STORAGE_KEYS.THEME, theme);
  }

  /* ---------- G. Init ---------- */

  // Cached element references (assigned on DOMContentLoaded).
  let clockEl, dateEl, greetingTextEl, editNameBtnEl;
  let timerDisplayEl, timerStartEl, timerStopEl, timerResetEl;
  let timerMinutesEl, minutesDecEl, minutesIncEl, applyMinutesEl;
  let taskInputEl, taskAddEl, taskErrorEl, sortSelectEl, taskListEl;
  let linkNameEl, linkUrlEl, linkAddEl, linkListEl;
  let themeToggleEl;

  function init() {
    // Greeting elements.
    clockEl = document.getElementById("clock");
    dateEl = document.getElementById("date");
    greetingTextEl = document.getElementById("greetingText");
    editNameBtnEl = document.getElementById("editNameBtn");

    // Timer elements.
    timerDisplayEl = document.getElementById("timerDisplay");
    timerStartEl = document.getElementById("timerStart");
    timerStopEl = document.getElementById("timerStop");
    timerResetEl = document.getElementById("timerReset");
    timerMinutesEl = document.getElementById("timerMinutes");
    minutesDecEl = document.getElementById("minutesDec");
    minutesIncEl = document.getElementById("minutesInc");
    applyMinutesEl = document.getElementById("applyMinutes");

    // Task elements.
    taskInputEl = document.getElementById("taskInput");
    taskAddEl = document.getElementById("taskAdd");
    taskErrorEl = document.getElementById("taskError");
    sortSelectEl = document.getElementById("sortSelect");
    taskListEl = document.getElementById("taskList");

    // Link elements.
    linkNameEl = document.getElementById("linkName");
    linkUrlEl = document.getElementById("linkUrl");
    linkAddEl = document.getElementById("linkAdd");
    linkListEl = document.getElementById("linkList");

    // Theme toggle.
    themeToggleEl = document.getElementById("themeToggle");

    // --- B. Clock + greeting ---
    updateClock();
    setInterval(updateClock, 1000);

    editNameBtnEl.addEventListener("click", () => {
      const input = prompt(
        "Enter your name (leave blank to clear):",
        loadRaw(STORAGE_KEYS.NAME, "")
      );
      // prompt returns null when cancelled — do nothing.
      if (input === null) return;
      saveRaw(STORAGE_KEYS.NAME, input.trim());
      updateClock();
    });

    // --- C. Focus timer ---
    const minutes = readTimerMinutes();
    timerMinutesEl.value = minutes;
    setupTimer(minutes); // init countdown without re-saving

    timerStartEl.addEventListener("click", () => {
      if (isRunning) return;
      if (secondsLeft <= 0) secondsLeft = totalSeconds;
      isRunning = true;
      timerInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          secondsLeft = 0;
          clearInterval(timerInterval);
          isRunning = false;
        }
        renderTimer();
      }, 1000);
    });

    timerStopEl.addEventListener("click", () => {
      clearInterval(timerInterval);
      isRunning = false; // pause; secondsLeft retained so Start resumes
    });

    timerResetEl.addEventListener("click", () => {
      clearInterval(timerInterval);
      isRunning = false;
      secondsLeft = totalSeconds;
      renderTimer();
    });

    // +/- buttons adjust the displayed value only; user clicks Apply to commit.
    // (Apply-commit chosen for predictability.)
    minutesDecEl.addEventListener("click", () => {
      const v = parseInt(timerMinutesEl.value, 10) || 25;
      timerMinutesEl.value = Math.max(1, v - 1);
    });
    minutesIncEl.addEventListener("click", () => {
      const v = parseInt(timerMinutesEl.value, 10) || 25;
      timerMinutesEl.value = Math.min(120, v + 1);
    });
    applyMinutesEl.addEventListener("click", () => {
      applyMinutes(timerMinutesEl.value);
    });

    // --- D. Tasks ---
    taskAddEl.addEventListener("click", addTask);
    taskInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTask();
      }
    });
    sortSelectEl.addEventListener("change", renderTasks);
    renderTasks();

    // --- E. Quick links ---
    linkAddEl.addEventListener("click", addLink);
    linkNameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addLink();
      }
    });
    linkUrlEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addLink();
      }
    });
    renderLinks();

    // --- F. Dark mode ---
    const savedTheme = loadRaw(STORAGE_KEYS.THEME, "light") === "dark" ? "dark" : "light";
    applyTheme(savedTheme);
    themeToggleEl.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      applyTheme(next);
    });
  }

  // Script is at the end of <body>, but DOMContentLoaded is the safe pattern.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
