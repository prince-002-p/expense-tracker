/* ═══════════════════════════════════════════════════════
   FLOWFUND — FINTECH EXPENSE TRACKER | script.js
   Senior Engineering Implementation: Modular App Architecture
   ═══════════════════════════════════════════════════════ */

// ── STATE ────────────────────────────────────────────────
let transactions   = [];
let budgets        = {}; // Category budget caps e.g. { '🍔 Food & Dining': 500 }
let editId         = null;
let chosenType     = null;
let activeFilter   = 'all';
let searchQuery    = '';
let sortBy         = 'date-desc';
let selectedCurrency = 'INR';
let pendingDelId   = null;
let lastDeletedTxn = null;
let undoTimer      = null;

// Currency Configuration
const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'en-IE' },
  GBP: { symbol: '£', locale: 'en-GB' }
};

// Categories with Emojis
const CATEGORIES = {
  income: [
    '💼 Salary', '💻 Freelance', '🏢 Business', '🎁 Gift',
    '📈 Investment', '🔄 Refund', '📦 Other Income'
  ],
  expense: [
    '🍔 Food & Dining', '🚌 Travel', '🛍️ Shopping', '🏠 Housing / Rent',
    '💊 Health', '📚 Education', '🎬 Entertainment', '⚡ Utilities / Bills',
    '👫 Lent to Friend', '📦 Other Expense'
  ]
};

// Colors for SVG Donut & Category Bars
const CATEGORY_COLORS = [
  '#3d8b4e', '#d95555', '#c8994a', '#4a90e2', '#9013fe',
  '#e67e22', '#1abc9c', '#e91e63', '#34495e', '#7f8c8d'
];

// ── DOM REFS ──────────────────────────────────────────────
const pickerOverlay  = document.getElementById('picker-overlay');
const budgetOverlay  = document.getElementById('budget-overlay');
const delOverlay     = document.getElementById('del-overlay');
const txnFeed        = document.getElementById('txn-feed');
const emptyState     = document.getElementById('empty-state');
const currencySelect = document.getElementById('currency-select');
const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const sortSelect     = document.getElementById('sort-select');

// ── INITIALIZATION ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  initEventListeners();
  renderAll();
});

function loadStorage() {
  try {
    const rawTxns = localStorage.getItem('flowfund_v2');
    const parsedTxns = rawTxns ? JSON.parse(rawTxns) : [];
    transactions = Array.isArray(parsedTxns) ? parsedTxns : [];

    const rawBudgets = localStorage.getItem('flowfund_budgets');
    const parsedBudgets = rawBudgets ? JSON.parse(rawBudgets) : {};
    budgets = parsedBudgets && typeof parsedBudgets === 'object' ? parsedBudgets : {};
  } catch (error) {
    console.warn('FlowFund storage could not be parsed. Starting with a clean state.', error);
    transactions = [];
    budgets = {};
  }

  const rawCurr = localStorage.getItem('flowfund_currency');
  if (rawCurr && CURRENCIES[rawCurr]) {
    selectedCurrency = rawCurr;
    currencySelect.value = rawCurr;
  }
}

function saveStorage() {
  localStorage.setItem('flowfund_v2', JSON.stringify(transactions));
  localStorage.setItem('flowfund_budgets', JSON.stringify(budgets));
  localStorage.setItem('flowfund_currency', selectedCurrency);
}

function initEventListeners() {
  // Modal Backdrop Clicks
  pickerOverlay.addEventListener('click', e => {
    if (e.target === pickerOverlay) closePicker();
  });
  budgetOverlay.addEventListener('click', e => {
    if (e.target === budgetOverlay) closeBudgetModal();
  });
  delOverlay.addEventListener('click', e => {
    if (e.target === delOverlay) closeDel();
  });

  // Modal Close Buttons
  document.getElementById('picker-close').onclick = closePicker;
  document.getElementById('del-confirm-btn').onclick = confirmDelete;

  // Currency Dropdown Change
  currencySelect.addEventListener('change', e => {
    selectedCurrency = e.target.value;
    saveStorage();
    renderAll();
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (!typing && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openPicker();
      return;
    }

    if (e.key === 'Escape') {
      if (!pickerOverlay.classList.contains('hidden')) closePicker();
      if (!budgetOverlay.classList.contains('hidden')) closeBudgetModal();
      if (!delOverlay.classList.contains('hidden')) closeDel();
      if (document.getElementById('inline-form')) removeForm();
    }
  });
}

// ── PICKER MODAL FLOW ────────────────────────────────────
function openPicker() {
  removeForm();
  editId = null;
  chosenType = null;
  pickerOverlay.classList.remove('hidden');
  document.getElementById('picker-close').focus();
}

function closePicker() {
  pickerOverlay.classList.add('hidden');
}

function pickType(type) {
  chosenType = type;
  closePicker();
  buildForm(type);
}

// ── BUDGET MODAL CONTROLLER ──────────────────────────────
function openBudgetModal() {
  const budgetList = document.getElementById('budget-input-list');
  const symbol = CURRENCIES[selectedCurrency].symbol;

  budgetList.innerHTML = CATEGORIES.expense.map(cat => {
    const currentLimit = budgets[cat] || '';
    return `
      <div class="budget-field-item">
        <label class="budget-field-lbl" for="budget-${cat}">${cat}</label>
        <div class="budget-field-wrapper">
          <input type="number" id="budget-${cat}" class="budget-field-input"
                 placeholder="${symbol}0.00" min="0" step="10"
                 value="${currentLimit}" data-cat="${cat}" />
        </div>
      </div>
    `;
  }).join('');

  budgetOverlay.classList.remove('hidden');
  document.getElementById('budget-close').focus();
}

function closeBudgetModal() {
  budgetOverlay.classList.add('hidden');
}

function saveBudgets(e) {
  e.preventDefault();
  const inputs = document.querySelectorAll('.budget-field-input');

  inputs.forEach(input => {
    const cat = input.dataset.cat;
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      budgets[cat] = val;
    } else {
      delete budgets[cat];
    }
  });

  saveStorage();
  closeBudgetModal();
  renderAll();
  showToast('🎯 Monthly budget caps saved!');
}

// ── INLINE FORM CONTROLLER ────────────────────────────────
function buildForm(type, existingTxn = null) {
  // Preserve editId while replacing an existing inline form.
  const currentEditId = editId;
  removeForm();
  editId = currentEditId;
  const formContainer = document.getElementById('form-container');

  const lastCat = localStorage.getItem('last_category_' + type);
  const selectedCat = existingTxn ? existingTxn.category : (lastCat || CATEGORIES[type][0]);

  const opts = CATEGORIES[type].map(c =>
    `<option value="${c}" ${c === selectedCat ? 'selected' : ''}>${c}</option>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];
  const dateValue = existingTxn ? existingTxn.date : today;
  const descValue = existingTxn ? esc(existingTxn.desc) : '';
  const amtValue  = existingTxn ? existingTxn.amount : '';

  const wrap = document.createElement('div');
  wrap.className = 'inline-form-wrap';
  wrap.id = 'inline-form';

  wrap.innerHTML = `
    <div class="if-header">
      <span class="if-badge ${type}">${type === 'income' ? '↑ Income' : '↓ Expense'}</span>
      <div class="if-actions">
        <button type="button" class="if-change" onclick="openPicker()">Type ↩</button>
        <button type="button" class="if-cancel" onclick="removeForm()">✕</button>
      </div>
    </div>

    <div class="if-field">
      <label class="if-lbl" for="if-desc">Description</label>
      <input class="if-input" id="if-desc" type="text" placeholder="e.g. Salary, Grocery, Rent..." maxlength="60" value="${descValue}" required />
    </div>

    <div class="if-field">
      <label class="if-lbl" for="if-amt">Amount (${CURRENCIES[selectedCurrency].symbol})</label>
      <input class="if-input" id="if-amt" type="number" placeholder="0.00" min="0.01" step="0.01" value="${amtValue}" required />
    </div>

    <div class="if-field">
      <label class="if-lbl" for="if-cat">Category</label>
      <select class="if-input" id="if-cat">${opts}</select>
    </div>

    <div class="if-field">
      <label class="if-lbl" for="if-date">Date</label>
      <input class="if-input" id="if-date" type="date" value="${dateValue}" required />
    </div>

    <button type="button" class="if-submit ${type === 'income' ? 'inc' : 'exp'}" onclick="submitForm()">
      ${existingTxn ? 'Update Transaction →' : 'Save Transaction →'}
    </button>
    <p class="if-err" id="if-err" aria-live="polite"></p>
  `;

  formContainer.appendChild(wrap);

  setTimeout(() => document.getElementById('if-desc')?.focus(), 50);

  wrap.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      submitForm();
    }
  });
}

function removeForm() {
  document.getElementById('inline-form')?.remove();
  editId = null;
}

// ── SUBMIT TRANSACTION ───────────────────────────────────
function submitForm() {
  const descInput = document.getElementById('if-desc');
  const amtInput  = document.getElementById('if-amt');
  const catInput  = document.getElementById('if-cat');
  const dateInput = document.getElementById('if-date');
  const errEl     = document.getElementById('if-err');

  if (!descInput || !amtInput || !catInput || !dateInput) return;
  if (errEl) errEl.textContent = '';

  const desc = descInput.value.trim();
  const amt = Number.parseFloat(amtInput.value);
  const cat = catInput.value;
  const date = dateInput.value;
  const type = chosenType || (editId !== null
    ? transactions.find(t => t.id === editId)?.type
    : null);

  // Form validation
  if (!desc) {
    if (errEl) errEl.textContent = 'Description is required.';
    descInput.focus();
    return;
  }

  if (!Number.isFinite(amt) || amt <= 0) {
    if (errEl) errEl.textContent = 'Enter a valid positive amount.';
    amtInput.focus();
    return;
  }

  if (!date) {
    if (errEl) errEl.textContent = 'Please pick a valid date.';
    dateInput.focus();
    return;
  }

  if (!type || !CATEGORIES[type]) {
    if (errEl) errEl.textContent = 'Please select Income or Expense first.';
    return;
  }

  try {
    if (editId !== null) {
      const index = transactions.findIndex(t => t.id === editId);

      if (index === -1) {
        if (errEl) errEl.textContent = 'Transaction could not be found.';
        return;
      }

      transactions[index] = {
        ...transactions[index],
        type,
        desc,
        amount: amt,
        category: cat,
        date
      };

      localStorage.setItem('last_category_' + type, cat);
      saveStorage();
      renderAll();
      showToast('✏️ Transaction updated!');
    } else {
      const newTxn = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        type,
        desc,
        amount: amt,
        category: cat,
        date
      };

      transactions.unshift(newTxn);
      localStorage.setItem('last_category_' + type, cat);
      saveStorage();
      renderAll();
      showToast(type === 'income' ? '✅ Income recorded!' : '🔴 Expense recorded!');
    }

    removeForm();
    chosenType = null;
  } catch (error) {
    console.error('FlowFund save error:', error);
    if (errEl) {
      errEl.textContent = 'Could not save this transaction. Please try again.';
    }
  }
}

// ── SEARCH, FILTER & SORT ─────────────────────────────────
function handleSearch() {
  searchQuery = searchInput.value.trim().toLowerCase();
  if (searchQuery) {
    searchClear.classList.remove('hidden');
  } else {
    searchClear.classList.add('hidden');
  }
  renderFeed();
}

function clearSearch() {
  searchInput.value = '';
  searchQuery = '';
  searchClear.classList.add('hidden');
  renderFeed();
}

function applyFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.fpill').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  renderFeed();
}

function handleSortChange() {
  sortBy = sortSelect.value;
  renderFeed();
}

// ── RENDER ALL COMPONENTS ─────────────────────────────────
function renderAll() {
  renderSummary();
  renderFeed();
  renderAnalytics();
  renderMiniCats();
}

// ── SUMMARY & FINANCIAL HEALTH ────────────────────────────
function renderSummary() {
  let inc = 0, exp = 0;
  transactions.forEach(t => {
    if (t.type === 'income')  inc += t.amount;
    if (t.type === 'expense') exp += t.amount;
  });

  const netBalance = inc - exp;
  document.getElementById('balance').textContent = fmtSigned(netBalance);
  document.getElementById('income').textContent  = fmt(inc);
  document.getElementById('expense').textContent = fmt(exp);

  // Financial Health Calculation
  const healthBadge = document.getElementById('health-badge');
  if (inc === 0 && exp === 0) {
    healthBadge.textContent = 'No Data';
    healthBadge.className = 'health-badge';
  } else if (inc > 0) {
    const savingsRate = Math.round(((inc - exp) / inc) * 100);
    if (savingsRate >= 20) {
      healthBadge.textContent = `${savingsRate}% Saved (Healthy)`;
      healthBadge.className = 'health-badge positive';
    } else if (savingsRate >= 0) {
      healthBadge.textContent = `${savingsRate}% Saved (Moderate)`;
      healthBadge.className = 'health-badge warning';
    } else {
      healthBadge.textContent = `${savingsRate}% Net Deficit`;
      healthBadge.className = 'health-badge negative';
    }
  } else {
    healthBadge.textContent = 'Deficit Spend';
    healthBadge.className = 'health-badge negative';
  }
}

// ── TRANSACTION FEED RENDERER ────────────────────────────
function renderFeed() {
  let filtered = transactions.filter(t => {
    const matchFilter = activeFilter === 'all' || t.type === activeFilter;
    const matchSearch = !searchQuery ||
      t.desc.toLowerCase().includes(searchQuery) ||
      t.category.toLowerCase().includes(searchQuery);
    return matchFilter && matchSearch;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'date-desc') return b.date.localeCompare(a.date) || b.id - a.id;
    if (sortBy === 'date-asc') return a.date.localeCompare(b.date) || a.id - b.id;
    if (sortBy === 'amount-desc') return b.amount - a.amount;
    if (sortBy === 'amount-asc') return a.amount - b.amount;
    return 0;
  });

  const countLabel = document.getElementById('txn-count-label');
  countLabel.textContent = `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`;

  if (filtered.length === 0) {
    txnFeed.innerHTML = '';
    emptyState.style.display = 'flex';
    if (searchQuery) {
      document.getElementById('empty-title').textContent = 'No matching entries';
      document.getElementById('empty-desc').textContent = `No results found for "${esc(searchQuery)}". Try clearing your search.`;
    } else {
      document.getElementById('empty-title').textContent = 'Nothing recorded yet';
      document.getElementById('empty-desc').textContent = 'Hit Add Transaction on the sidebar to log your first entry.';
    }
    return;
  }

  emptyState.style.display = 'none';

  const groups = {};
  filtered.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  txnFeed.innerHTML = sortedDates.map(date =>
    `<div class="date-group-label">${fmtDL(date)}</div>` +
    groups[date].map(card).join('')
  ).join('');
}

function card(t) {
  const parts   = t.category.split(' ');
  const emoji   = parts[0];
  const catName = parts.slice(1).join(' ');

  return `
    <div class="txn-card" tabindex="0" onclick="editTxn(${t.id})" onkeydown="handleCardKeydown(event, ${t.id})">
      <div class="txn-bar ${t.type}"></div>
      <div class="txn-circle ${t.type}" aria-hidden="true">${emoji}</div>
      <div class="txn-body">
        <div class="txn-desc">${esc(t.desc)}</div>
        <div class="txn-meta">
          <span class="txn-pill">${catName || t.category}</span>
          <span class="txn-date">${fmtDS(t.date)}</span>
        </div>
      </div>
      <div class="txn-amt ${t.type}">
        ${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}
      </div>
      <button class="txn-del" type="button" onclick="openDel(event, ${t.id})" title="Delete entry" aria-label="Delete ${esc(t.desc)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>
  `;
}

function handleCardKeydown(e, id) {
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.target.classList.contains('txn-del')) return;
    e.preventDefault();
    editTxn(id);
  }
}

// ── EDIT TRANSACTION ─────────────────────────────────────
function editTxn(id) {
  const txn = transactions.find(t => t.id === id);
  if (!txn) return;

  editId = id;
  chosenType = txn.type;
  buildForm(txn.type, txn);
}

// ── DELETE & UNDO FLOW ───────────────────────────────────
function openDel(e, id) {
  e.stopPropagation();
  pendingDelId = id;
  delOverlay.classList.remove('hidden');
}

function closeDel() {
  delOverlay.classList.add('hidden');
  pendingDelId = null;
}

function confirmDelete() {
  if (pendingDelId === null) return;

  const targetTxn = transactions.find(t => t.id === pendingDelId);
  if (!targetTxn) { closeDel(); return; }

  lastDeletedTxn = { ...targetTxn };
  transactions = transactions.filter(t => t.id !== pendingDelId);

  closeDel();
  saveStorage();
  renderAll();
  removeForm();

  showToast('🗑️ Entry removed', true);
}

function undoDelete() {
  if (!lastDeletedTxn) return;

  transactions.unshift(lastDeletedTxn);
  lastDeletedTxn = null;
  clearTimeout(undoTimer);

  saveStorage();
  renderAll();

  const undoBtn = document.getElementById('toast-undo');
  if (undoBtn) undoBtn.classList.add('hidden');
  showToast('↩️ Restored transaction');
}

// ── CATEGORY ANALYTICS & BUDGET PROGRESS ─────────────────
function renderAnalytics() {
  const donutSegments = document.getElementById('donut-segments');
  const donutTotal    = document.getElementById('donut-total');
  const categoryBars  = document.getElementById('category-bars');
  const smartInsight  = document.getElementById('smart-insight');

  const currentMonth = getCurrentMonthKey();
  const expenses = transactions.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth));
  const totalExp = expenses.reduce((sum, t) => sum + t.amount, 0);

  donutTotal.textContent = fmtShort(totalExp);

  if (totalExp === 0) {
    donutSegments.innerHTML = '';
    categoryBars.innerHTML = '<p class="empty-analytics-msg">No expenses recorded this month yet.</p>';
    smartInsight.textContent = 'This month: no expenses';
    return;
  }

  // Aggregate by category
  const catMap = {};
  expenses.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });

  const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0];
  const topPct = Math.round((topCat[1] / totalExp) * 100);

  // Check budget warnings
  let overBudgetCount = 0;
  sortedCats.forEach(([cat, total]) => {
    if (budgets[cat] && total > budgets[cat]) overBudgetCount++;
  });

  if (overBudgetCount > 0) {
    smartInsight.textContent = `⚠️ ${overBudgetCount} Category Over Budget!`;
  } else {
    smartInsight.textContent = `Top Spend: ${topCat[0].split(' ')[0]} ${topPct}%`;
  }

  // Render SVG Donut
  let accumulatedPct = 0;
  donutSegments.innerHTML = sortedCats.slice(0, 5).map(([cat, total], idx) => {
    const pct = total / totalExp;
    const strokeDasharray = `${pct * 100} ${100 - (pct * 100)}`;
    const strokeDashoffset = -accumulatedPct * 100;
    accumulatedPct += pct;
    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

    return `<circle cx="18" cy="18" r="15.915" fill="none" stroke="${color}" stroke-width="3.8"
              stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"></circle>`;
  }).join('');

  // Render Category Progress Bars with Budget Caps
  categoryBars.innerHTML = sortedCats.slice(0, 5).map(([cat, total], idx) => {
    const cap = budgets[cat];
    let pct = Math.round((total / totalExp) * 100);
    let valText = `${fmt(total)} (${pct}%)`;
    let statusClass = '';

    if (cap) {
      const budgetPct = Math.round((total / cap) * 100);
      pct = Math.min(budgetPct, 100);
      valText = `${fmt(total)} / ${fmt(cap)} (${budgetPct}%)`;

      if (total >= cap) {
        statusClass = 'over-budget';
      } else if (budgetPct >= 80) {
        statusClass = 'near-budget';
      }
    }

    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    return `
      <div class="bar-item">
        <div class="bar-info">
          <span class="bar-cat">${cat}</span>
          <span class="bar-val ${statusClass}">${valText}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${statusClass}" style="width: ${pct}%; background: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ── MINI CATEGORIES IN SIDEBAR ───────────────────────────
function renderMiniCats() {
  const container = document.getElementById('mini-cats');
  if (transactions.length === 0) {
    container.innerHTML = '<p class="ms-empty">No data yet</p>';
    return;
  }

  const map = {};
  transactions.forEach(t => {
    map[t.category] = map[t.category] || { total: 0, type: t.type };
    map[t.category].total += t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  container.innerHTML = sorted.map(([cat, data]) => `
    <div class="ms-row">
      <span class="ms-cat">${cat}</span>
      <span class="ms-val ${data.type}">${fmt(data.total)}</span>
    </div>
  `).join('');
}

// ── EXPORT TO CSV ─────────────────────────────────────────
function exportCSV() {
  if (transactions.length === 0) {
    showToast('⚠️ No transactions to export!');
    return;
  }

  const headers = ['ID', 'Type', 'Description', 'Amount', 'Category', 'Date', 'Currency'];
  const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = transactions.map(t => [
    t.id,
    t.type,
    csvEscape(t.desc),
    Number(t.amount).toFixed(2),
    csvEscape(t.category),
    t.date,
    selectedCurrency
  ]);

  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map(r => r.join(','))
  ].join('\\r\\n');

  const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const encodedUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', encodedUrl);
  link.setAttribute('download', `flowfund_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(encodedUrl);

  showToast('📥 CSV exported successfully');
}
function clearAll() {
  if (transactions.length === 0) { showToast('Nothing to clear!'); return; }
  if (!confirm('Clear ALL transactions? This action cannot be undone.')) return;
  transactions = [];
  saveStorage();
  renderAll();
  removeForm();
  showToast('🧹 Cleared all transactions');
}

// ── TOAST NOTIFICATION CONTROL ───────────────────────────
function showToast(msg, showUndo = false) {
  const toastEl = document.getElementById('toast');
  const toastText = document.getElementById('toast-message');
  const toastUndoBtn = document.getElementById('toast-undo');

  if (!toastText || !toastUndoBtn) return;

  toastText.textContent = msg;
  toastUndoBtn.classList.toggle('hidden', !showUndo);
  toastUndoBtn.onclick = showUndo ? undoDelete : null;

  toastEl.classList.add('show');
  clearTimeout(undoTimer);

  undoTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    lastDeletedTxn = null;
  }, 5000);
}

// ── UTILITIES ────────────────────────────────────────────
function fmt(n) {
  const curr = CURRENCIES[selectedCurrency] || CURRENCIES.INR;
  return curr.symbol + Math.abs(Number(n) || 0).toLocaleString(curr.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtSigned(n) {
  const value = Number(n) || 0;
  if (value < 0) return '−' + fmt(Math.abs(value));
  if (value > 0) return '+' + fmt(value);
  return fmt(0);
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtShort(n) {
  const curr = CURRENCIES[selectedCurrency] || CURRENCIES.INR;
  if (n >= 100000) return curr.symbol + (n / 1000).toFixed(0) + 'k';
  return curr.symbol + Math.round(n).toLocaleString(curr.locale);
}

function fmtDL(s) {
  const d = new Date(s + 'T12:00:00');
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];

  if (s === today) return 'Today';
  if (s === yesterday) return 'Yesterday';

  const curr = CURRENCIES[selectedCurrency] || CURRENCIES.INR;
  return d.toLocaleDateString(curr.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDS(s) {
  const d = new Date(s + 'T12:00:00');
  const curr = CURRENCIES[selectedCurrency] || CURRENCIES.INR;
  return d.toLocaleDateString(curr.locale, { day: 'numeric', month: 'short', year: '2-digit' });
}

function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}