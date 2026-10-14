// Storage keys are scoped to the signed-in user so two accounts on the
// same browser never see each other's goals, budgets or cached data.
const BASE_KEYS = {
  transactions: "spendwise_transactions",
  goals: "spendwise_savings_goals",
  oldGoal: "spendwise_savings_goal",
  budgets: "spendwise_monthly_budgets"
};

let currentUserId = null;

function storageKey(name) {
  return currentUserId
    ? `${BASE_KEYS[name]}:${currentUserId}`
    : BASE_KEYS[name];
}

const TRANSACTION_CATEGORIES = {
  income: ["Salary", "Business", "Gift", "Other"],
  expense: [
    "Food",
    "Transport",
    "Rent",
    "Bills",
    "Shopping",
    "Entertainment",
    "Health",
    "Education",
    "Other"
  ]
};

const BUDGET_CATEGORIES = TRANSACTION_CATEGORIES.expense;

// Distinct colour per category for the spending bars.
const CATEGORY_COLORS = {
  Food: "#f59e0b",
  Transport: "#3b82f6",
  Rent: "#8b5cf6",
  Bills: "#ef4444",
  Shopping: "#ec4899",
  Entertainment: "#14b8a6",
  Health: "#10b981",
  Education: "#6366f1",
  Other: "#64748b"
};


let transactions = [];
let savingsGoals = [];
let budgets = [];

let goalModalMode = "create";
let activeGoalId = null;


function getElement(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }

  return null;
}

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function roundMoney(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

function formatDate(dateString) {
  if (!dateString) return "No date";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showMessage(message, isError = false) {
  const element = getElement("form-message", "transaction-message");

  if (!element) return;

  element.textContent = message;
  element.classList.toggle("text-rose-600", isError);
  element.classList.toggle("text-emerald-600", !isError);
}


function loadTransactions() {
  try {
    const stored = localStorage.getItem(storageKey("transactions"));
    const parsed = stored ? JSON.parse(stored) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item => item && typeof item === "object")
      .map(item => ({
        ...item,
        id: item.id || createId(),
        description: String(item.description || ""),
        amount: Number(item.amount) || 0,
        type: item.type === "income" ? "income" : "expense",
        category: String(item.category || "Other"),
        date: String(item.date || "")
      }));
  } catch (error) {
    console.error("Could not load transactions:", error);
    return [];
  }
}

function saveTransactions() {
  try {
    localStorage.setItem(storageKey("transactions"), JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error("Could not save transactions:", error);
    showMessage(
      "Could not save transactions. Check your browser storage.",
      true
    );
    return false;
  }
}



function loadSavingsGoals() {
  try {
    const stored = localStorage.getItem(storageKey("goals"));

    if (stored) {
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed)) {
        return parsed
          .filter(goal => goal && typeof goal === "object")
          .map(goal => ({
            ...goal,
            id: goal.id || createId(),
            name: String(goal.name || "Untitled goal"),
            target: Math.max(0, Number(goal.target) || 0),
            saved: Math.max(0, Number(goal.saved) || 0)
          }));
      }
    }

    // Migrate an older single savings goal if one exists.
    const oldStored = localStorage.getItem(storageKey("oldGoal"));

    if (oldStored) {
      const oldGoal = JSON.parse(oldStored);

      if (oldGoal && typeof oldGoal === "object") {
        const migratedGoal = {
          id: createId(),
          name: String(
            oldGoal.name || oldGoal.label || "My Savings Goal"
          ),
          target: Math.max(
            0,
            Number(oldGoal.target ?? oldGoal.amount) || 0
          ),
          saved: Math.max(
            0,
            Number(oldGoal.saved ?? oldGoal.total) || 0
          )
        };

        localStorage.setItem(
          storageKey("goals"),
          JSON.stringify([migratedGoal])
        );

        return [migratedGoal];
      }
    }

    return [];
  } catch (error) {
    console.error("Could not load savings goals:", error);
    return [];
  }
}

function saveSavingsGoals() {
  try {
    localStorage.setItem(
      storageKey("goals"),
      JSON.stringify(savingsGoals)
    );
    return true;
  } catch (error) {
    console.error("Could not save savings goals:", error);
    showGoalMessage(
      "Could not save your savings goal. Check browser storage.",
      true
    );
    return false;
  }
}



function loadBudgets() {
  try {
    const stored = localStorage.getItem(storageKey("budgets"));
    const parsed = stored ? JSON.parse(stored) : {};

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const cleanBudgets = {};

    for (const [month, categories] of Object.entries(parsed)) {
      if (
        !/^\d{4}-\d{2}$/.test(month) ||
        !categories ||
        typeof categories !== "object" ||
        Array.isArray(categories)
      ) {
        continue;
      }

      cleanBudgets[month] = {};

      for (const [category, limit] of Object.entries(categories)) {
        const amount = Number(limit);

        if (
          BUDGET_CATEGORIES.includes(category) &&
          Number.isFinite(amount) &&
          amount > 0
        ) {
          cleanBudgets[month][category] = roundMoney(amount);
        }
      }

      if (Object.keys(cleanBudgets[month]).length === 0) {
        delete cleanBudgets[month];
      }
    }

    return cleanBudgets;
  } catch (error) {
    console.error("Could not load budgets:", error);
    return {};
  }
}

function saveBudgets() {
  try {
    localStorage.setItem(
      storageKey("budgets"),
      JSON.stringify(budgets)
    );
    return true;
  } catch (error) {
    console.error("Could not save budgets:", error);
    showBudgetMessage(
      "Could not save your budget. Check your browser storage.",
      true
    );
    return false;
  }
}



function calculateTotals(items = transactions) {
  return items.reduce(
    (totals, transaction) => {
      const amount = Number(transaction.amount) || 0;

      if (transaction.type === "income") {
        totals.income += amount;
      } else {
        totals.expenses += amount;
      }

      return totals;
    },
    { income: 0, expenses: 0 }
  );
}

function getTotalAllocated() {
  return savingsGoals.reduce(
    (total, goal) => total + (Number(goal.saved) || 0),
    0
  );
}

function getAvailableBalance() {
  const { income, expenses } = calculateTotals();

  return roundMoney(income - expenses - getTotalAllocated());
}

function renderSummary() {
  const { income, expenses } = calculateTotals();
  const balance = getAvailableBalance();

  const incomeElement = getElement("total-income");
  const expensesElement = getElement("total-expenses");
  const balanceElement = getElement("current-balance");

  if (incomeElement) {
    incomeElement.textContent = formatMoney(income);
  }

  if (expensesElement) {
    expensesElement.textContent = formatMoney(expenses);
  }

  if (balanceElement) {
    balanceElement.textContent = formatMoney(balance);
    balanceElement.classList.toggle("text-rose-600", balance < 0);
    balanceElement.classList.toggle("text-emerald-700", balance >= 0);
  }
}



function getSelectedTransactionType() {
  const selectedRadio = document.querySelector(
    'input[name="type"]:checked, input[name="transaction-type"]:checked'
  );

  if (selectedRadio) {
    return selectedRadio.value === "income" ? "income" : "expense";
  }

  const typeSelect = getElement("transaction-type", "type");

  return typeSelect?.value === "income" ? "income" : "expense";
}

function renderCategories() {
  const categorySelect = getElement("transaction-category", "category");

  if (!categorySelect) return;

  const previousValue = categorySelect.value;
  const type = getSelectedTransactionType();
  const categories = TRANSACTION_CATEGORIES[type];

  categorySelect.innerHTML = categories.map(category => `
    <option value="${escapeHTML(category)}">
      ${escapeHTML(category)}
    </option>
  `).join("");

  if (categories.includes(previousValue)) {
    categorySelect.value = previousValue;
  }
}


function getFilteredTransactions() {
  const searchInput = getElement(
    "search-transactions",
    "transaction-search",
    "search-input"
  );

  const categoryFilter = getElement("category-filter", "filter-category");
  const monthFilter = getElement("month-filter", "filter-month");

  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const selectedCategory = categoryFilter?.value || "all";
  const selectedMonth = monthFilter?.value || "all";

  return transactions
    .filter(transaction => {
      const matchesSearch =
        transaction.description.toLowerCase().includes(searchTerm) ||
        transaction.category.toLowerCase().includes(searchTerm);

      const matchesCategory =
        selectedCategory === "all" ||
        transaction.category === selectedCategory;

      const transactionMonth = transaction.date
        ? transaction.date.slice(0, 7)
        : "";

      const matchesMonth =
        selectedMonth === "all" ||
        transactionMonth === selectedMonth;

      return matchesSearch && matchesCategory && matchesMonth;
    })
    .sort((a, b) => {
      const dateComparison = (b.date || "").localeCompare(a.date || "");

      return dateComparison ||
        String(b.id).localeCompare(String(a.id));
    });
}

function renderMonthOptions() {
  const monthSelect = getElement("month-filter", "filter-month");

  if (!monthSelect) return;

  const previousValue = monthSelect.value || "all";

  const months = [...new Set(
    transactions
      .map(transaction => transaction.date?.slice(0, 7))
      .filter(Boolean)
  )].sort().reverse();

  monthSelect.innerHTML = `
    <option value="all">All months</option>
    ${months.map(month => {
      const date = new Date(`${month}-01T00:00:00`);

      const label = date.toLocaleDateString("en-NG", {
        month: "long",
        year: "numeric"
      });

      return `
        <option value="${escapeHTML(month)}">
          ${escapeHTML(label)}
        </option>
      `;
    }).join("")}
  `;

  monthSelect.value = months.includes(previousValue)
    ? previousValue
    : "all";
}

function renderCategoryFilter() {
  const categoryFilter = getElement("category-filter", "filter-category");

  if (!categoryFilter) return;

  const previousValue = categoryFilter.value || "all";

  const categories = [...new Set(
    transactions.map(item => item.category).filter(Boolean)
  )].sort();

  categoryFilter.innerHTML = `
    <option value="all">All categories</option>
    ${categories.map(category => `
      <option value="${escapeHTML(category)}">
        ${escapeHTML(category)}
      </option>
    `).join("")}
  `;

  categoryFilter.value = categories.includes(previousValue)
    ? previousValue
    : "all";
}



function getActiveFilters() {
  const searchInput = getElement("search-transactions");
  const categoryFilter = getElement("category-filter");
  const monthFilter = getElement("month-filter");

  return {
    search: (searchInput?.value || "").trim(),
    category: categoryFilter?.value || "all",
    month: monthFilter?.value || "all"
  };
}

function formatMonthLabel(month) {
  const date = new Date(`${month}-01T00:00:00`);

  if (Number.isNaN(date.getTime())) return month;

  return date.toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric"
  });
}

// Shows which filters are active plus income / expenses / net for the
// filtered set, so the filters visibly change the numbers.
function renderFilterSummary(filtered) {
  const summary = getElement("filter-summary");
  const clearButton = getElement("clear-filters-button");

  if (!summary) return;

  const { search, category, month } = getActiveFilters();
  const isFiltered = Boolean(search) || category !== "all" || month !== "all";

  if (clearButton) clearButton.hidden = !isFiltered;

  const parts = [];
  if (category !== "all") parts.push(category);
  if (month !== "all") parts.push(formatMonthLabel(month));
  if (search) parts.push(`"${search}"`);

  const { income, expenses } = calculateTotals(filtered);
  const net = roundMoney(income - expenses);
  const label = isFiltered ? `Filtered: ${parts.join(" · ")}` : "All transactions";

  summary.innerHTML = `
    <strong>${escapeHTML(label)}</strong>
    <span>${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}</span>
    <span class="text-emerald-600">Income ${escapeHTML(formatMoney(income))}</span>
    <span class="text-rose-600">Expenses ${escapeHTML(formatMoney(expenses))}</span>
    <span class="${net < 0 ? "text-rose-600" : "text-slate-700"}">Net ${escapeHTML(formatMoney(net))}</span>
  `;
}

function clearFilters() {
  const searchInput = getElement("search-transactions");
  const categoryFilter = getElement("category-filter");
  const monthFilter = getElement("month-filter");

  if (searchInput) searchInput.value = "";
  if (categoryFilter) categoryFilter.value = "all";
  if (monthFilter) monthFilter.value = "all";

  renderFilteredViews();
}

// Category spending bars (share of total expenses). They follow the
// month filter so you can see one month's spending breakdown.
function renderCategorySpending() {
  const list = getElement("category-spending-list");
  const scope = getElement("category-spending-scope");

  if (!list) return;

  const { month } = getActiveFilters();

  if (scope) {
    scope.textContent = month === "all"
      ? "All time"
      : formatMonthLabel(month);
  }

  const totalsByCategory = {};

  transactions.forEach(transaction => {
    if (transaction.type !== "expense") return;

    if (month !== "all" && transaction.date?.slice(0, 7) !== month) return;

    totalsByCategory[transaction.category] =
      (totalsByCategory[transaction.category] || 0) +
      (Number(transaction.amount) || 0);
  });

  const rows = Object.entries(totalsByCategory)
    .sort((a, b) => b[1] - a[1]);

  const totalSpent = rows.reduce((sum, [, amount]) => sum + amount, 0);

  if (rows.length === 0 || totalSpent <= 0) {
    list.innerHTML = `
      <p class="text-sm text-slate-500">
        No expenses to show yet. Add an expense and your category
        breakdown will appear here.
      </p>
    `;
    return;
  }

  list.innerHTML = rows.map(([category, amount]) => {
    const percent = Math.round((amount / totalSpent) * 1000) / 10;
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;

    return `
      <div class="category-bar">
        <div class="category-bar-top">
          <span class="category-bar-name">
            <span class="category-dot" style="background:${color}"></span>
            ${escapeHTML(category)}
          </span>
          <span>
            <strong>${escapeHTML(formatMoney(amount))}</strong>
            <span class="text-slate-500"> · ${percent}%</span>
          </span>
        </div>

        <div
          class="category-bar-track"
          role="progressbar"
          aria-label="${escapeHTML(category)} share of spending"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${percent}"
        >
          <div
            class="category-bar-fill"
            style="width:${percent}%; background:${color}"
          ></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFilteredViews() {
  renderTransactions();
  renderCategorySpending();
}

function renderTransactions() {
  const list = getElement(
    "transactions-list",
    "transaction-list",
    "transaction-container"
  );

  if (!list) return;

  const filteredTransactions = getFilteredTransactions();

  renderFilterSummary(filteredTransactions);

  if (filteredTransactions.length === 0) {
    list.innerHTML = `
      <p class="py-8 text-center text-sm text-slate-500">
        No transactions found.
      </p>
    `;
    return;
  }

  list.innerHTML = filteredTransactions.map(transaction => {
    const isIncome = transaction.type === "income";
    const amountClass = isIncome ? "text-emerald-600" : "text-rose-600";
    const sign = isIncome ? "+" : "−";

    return `
      <div
        class="transaction-row"
        data-transaction-id="${escapeHTML(transaction.id)}"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-slate-800">
            ${escapeHTML(transaction.description)}
          </p>

          <p class="mt-1 text-sm text-slate-500">
            ${escapeHTML(transaction.category)} ·
            ${escapeHTML(formatDate(transaction.date))}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <span class="font-semibold ${amountClass}">
            ${sign}${formatMoney(transaction.amount)}
          </span>

          <button
            type="button"
            class="delete-button"
            data-delete-transaction="${escapeHTML(transaction.id)}"
          >
            Delete
          </button>
        </div>
      </div>
    `;
  }).join("");
}



function getTransactionFormValues() {
  return {
    description: getElement(
      "transaction-description",
      "description"
    )?.value.trim() || "",

    amount: Number(getElement(
      "transaction-amount",
      "amount"
    )?.value),

    date: getElement(
      "transaction-date",
      "date"
    )?.value || "",

    category: getElement(
      "transaction-category",
      "category"
    )?.value || "Other",

    type: getSelectedTransactionType()
  };
}

async function handleTransactionSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const values = getTransactionFormValues();

  if (!values.description) {
    showMessage("Please enter a transaction description.", true);
    return;
  }

  if (!Number.isFinite(values.amount) || values.amount <= 0) {
    showMessage("Enter an amount greater than zero.", true);
    return;
  }

  if (!values.date) {
    showMessage("Please select a date.", true);
    return;
  }

  const newTransaction = {
    id: createId(),
    description: values.description,
    amount: roundMoney(values.amount),
    date: values.date,
    category: values.category,
    type: values.type
  };

  try {
  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    showMessage("Please log in before adding a transaction.", true);
    window.location.replace("signin.html");
    return;
  }

  const user = userData.user;

  const { data, error } = await supabaseClient
    .from("transactions")
    .insert({
      user_id: user.id,
      description: newTransaction.description,
      amount: newTransaction.amount,
      category: newTransaction.category,
      type: newTransaction.type,
      transaction_date: newTransaction.date
    })
    .select()
    .single();

  if (error) throw error;

  newTransaction.id = data.id;
  transactions.push(newTransaction);
  saveTransactions();
} catch (error) {
  console.error("Could not save transaction:", error);
  showMessage(error.message || "Could not save transaction.", true);
  return;
}
  form.reset();

  // form.reset() puts the type back to "expense", so rebuild the
  // category list to match (otherwise income categories linger).
  renderCategories();

  const dateInput = getElement("transaction-date", "date");

  if (dateInput) {
    dateInput.value = getLocalToday();
  }

  renderDashboard();
  showMessage("Transaction added successfully.");
}

async function deleteTransaction(transactionId) {


  const previousTransactions = transactions;

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;

    if (!userData.user) {
      showMessage("Please sign in again.", true);
      window.location.replace("signin.html");
      return;
    }

    const userId = userData.user.id;

    const { data, error } = await supabaseClient
  .from("transactions")
      .delete()
      .eq("id", transactionId)
      .eq("user_id", userId)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      showMessage(
        "No transaction was deleted. Check the transaction ID and database permissions.",
        true
      );
      return;
    }

    transactions = previousTransactions.filter(
      item => String(item.id) !== String(transactionId)
    );

    saveTransactions();
    renderDashboard();
    showMessage("Transaction deleted successfully.");

  } catch (error) {
    console.error("Could not delete transaction:", error);

    showMessage(
      error.message || "Could not delete transaction. Please try again.",
      true
    );
  }
}

function getLocalToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function renderSavingsGoals() {
  const goalsList = getElement("savings-goals-list");

  if (!goalsList) return;

  if (savingsGoals.length === 0) {
    goalsList.innerHTML = `
      <p class="text-sm text-slate-500">
        You haven't created any savings goals yet.
      </p>
    `;
    return;
  }

  goalsList.innerHTML = savingsGoals.map(goal => {
    const target = Number(goal.target) || 0;
    const saved = Number(goal.saved) || 0;

    const progress = target > 0
      ? Math.min(100, Math.max(0, saved / target * 100))
      : 0;

    const remaining = Math.max(0, target - saved);
    const completed = target > 0 && saved >= target;

    return `
      <article class="rounded-2xl border border-slate-200 bg-white p-5">

        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="break-words font-bold text-slate-800">
              ${escapeHTML(goal.name)}
            </h3>

            <p class="mt-1 text-sm text-slate-500">
              Target: ${formatMoney(target)}
            </p>
          </div>

          <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            completed
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }">
            ${completed ? "Completed" : `${Math.round(progress)}%`}
          </span>
        </div>

        <div class="mb-2 flex items-center justify-between gap-3 text-sm">
          <span class="text-slate-500">Saved</span>
          <strong>${formatMoney(saved)}</strong>
        </div>

        <div class="progress-track">
          <div
            class="progress-fill"
            style="width: ${progress}%"
          ></div>
        </div>

        <p class="my-3 text-sm text-slate-500">
          ${completed
            ? "You've reached your savings target!"
            : `${formatMoney(remaining)} remaining`}
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            data-fund-goal="${escapeHTML(goal.id)}"
          >
            Fund goal
          </button>

          <button
            type="button"
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            data-edit-goal="${escapeHTML(goal.id)}"
          >
            Edit target
          </button>

          <button
  type="button"
  class="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
  data-delete-goal="${escapeHTML(goal.id)}"
>
  Delete goal
</button>
        </div>

      </article>
    `;
  }).join("");
}



const goalModal = getElement("goal-modal");
const goalForm = getElement("goal-form");
const goalNameInput = getElement("goal-name-input");
const goalAmountInput = getElement("goal-amount-input");
const fundAmountInput = getElement("fund-amount-input");
const goalMessage = getElement("goal-message");

const goalNameField = getElement("goal-name-field");
const goalTargetField = getElement("goal-target-field");
const fundAmountField = getElement("fund-amount-field");

function showGoalMessage(message, isError = false) {
  if (!goalMessage) return;

  goalMessage.textContent = message;
  goalMessage.classList.toggle("text-rose-600", isError);
  goalMessage.classList.toggle("text-emerald-600", !isError);
}

function showGoalModal() {
  if (!goalModal) return;

  goalModal.classList.remove("hidden");
  goalModal.classList.add("flex");
}

function closeGoalModal() {
  if (!goalModal) return;

  goalModal.classList.add("hidden");
  goalModal.classList.remove("flex");

  goalForm?.reset();
  showGoalMessage("");

  goalModalMode = "create";
  activeGoalId = null;
}

function openCreateGoalModal() {
  if (!goalModal || !goalForm) return;

  goalModalMode = "create";
  activeGoalId = null;

  goalForm.reset();
  showGoalMessage("");

  goalNameField?.classList.remove("hidden");
  goalTargetField?.classList.remove("hidden");
  fundAmountField?.classList.add("hidden");

  if (goalNameInput) goalNameInput.required = true;
  if (goalAmountInput) goalAmountInput.required = true;
  if (fundAmountInput) fundAmountInput.required = false;

  const title = getElement("goal-modal-title");
  const description = getElement("goal-modal-description");
  const button = getElement("save-goal-button");

  if (title) title.textContent = "Create savings goal";

  if (description) {
    description.textContent = "Give your savings goal a name and target.";
  }

  if (button) button.textContent = "Create goal";

  showGoalModal();
  goalNameInput?.focus();
}

function openFundModal(goalId) {
  const goal = savingsGoals.find(
    item => String(item.id) === String(goalId)
  );

  if (!goal || !goalModal || !goalForm) return;

  goalModalMode = "fund";
  activeGoalId = goal.id;

  goalForm.reset();
  showGoalMessage("");

  goalNameField?.classList.add("hidden");
  goalTargetField?.classList.add("hidden");
  fundAmountField?.classList.remove("hidden");

  if (goalNameInput) goalNameInput.required = false;
  if (goalAmountInput) goalAmountInput.required = false;
  if (fundAmountInput) fundAmountInput.required = true;

  const title = getElement("goal-modal-title");
  const description = getElement("goal-modal-description");
  const button = getElement("save-goal-button");
  const balanceHelp = getElement("fund-balance-help");

  if (title) title.textContent = `Fund ${goal.name}`;

  if (description) {
    description.textContent = "Allocate money from your available balance.";
  }

  if (button) button.textContent = "Allocate money";

  if (balanceHelp) {
    balanceHelp.textContent =
      `Available balance: ${formatMoney(Math.max(0, getAvailableBalance()))}`;
  }

  showGoalModal();
  fundAmountInput?.focus();
}

function openEditGoalModal(goalId) {
  const goal = savingsGoals.find(
    item => String(item.id) === String(goalId)
  );

  if (!goal || !goalModal || !goalForm) return;

  goalModalMode = "edit";
  activeGoalId = goal.id;

  goalForm.reset();
  showGoalMessage("");

  goalNameField?.classList.remove("hidden");
  goalTargetField?.classList.remove("hidden");
  fundAmountField?.classList.add("hidden");

  if (goalNameInput) {
    goalNameInput.required = true;
    goalNameInput.value = goal.name;
  }

  if (goalAmountInput) {
    goalAmountInput.required = true;
    goalAmountInput.value = goal.target;
  }

  if (fundAmountInput) fundAmountInput.required = false;

  const title = getElement("goal-modal-title");
  const description = getElement("goal-modal-description");
  const button = getElement("save-goal-button");

  if (title) title.textContent = "Edit savings goal";

  if (description) {
    description.textContent = "Update your goal name or target amount.";
  }

  if (button) button.textContent = "Save changes";

  showGoalModal();
  goalNameInput?.focus();
}

function handleGoalSubmit(event) {
  event.preventDefault();

  if (goalModalMode === "fund") {
    handleFundGoal();
    return;
  }

  const name = goalNameInput?.value.trim() || "";
  const target = Number(goalAmountInput?.value);

  if (!name) {
    showGoalMessage("Please enter a goal name.", true);
    return;
  }

  if (!Number.isFinite(target) || target <= 0) {
    showGoalMessage("Enter a target greater than zero.", true);
    return;
  }

  if (goalModalMode === "edit") {
    handleEditGoal(name, roundMoney(target));
  } else {
    handleCreateGoal(name, roundMoney(target));
  }
}

function handleCreateGoal(name, target) {
  const goal = {
    id: createId(),
    name,
    target,
    saved: 0
  };

  savingsGoals.push(goal);

  if (!saveSavingsGoals()) {
    savingsGoals = savingsGoals.filter(item => item.id !== goal.id);
    return;
  }

  closeGoalModal();
  renderDashboard();
}

function handleEditGoal(name, target) {
  const goal = savingsGoals.find(
    item => String(item.id) === String(activeGoalId)
  );

  if (!goal) {
    showGoalMessage("Savings goal not found.", true);
    return;
  }

  if (target < goal.saved) {
    showGoalMessage(
      `The target cannot be lower than the saved amount (${formatMoney(goal.saved)}).`,
      true
    );
    return;
  }

  const previousName = goal.name;
  const previousTarget = goal.target;

  goal.name = name;
  goal.target = target;

  if (!saveSavingsGoals()) {
    goal.name = previousName;
    goal.target = previousTarget;
    return;
  }

  closeGoalModal();
  renderDashboard();
}

function handleFundGoal() {
  const amount = Number(fundAmountInput?.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showGoalMessage("Enter an amount greater than zero.", true);
    return;
  }

  const goal = savingsGoals.find(
    item => String(item.id) === String(activeGoalId)
  );

  if (!goal) {
    showGoalMessage("Savings goal not found.", true);
    return;
  }

  const availableBalance = getAvailableBalance();

  if (availableBalance < 0 || amount > availableBalance) {
    showGoalMessage(
      `Insufficient available balance. You have ${formatMoney(
        Math.max(0, availableBalance)
      )} available.`,
      true
    );
    return;
  }

  const previousSaved = goal.saved;
  goal.saved = roundMoney(goal.saved + amount);

  if (!saveSavingsGoals()) {
    goal.saved = previousSaved;
    return;
  }

  closeGoalModal();
  renderDashboard();
}



function getCurrentMonth() {
  return getLocalToday().slice(0, 7);
}

function getSelectedBudgetMonth() {
  return getElement("budget-month")?.value || getCurrentMonth();
}

function getBudgetForCategory(month, category) {
  return Number(budgets[month]?.[category]) || 0;
}

function showBudgetMessage(message, isError = false) {
  const element = getElement("budget-message");

  if (!element) return;

  element.textContent = message;
  element.classList.toggle("text-rose-600", isError);
  element.classList.toggle("text-emerald-600", !isError);
}

function getMonthlyCategorySpending(month, category) {
  return transactions.reduce((total, transaction) => {
    if (
      transaction.type === "expense" &&
      transaction.date?.slice(0, 7) === month &&
      transaction.category === category
    ) {
      return total + (Number(transaction.amount) || 0);
    }

    return total;
  }, 0);
}

function getMonthlyTotalSpending(month) {
  return transactions.reduce((total, transaction) => {
    if (
      transaction.type === "expense" &&
      transaction.date?.slice(0, 7) === month
    ) {
      return total + (Number(transaction.amount) || 0);
    }

    return total;
  }, 0);
}



function renderBudget() {
  const monthInput = getElement("budget-month");

  if (monthInput && !monthInput.value) {
    monthInput.value = getCurrentMonth();
  }

  const month = getSelectedBudgetMonth();
  const monthBudgets = budgets[month] || {};

  const totalLimit = Object.values(monthBudgets).reduce(
    (sum, limit) => sum + (Number(limit) || 0),
    0
  );

  const totalSpent = getMonthlyTotalSpending(month);
  const remaining = totalLimit - totalSpent;

  const totalLimitElement = getElement("budget-total-limit");
  const totalSpentElement = getElement("budget-total-spent");
  const remainingElement = getElement("budget-total-remaining");
  const budgetList = getElement("budget-list");

  if (totalLimitElement) {
    totalLimitElement.textContent = formatMoney(totalLimit);
  }

  if (totalSpentElement) {
    totalSpentElement.textContent = formatMoney(totalSpent);
  }

  if (remainingElement) {
    remainingElement.textContent = formatMoney(remaining);

    remainingElement.classList.toggle("text-rose-600", remaining < 0);
    remainingElement.classList.toggle("text-emerald-700", remaining >= 0);
  }

  if (!budgetList) return;

  const categories = BUDGET_CATEGORIES.filter(
    category => getBudgetForCategory(month, category) > 0
  );

  if (categories.length === 0) {
    budgetList.innerHTML = `
      <p class="text-sm text-slate-500">
        No budgets set for this month yet.
        Use the form above to create your first category budget.
      </p>
    `;
    return;
  }

  budgetList.innerHTML = categories.map(category => {
    const limit = getBudgetForCategory(month, category);
    const spent = getMonthlyCategorySpending(month, category);
    const left = roundMoney(limit - spent);
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
    const barWidth = Math.min(100, Math.max(0, percentage));

    let progressClass = "";

    if (percentage >= 100) {
      progressClass = "over-budget";
    } else if (percentage >= 80) {
      progressClass = "warning";
    }

    let statusText = `${formatMoney(left)} remaining`;

    if (left < 0) {
      statusText = `${formatMoney(Math.abs(left))} over budget`;
    } else if (left === 0) {
      statusText = "Budget fully used";
    }

    return `
      <article class="budget-category-card">

        <div class="flex items-start justify-between gap-3">
          <div>
            <h4>${escapeHTML(category)}</h4>
            <p class="mt-1 text-sm text-slate-500">
              Limit: ${formatMoney(limit)}
            </p>
          </div>

          <button
            type="button"
            class="budget-delete-button"
            data-delete-budget="${escapeHTML(category)}"
          >
            Remove
          </button>
        </div>

        <div class="mt-5 flex items-center justify-between gap-3 text-sm">
          <span class="text-slate-500">Spent</span>
          <strong>${formatMoney(spent)}</strong>
        </div>

        <div class="budget-progress-track">
          <div
            class="budget-progress-fill ${progressClass}"
            style="width: ${barWidth}%"
          ></div>
        </div>

        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="${left < 0 ? "text-rose-600" : "text-slate-500"}">
            ${escapeHTML(statusText)}
          </span>

          <strong class="${left < 0 ? "text-rose-600" : "text-slate-700"}">
            ${Math.round(percentage)}%
          </strong>
        </div>

      </article>
    `;
  }).join("");
}



function loadBudgetFormValue() {
  const categoryInput = getElement("budget-category");
  const limitInput = getElement("budget-limit");

  if (!categoryInput || !limitInput) return;

  const month = getSelectedBudgetMonth();
  const existingLimit = getBudgetForCategory(month, categoryInput.value);

  limitInput.value = existingLimit > 0 ? existingLimit : "";
}

function handleBudgetSubmit(event) {
  event.preventDefault();

  const categoryInput = getElement("budget-category");
  const limitInput = getElement("budget-limit");

  if (!categoryInput || !limitInput) return;

  const month = getSelectedBudgetMonth();
  const category = categoryInput.value;
  const limit = Number(limitInput.value);

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    showBudgetMessage("Please select a valid month.", true);
    return;
  }

  if (!BUDGET_CATEGORIES.includes(category)) {
    showBudgetMessage("Please select a valid category.", true);
    return;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    showBudgetMessage("Enter a budget greater than zero.", true);
    return;
  }

  if (!budgets[month]) {
    budgets[month] = {};
  }

  const previousLimit = budgets[month][category];
  budgets[month][category] = roundMoney(limit);

  if (!saveBudgets()) {
    if (previousLimit === undefined) {
      delete budgets[month][category];
    } else {
      budgets[month][category] = previousLimit;
    }

    if (
      budgets[month] &&
      Object.keys(budgets[month]).length === 0
    ) {
      delete budgets[month];
    }

    return;
  }

  showBudgetMessage(`${category} budget saved successfully.`);
  renderBudget();
}

function deleteBudget(category) {
  const month = getSelectedBudgetMonth();
  const monthBudgets = budgets[month];

  if (!monthBudgets || monthBudgets[category] === undefined) return;

  const previousLimit = monthBudgets[category];

  delete monthBudgets[category];

  if (Object.keys(monthBudgets).length === 0) {
    delete budgets[month];
  }

  if (!saveBudgets()) {
    if (!budgets[month]) {
      budgets[month] = {};
    }

    budgets[month][category] = previousLimit;
    return;
  }

  showBudgetMessage(`${category} budget removed.`);
  renderBudget();
}



function renderDashboard() {
  renderSummary();
  renderMonthOptions();
  renderCategoryFilter();
  renderCategories();
  renderTransactions();
  renderCategorySpending();
  renderSavingsGoals();
  renderBudget();
}



// Transaction form
const transactionForm = getElement(
  "transaction-form",
  "add-transaction-form"
);

transactionForm?.addEventListener("submit", handleTransactionSubmit);

// Update categories when the transaction type changes.
document.querySelectorAll(
  'input[name="type"], input[name="transaction-type"], #transaction-type, #type'
).forEach(element => {
  element.addEventListener("change", renderCategories);
});

// Transaction filters
[
  "search-transactions",
  "transaction-search",
  "search-input",
  "category-filter",
  "filter-category",
  "month-filter",
  "filter-month"
].forEach(id => {
  const element = document.getElementById(id);

  element?.addEventListener("input", renderFilteredViews);
  element?.addEventListener("change", renderFilteredViews);
});

getElement("clear-filters-button")?.addEventListener("click", clearFilters);

// Sign out
getElement("logout-button")?.addEventListener("click", async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.error("Sign out failed:", error);
  }

  window.location.replace("signin.html");
});

// Transaction deletion, savings goal actions, and budget deletion.
document.addEventListener("click", event => {
  const deleteTransactionButton = event.target.closest(
    "[data-delete-transaction]"
  );

  if (deleteTransactionButton) {
  showConfirmModal(
    "Are you sure you want to delete this transaction?",
    "Delete transaction"
  ).then(confirmed => {
    if (confirmed) {
      deleteTransaction(
        deleteTransactionButton.dataset.deleteTransaction
      );
    }
  });

  return;
}


  const fundButton = event.target.closest("[data-fund-goal]");

  if (fundButton) {
    openFundModal(fundButton.dataset.fundGoal);
    return;
  }

  const editButton = event.target.closest("[data-edit-goal]");

  if (editButton) {
    openEditGoalModal(editButton.dataset.editGoal);
    return;
  }

  const deleteGoalButton = event.target.closest("[data-delete-goal]");

if (deleteGoalButton) {
  const goalId = deleteGoalButton.dataset.deleteGoal;

  showConfirmModal(
    "Are you sure you want to delete this savings goal?",
    "Delete savings goal"
  ).then(confirmed => {
    if (!confirmed) return;

    // Keep a copy so we can restore the goals if saving fails.
    const previousGoals = savingsGoals;

    const updatedGoals = savingsGoals.filter(
      goal => String(goal.id) !== String(goalId)
    );

    if (updatedGoals.length === previousGoals.length) {
      showGoalMessage("Savings goal not found. Please refresh and try again.", true);
      return;
    }

    // Save locally, because this version of savings goals uses localStorage.
    savingsGoals = updatedGoals;

    if (!saveSavingsGoals()) {
      savingsGoals = previousGoals;
      renderSavingsGoals();
      return;
    }

    renderDashboard();
    showGoalMessage("Savings goal deleted successfully.");
  });

  return;
}

  const removeBudgetButton = event.target.closest("[data-delete-budget]");

  if (removeBudgetButton) {
    const category = removeBudgetButton.dataset.deleteBudget;

    showConfirmModal(
  `Remove the ${category} budget for this month?`,
  "Remove budget"
).then(confirmed => {
  if (confirmed) {
    deleteBudget(category);
  }
});
  }
});

// Savings goal modal
getElement("add-goal-button")?.addEventListener(
  "click",
  openCreateGoalModal
);

getElement("close-goal-modal")?.addEventListener(
  "click",
  closeGoalModal
);

getElement("cancel-goal")?.addEventListener(
  "click",
  closeGoalModal
);

goalForm?.addEventListener("submit", handleGoalSubmit);

goalModal?.addEventListener("click", event => {
  if (event.target === goalModal) {
    closeGoalModal();
  }
});

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    goalModal &&
    !goalModal.classList.contains("hidden")
  ) {
    closeGoalModal();
  }
});

// Budget form and selectors
const budgetForm = getElement("budget-form");
const budgetMonthInput = getElement("budget-month");
const budgetCategoryInput = getElement("budget-category");

if (budgetMonthInput && !budgetMonthInput.value) {
  budgetMonthInput.value = getCurrentMonth();
}

budgetForm?.addEventListener("submit", handleBudgetSubmit);

budgetMonthInput?.addEventListener("change", () => {
  showBudgetMessage("");
  loadBudgetFormValue();
  renderBudget();
});

budgetCategoryInput?.addEventListener("change", loadBudgetFormValue);


const transactionDateInput = getElement(
  "transaction-date",
  "date"
);

if (transactionDateInput && !transactionDateInput.value) {
  transactionDateInput.value = getLocalToday();
}

async function initApp() {
  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
      window.location.replace("signin.html");
      return;
    }

    currentUserId = data.user.id;
  } catch (error) {
    console.error("Could not verify the signed-in user:", error);
    window.location.replace("signin.html");
    return;
  }

  // Paint instantly from this user's LocalStorage copy, then sync.
  transactions = loadTransactions();
  savingsGoals = loadSavingsGoals();
  budgets = loadBudgets();

  renderDashboard();

  await loadTransactionsFromSupabase();
}

async function loadTransactionsFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("transactions")
      .select("*")
      .eq("user_id", currentUserId)
      .order("transaction_date", { ascending: false });

    if (error) throw error;

    transactions = (data || []).map(item => ({
      id: item.id,
      description: item.description,
      amount: Number(item.amount),
      category: item.category,
      type: item.type,
      date: item.transaction_date
    }));

    saveTransactions();
    renderDashboard();
  } catch (error) {
    console.error("Could not load Supabase transactions:", error);

    showMessage(
      "Could not reach the server. Showing your last saved data.",
      true
    );
  }
}

initApp();


function showConfirmModal(message, title = "Are you sure?") {
  return new Promise(resolve => {
    const modal = document.getElementById("confirm-modal");
    const titleElement = document.getElementById("confirm-title");
    const messageElement = document.getElementById("confirm-message");
    const yesButton = document.getElementById("confirm-yes");
    const cancelButton = document.getElementById("confirm-cancel");

    if (!modal || !titleElement || !messageElement ||
        !yesButton || !cancelButton) {
      resolve(window.confirm(message));
      return;
    }

    titleElement.textContent = title;
    messageElement.textContent = message;
    modal.hidden = false;

    function finish(answer) {
      modal.hidden = true;
      yesButton.removeEventListener("click", confirm);
      cancelButton.removeEventListener("click", cancel);
      modal.removeEventListener("click", outsideClick);
      document.removeEventListener("keydown", escapeKey);
      resolve(answer);
    }

    function confirm() {
      finish(true);
    }

    function cancel() {
      finish(false);
    }

    function outsideClick(event) {
      if (event.target === modal) cancel();
    }

    function escapeKey(event) {
      if (event.key === "Escape") cancel();
    }

    yesButton.addEventListener("click", confirm);
    cancelButton.addEventListener("click", cancel);
    modal.addEventListener("click", outsideClick);
    document.addEventListener("keydown", escapeKey);

    cancelButton.focus();
  });
}