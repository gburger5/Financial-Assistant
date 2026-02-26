const API = "http://localhost:3000";

// ─── State ────────────────────────────────────────────────────────────────────

let token = localStorage.getItem("token") || null;
let currentBudget = null;
let banksConnected = 0;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async function init() {
  if (!token) {
    goToStep(0);
    return;
  }

  // Verify token is still valid
  try {
    await apiFetch("/verify");
  } catch {
    token = null;
    localStorage.removeItem("token");
    goToStep(0);
    return;
  }

  // Resume from wherever the user left off
  const budget = await fetchBudget();
  if (!budget) {
    goToStep(0);
    return;
  }

  currentBudget = budget;

  if (budget.status === "CONFIRMED") {
    goToStep(4);
  } else if (budget.status === "REVIEWED") {
    renderBudgetForm(budget);
    goToStep(2);
  } else if (budget.status === "PENDING" && isBudgetPopulated(budget)) {
    // At least one bank was already linked — go straight to budget review
    renderBudgetForm(budget);
    goToStep(2);
  } else {
    goToStep(1);
  }
})();

// ─── Navigation ───────────────────────────────────────────────────────────────

function goToStep(n) {
  document.querySelectorAll(".section").forEach((el) => el.classList.remove("visible"));

  const steps = ["step-auth", "step-plaid", "step-budget", "step-confirm", "step-done"];
  const el = document.getElementById(steps[n]);
  if (el) el.classList.add("visible");

  // Update step dots (steps 1-4 map to dots 0-3)
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) continue;
    dot.classList.remove("active", "done");
    if (n === 0) continue; // no dots lit on auth screen
    const dotStep = i + 1; // dot 0 = step 1
    if (dotStep < n) dot.classList.add("done");
    else if (dotStep === n) dot.classList.add("active");
  }
}

// ─── Auth tab toggle ──────────────────────────────────────────────────────────

function switchTab(tab) {
  clearError("auth-error");
  document.getElementById("form-login").style.display = tab === "login" ? "block" : "none";
  document.getElementById("form-register").style.display = tab === "register" ? "block" : "none";
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
}

// ─── Auth actions ─────────────────────────────────────────────────────────────

async function doLogin() {
  clearError("auth-error");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showError("auth-error", "Email and password are required.");
    return;
  }

  try {
    const data = await apiFetch("/login", { method: "POST", body: { email, password } });
    token = data.token;
    localStorage.setItem("token", token);
    // Load budget to decide which step to resume
    const budget = await fetchBudget();
    currentBudget = budget;
    if (budget && budget.status === "CONFIRMED") {
      goToStep(4);
    } else if (budget && budget.status === "REVIEWED") {
      renderBudgetForm(budget);
      goToStep(2);
    } else if (budget && budget.status === "PENDING" && isBudgetPopulated(budget)) {
      renderBudgetForm(budget);
      goToStep(2);
    } else {
      goToStep(1);
    }
  } catch (err) {
    showError("auth-error", err.message);
  }
}

async function doRegister() {
  clearError("auth-error");
  const firstName = document.getElementById("reg-first").value.trim();
  const lastName = document.getElementById("reg-last").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const confirmPassword = document.getElementById("reg-confirm").value;

  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    showError("auth-error", "All fields are required.");
    return;
  }

  try {
    await apiFetch("/register", {
      method: "POST",
      body: { firstName, lastName, email, password, confirmPassword },
    });
    // Auto-login after register
    document.getElementById("login-email").value = email;
    document.getElementById("login-password").value = password;
    switchTab("login");
    await doLogin();
  } catch (err) {
    showError("auth-error", err.message);
  }
}

function doLogout() {
  token = null;
  localStorage.removeItem("token");
  currentBudget = null;
  goToStep(0);
}

// ─── Plaid Link ───────────────────────────────────────────────────────────────

async function openPlaidLink() {
  clearError("plaid-error");
  const btn = document.getElementById("btn-link");
  setLoading(btn, true);

  let linkToken;
  try {
    const data = await apiFetch("/plaid/create-link-token", { method: "POST" });
    linkToken = data.link_token;
  } catch (err) {
    showError("plaid-error", err.message);
    setLoading(btn, false);
    return;
  }

  const handler = Plaid.create({
    token: linkToken,
    onSuccess: async (publicToken) => {
      setLoading(btn, true);
      try {
        const data = await apiFetch("/plaid/exchange-token", {
          method: "POST",
          body: { public_token: publicToken },
        });
        currentBudget = data.budget;
        banksConnected = data.banksConnected;
        updateBanksUI(banksConnected);
      } catch (err) {
        showError("plaid-error", err.message);
      } finally {
        setLoading(btn, false);
      }
    },
    onExit: () => {
      setLoading(btn, false);
    },
  });

  handler.open();
}

function updateBanksUI(count) {
  const badge = document.getElementById("banks-badge");
  const continueBtn = document.getElementById("btn-continue");
  const linkBtn = document.getElementById("btn-link");

  badge.textContent = `${count} bank${count !== 1 ? "s" : ""} connected`;
  badge.classList.toggle("empty", count === 0);

  continueBtn.disabled = count === 0;
  continueBtn.style.opacity = count === 0 ? "0.4" : "1";

  if (count > 0) {
    linkBtn.textContent = "Link another bank";
  }
}

function goToBudgetReview() {
  if (!currentBudget) return;
  renderBudgetForm(currentBudget);
  goToStep(2);
}

// Returns true if any budget field has been populated (i.e. a bank was already linked)
function isBudgetPopulated(budget) {
  return (
    budget.income?.monthlyNet !== null ||
    budget.needs?.housing?.rentOrMortgage !== null ||
    budget.wants?.takeout !== null
  );
}

// ─── Budget form ──────────────────────────────────────────────────────────────

function renderBudgetForm(budget) {
  const container = document.getElementById("budget-form");
  container.innerHTML = "";

  const sections = [
    {
      title: "Income",
      fields: [{ label: "Monthly", path: "income.monthlyNet" }],
    },
    {
      title: "Housing",
      fields: [{ label: "Rent", path: "needs.housing.rentOrMortgage" }],
    },
    {
      title: "Utilities",
      fields: [
        { label: "Utilities (gas, electric, internet, phone)", path: "needs.utilities.utilities" },
      ],
    },
    {
      title: "Transportation",
      fields: [
        { label: "Car payment", path: "needs.transportation.carPayment" },
        { label: "Gas", path: "needs.transportation.gasFuel" },
      ],
    },
    {
      title: "Other needs",
      fields: [
        { label: "Groceries", path: "needs.other.groceries" },
        { label: "Personal care", path: "needs.other.personalCare" },
      ],
    },
    {
      title: "Wants",
      fields: [
        { label: "Takeout", path: "wants.takeout" },
        { label: "Shopping", path: "wants.shopping" },
      ],
    },
    {
      title: "Investments",
      fields: [
        { label: "Monthly contribution", path: "investments.monthlyContribution" },
      ],
    },
    {
      title: "Debts",
      fields: [
        { label: "Minimum monthly payments", path: "debts.minimumPayments" },
      ],
    },
  ];

  for (const section of sections) {
    const wrap = document.createElement("div");
    wrap.className = "budget-section";

    const heading = document.createElement("h3");
    heading.textContent = section.title;
    wrap.appendChild(heading);

    for (const field of section.fields) {
      const value = getNestedValue(budget, field.path);

      if (field.type === "bool") {
        const row = document.createElement("div");
        row.className = "toggle-row";
        row.innerHTML = `
          <label>${field.label}</label>
          <input type="checkbox" data-path="${field.path}" ${value ? "checked" : ""} />
        `;
        wrap.appendChild(row);
      } else {
        const row = document.createElement("div");
        row.className = "budget-row";
        row.innerHTML = `
          <label>${field.label}</label>
          <input type="number" min="0" step="0.01" data-path="${field.path}"
            value="${value !== null && value !== undefined ? value : ""}"
            placeholder="—" />
        `;
        wrap.appendChild(row);
      }
    }

    container.appendChild(wrap);
  }
}

async function saveBudget() {
  clearError("budget-error");
  if (!currentBudget) return;

  // Collect values from the form
  const updates = deepClone(currentBudget);

  document.querySelectorAll("#budget-form [data-path]").forEach((input) => {
    const path = input.dataset.path;
    let value;
    if (input.type === "checkbox") {
      value = input.checked;
    } else {
      value = input.value === "" ? null : parseFloat(input.value);
    }
    setNestedValue(updates, path, value);
  });

  try {
    const data = await apiFetch(`/budget/${encodeURIComponent(currentBudget.budgetId)}`, {
      method: "PUT",
      body: updates,
    });
    currentBudget = data.budget;
    renderBudgetSummary(currentBudget);
    goToStep(3);
  } catch (err) {
    showError("budget-error", err.message);
  }
}

// ─── Confirm ──────────────────────────────────────────────────────────────────

function renderBudgetSummary(budget) {
  const container = document.getElementById("budget-summary");
  const lines = [
    ["Monthly income", budget.income?.monthlyNet],
    ["Rent", budget.needs?.housing?.rentOrMortgage],
    ["Utilities", budget.needs?.utilities?.utilities],
    ["Car payment", budget.needs?.transportation?.carPayment],
    ["Gas", budget.needs?.transportation?.gasFuel],
    ["Groceries", budget.needs?.other?.groceries],
    ["Personal care", budget.needs?.other?.personalCare],
    ["Takeout", budget.wants?.takeout],
    ["Shopping", budget.wants?.shopping],
    ["Investments (monthly)", budget.investments?.monthlyContribution],
    ["Min. debt payments", budget.debts?.minimumPayments],
  ];

  container.innerHTML = lines
    .filter(([, v]) => v !== null && v !== undefined)
    .map(
      ([label, value]) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">
        <span style="color:#555">${label}</span>
        <span style="font-weight:600">$${Number(value).toFixed(2)}</span>
      </div>`
    )
    .join("");
}

async function doConfirm() {
  clearError("confirm-error");
  if (!currentBudget) return;

  try {
    await apiFetch(`/budget/${encodeURIComponent(currentBudget.budgetId)}/confirm`, { method: "POST" });
    goToStep(4);
  } catch (err) {
    showError("confirm-error", err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function fetchBudget() {
  if (!token) return null;
  try {
    const data = await apiFetch("/budget");
    return data.budget ?? null;
  } catch {
    return null;
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

function clearError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>Working…`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || "Connect bank account";
  }
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((cur, key) => cur?.[key], obj) ?? null;
}

function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
