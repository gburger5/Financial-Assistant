const API = "http://localhost:3000/api";

// ─── State ────────────────────────────────────────────────────────────────────

let token = localStorage.getItem("token") || null;
let currentBudget = null;
let connectedBanks = []; // { name: string, accounts: { name, type, subtype }[] }[]

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async function init() {
  if (!token) {
    goToStep(0);
    return;
  }

  try {
    await apiFetch("/auth/verify");
  } catch {
    token = null;
    localStorage.removeItem("token");
    goToStep(0);
    return;
  }

  const budget = await fetchBudget();
  if (!budget) {
    // No budget yet — check if banks are already linked
    await loadLinkedAccounts();
    goToStep(1);
    return;
  }

  currentBudget = budget;

  // If the user already completed the flow, land directly on the dashboard.
  if (localStorage.getItem("onboarding_done") === "true") {
    renderDashboard(budget);
    goToStep(3);
  } else {
    renderBudgetForm(budget);
    goToStep(2);
  }
})();

// ─── Navigation ───────────────────────────────────────────────────────────────

function goToStep(n) {
  document.querySelectorAll(".section").forEach((el) => el.classList.remove("visible"));

  const steps = ["step-auth", "step-plaid", "step-budget", "step-done"];
  const el = document.getElementById(steps[n]);
  if (el) el.classList.add("visible");

  // Dots map to steps 1-3 (dot-0 = step 1, dot-1 = step 2, dot-2 = step 3)
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) continue;
    dot.classList.remove("active", "done");
    if (n === 0) continue; // no dots on the auth screen
    const dotStep = i + 1;
    if (dotStep < n) dot.classList.add("done");
    else if (dotStep === n) dot.classList.add("active");
  }
}

/** Shows the syncing loading screen (between step 1 and step 2). */
function showSyncingScreen() {
  document.querySelectorAll(".section").forEach((el) => el.classList.remove("visible"));
  document.getElementById("step-syncing").classList.add("visible");

  // Update dots: step 1 done, step 2 active
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) continue;
    dot.classList.remove("active", "done");
    if (i === 0) dot.classList.add("done");
    if (i === 1) dot.classList.add("active");
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
    const data = await apiFetch("/auth/login", { method: "POST", body: { email, password } });
    token = data.token;
    localStorage.setItem("token", token);

    const budget = await fetchBudget();
    currentBudget = budget;

    if (!budget) {
      // No budget — check for linked accounts
      await loadLinkedAccounts();
      goToStep(1);
    } else if (localStorage.getItem("onboarding_done") === "true") {
      renderDashboard(budget);
      goToStep(3);
    } else {
      renderBudgetForm(budget);
      goToStep(2);
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
    await apiFetch("/auth/register", {
      method: "POST",
      body: { firstName, lastName, email, password, confirmPassword },
    });

    const data = await apiFetch("/auth/login", { method: "POST", body: { email, password } });
    token = data.token;
    localStorage.setItem("token", token);
    goToStep(1);
  } catch (err) {
    showError("auth-error", err.message);
  }
}

function doLogout() {
  token = null;
  localStorage.removeItem("token");
  localStorage.removeItem("onboarding_done");
  currentBudget = null;
  connectedBanks = [];
  renderConnectedBanks();
  goToStep(0);
}

// ─── Load linked accounts from server ─────────────────────────────────────────

/**
 * Fetches already-linked accounts from GET /accounts and groups them by itemId.
 * Called on login/init when no budget exists yet, so the user sees their
 * previously linked banks even if they navigate away and come back.
 */
async function loadLinkedAccounts() {
  try {
    const data = await apiFetch("/accounts");
    const accounts = data.accounts || [];

    // Group by itemId to determine unique bank connections
    const byItem = new Map();
    for (const acct of accounts) {
      const list = byItem.get(acct.itemId) || [];
      list.push(acct);
      byItem.set(acct.itemId, list);
    }

    connectedBanks = [];
    for (const [, accts] of byItem) {
      connectedBanks.push({
        name: accts[0]?.name?.split(" ")[0] || "Bank",
        accounts: accts.map((a) => ({ name: a.name, type: a.type, subtype: a.subtype })),
      });
    }

    renderConnectedBanks();
  } catch {
    // No accounts yet — that's fine
  }
}

// ─── Plaid Link ───────────────────────────────────────────────────────────────

async function openPlaidLink() {
  clearError("plaid-error");
  const btn = document.getElementById("btn-link");
  setLoading(btn, true, "Connecting...");

  let linkToken;
  try {
    const data = await apiFetch("/plaid/link-token");
    linkToken = data.linkToken;
  } catch (err) {
    showError("plaid-error", err.message);
    setLoading(btn, false);
    return;
  }

  const handler = Plaid.create({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      setLoading(btn, true, "Linking...");
      try {
        await apiFetch("/plaid/exchange-token", {
          method: "POST",
          body: {
            publicToken,
            institutionId: metadata.institution.institution_id,
            institutionName: metadata.institution.name,
          },
        });

        // Refresh the accounts list from the server to show all linked accounts
        await loadLinkedAccounts();
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

function renderConnectedBanks() {
  const list = document.getElementById("banks-list");
  const continueBtn = document.getElementById("btn-continue");
  const linkBtn = document.getElementById("btn-link");

  list.innerHTML = connectedBanks
    .map(
      (bank) => `
        <div class="bank-item">
          <div class="bank-item-header">
            <span class="bank-check">&#10003;</span>
            <span>${bank.name}</span>
          </div>
          ${
            bank.accounts && bank.accounts.length > 0
              ? `<div class="bank-accounts">${bank.accounts
                  .map((a) => `<div class="bank-account">${a.name} (${a.subtype || a.type})</div>`)
                  .join("")}</div>`
              : ""
          }
        </div>
      `
    )
    .join("");

  const count = connectedBanks.length;
  const canProceed = count > 0;

  continueBtn.disabled = !canProceed;
  continueBtn.style.opacity = canProceed ? "1" : "0.4";

  linkBtn.textContent = count > 0 ? "Link another bank" : "Link Bank Account";
}

/**
 * Called when the user clicks "Continue to budget review".
 * Triggers POST /sync to sync all data, then creates the budget.
 * Syncing is decoupled from linking — it only happens when the user is ready.
 */
async function goToBudgetReview() {
  showSyncingScreen();

  try {
    // Sync all data: transactions, debt transactions, investments, liabilities
    await apiFetch("/plaid/sync", { method: "POST" });

    // Create the initial budget from synced data
    const budget = await apiFetch("/budget/initialize", { method: "POST" });
    currentBudget = budget;
    renderBudgetForm(budget);
    goToStep(2);
  } catch (err) {
    goToStep(1);
    showError("plaid-error", "Sync failed: " + err.message);
  }
}

// ─── Budget form ──────────────────────────────────────────────────────────────

function renderBudgetForm(budget) {
  const container = document.getElementById("budget-form");
  container.innerHTML = "";

  const sections = [
    { title: "Income",          path: "income.amount",         label: "Monthly net" },
    { title: "Housing",         path: "housing.amount",        label: "Rent / mortgage" },
    { title: "Utilities",       path: "utilities.amount",      label: "Gas, electric, internet, phone" },
    { title: "Transportation",  path: "transportation.amount", label: "Car payment, gas, transit" },
    { title: "Groceries",       path: "groceries.amount",      label: "Groceries" },
    { title: "Medical",         path: "medical.amount",        label: "Doctor, dental, pharmacy" },
    { title: "Takeout",         path: "takeout.amount",        label: "Restaurants, coffee, delivery" },
    { title: "Shopping",        path: "shopping.amount",       label: "General merchandise" },
    { title: "Entertainment",   path: "entertainment.amount",  label: "Subscriptions, movies, games" },
    { title: "Personal care",   path: "personalCare.amount",   label: "Gym, hair, laundry" },
    { title: "Emergency fund",  path: "emergencyFund.amount",  label: "Savings transfers" },
    { title: "Investments",     path: "investments.amount",    label: "Monthly contribution" },
    { title: "Debts",           path: "debts.amount",          label: "Minimum monthly payments" },
  ];

  for (const section of sections) {
    const value = getNestedValue(budget, section.path);

    const wrap = document.createElement("div");
    wrap.className = "budget-section";

    const heading = document.createElement("h3");
    heading.textContent = section.title;
    wrap.appendChild(heading);

    const row = document.createElement("div");
    row.className = "budget-row";
    row.innerHTML = `
      <label>${section.label}</label>
      <input type="number" min="0" step="0.01" data-path="${section.path}"
        value="${value !== null && value !== undefined ? value : ""}"
        placeholder="—" />
    `;
    wrap.appendChild(row);
    container.appendChild(wrap);
  }
}

async function saveBudget() {
  clearError("budget-error");
  if (!currentBudget) return;

  const updates = {};
  document.querySelectorAll("#budget-form [data-path]").forEach((input) => {
    const [category] = input.dataset.path.split(".");
    if (input.value !== "") {
      updates[category] = { amount: parseFloat(input.value) };
    }
  });

  try {
    const updated = await apiFetch("/budget", {
      method: "PATCH",
      body: updates,
    });
    currentBudget = updated;
    localStorage.setItem("onboarding_done", "true");
    renderDashboard(updated);
    goToStep(3);
  } catch (err) {
    showError("budget-error", err.message);
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function renderDashboard(budget) {
  const income        = budget.income?.amount         ?? 0;
  const housing       = budget.housing?.amount        ?? 0;
  const utilities     = budget.utilities?.amount      ?? 0;
  const transport     = budget.transportation?.amount ?? 0;
  const groceries     = budget.groceries?.amount      ?? 0;
  const takeout       = budget.takeout?.amount        ?? 0;
  const shopping      = budget.shopping?.amount       ?? 0;
  const care          = budget.personalCare?.amount   ?? 0;
  const medical       = budget.medical?.amount        ?? 0;
  const entertainment = budget.entertainment?.amount  ?? 0;
  const emergencyFund = budget.emergencyFund?.amount  ?? 0;
  const investing     = budget.investments?.amount    ?? 0;
  const debts         = budget.debts?.amount          ?? 0;

  const expenses = housing + utilities + transport + groceries + takeout + shopping + care + medical + entertainment + debts;
  const savings  = investing + emergencyFund;
  const surplus  = income - expenses - savings;

  // Summary cards
  document.getElementById("dash-income").textContent = fmt(income);
  document.getElementById("dash-expenses").textContent = fmt(expenses);
  document.getElementById("dash-savings").textContent = fmt(savings);

  const surplusEl = document.getElementById("dash-surplus");
  surplusEl.textContent = (surplus >= 0 ? "+" : "-") + fmt(Math.abs(surplus));
  surplusEl.className = "summary-value " + (surplus >= 0 ? "green" : "red");

  // Spending breakdown bars
  const categories = [
    { label: "Housing",        amount: housing },
    { label: "Utilities",      amount: utilities },
    { label: "Transportation", amount: transport },
    { label: "Groceries",      amount: groceries },
    { label: "Medical",        amount: medical },
    { label: "Takeout",        amount: takeout },
    { label: "Shopping",       amount: shopping },
    { label: "Entertainment",  amount: entertainment },
    { label: "Personal care",  amount: care },
    { label: "Emergency fund", amount: emergencyFund },
    { label: "Debts (min)",    amount: debts },
  ];

  document.getElementById("dash-breakdown").innerHTML = categories
    .map((cat) => {
      const pct = income > 0 ? Math.min((cat.amount / income) * 100, 100) : 0;
      return `
        <div class="dash-row">
          <span class="dash-label">${cat.label}</span>
          <div class="dash-bar-wrap">
            <div class="dash-bar" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <span class="dash-amount">${fmt(cat.amount)}</span>
        </div>
      `;
    })
    .join("");

  // Placeholder card values
  document.getElementById("dash-invest-detail").textContent = fmt(investing) + "/mo";
  document.getElementById("dash-debt-detail").textContent   = fmt(debts) + "/mo";
}

// Format a non-negative dollar amount as "$X,XXX". Sign is added by the caller.
function fmt(n) {
  return (
    "$" +
    Math.abs(Number(n)).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
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
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

async function fetchBudget() {
  if (!token) return null;
  try {
    return await apiFetch("/budget");
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

/**
 * Sets a button to a loading state with a spinner and custom text.
 * Restores the original text when loading is false.
 */
function setLoading(btn, loading, text) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>${text || "Working..."}`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || "Link Bank Account";
    delete btn.dataset.originalText;
  }
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((cur, key) => cur?.[key], obj) ?? null;
}
