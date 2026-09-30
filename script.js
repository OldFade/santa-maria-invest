const KEY = "sm-investments-v1";
const LOG_KEY = "sm-investments-log-v1";
const PRICE_DATE_KEY = "sm-investments-price-date-v1";
const today = () => new Date().toISOString().slice(0, 10);

// Всплывающая подсказка YouTube: автоматически появляется каждые 15 секунд
// и плавно исчезает через несколько секунд. Наведение мыши по-прежнему работает.
function initYoutubeTip(){
  const wrap = document.querySelector('.youtube-wrap');
  const tip = document.querySelector('.youtube-tip');
  if(!wrap || !tip) return;
  let timer = null;
  let hideTimer = null;
  const show = () => {
    clearTimeout(hideTimer);
    tip.classList.add('auto-visible');
    hideTimer = setTimeout(() => tip.classList.remove('auto-visible'), 4200);
  };
  // Не показываем сразу — первый показ через 15 секунд.
  timer = setInterval(show, 15000);
  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    clearTimeout(hideTimer);
  });
}

document.addEventListener('DOMContentLoaded', initYoutubeTip);
const makeId = () => (window.crypto && typeof window.crypto.randomUUID === "function")
  ? window.crypto.randomUUID()
  : "item-" + Date.now() + "-" + Math.random().toString(36).slice(2);

function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Не удалось прочитать журнал действий:", error);
    return [];
  }
}

let activityLog = loadLog();

function saveLog() {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(activityLog.slice(0, 500)));
  } catch (error) {
    console.error("Не удалось сохранить журнал действий:", error);
  }
}

function addLog(type, text, meta = {}) {
  const now = new Date();
  activityLog.unshift({ id: makeId(), type, text, date: today(), time: now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), timestamp: now.getTime(), ...meta });
  saveLog();
}

function normalizeItems(list) {
  if (!Array.isArray(list)) return [];
  return list.map(i => {
    const history = Array.isArray(i.history) ? i.history : [
      { date: i.date || today(), price: Number(i.buyPrice) || 0 },
      ...(Number(i.currentPrice) !== Number(i.buyPrice) ? [{ date: today(), price: Number(i.currentPrice) || 0 }] : [])
    ];
    const historyDates = history.map(h => h?.date).filter(Boolean).map(String).sort();
    return {
      ...i,
      id: i.id || makeId(),
      createdAt: Number(i.createdAt) || Date.now(),
      qty: Number(i.qty) || 1,
      buyPrice: Number(i.buyPrice) || 0,
      currentPrice: Number(i.currentPrice) || 0,
      history,
      priceUpdatedAt: i.priceUpdatedAt || historyDates[historyDates.length - 1] || i.date || today(),
      category: ["Недвижимость", "Транспорт", "Одежда", "Предметы", "Прочее"].includes(i.category) ? i.category : "Прочее",
      image: typeof i.image === "string" ? i.image : "",
      note: typeof i.note === "string" ? i.note : ""
    };
  });
}

function loadItems() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = JSON.parse(raw || "[]");
    return normalizeItems(parsed);
  } catch (error) {
    console.error("Не удалось прочитать сохранённые данные:", error);
    return [];
  }
}

let items = loadItems();
let sortState = { key: "date", dir: "desc" };
let chartState = { coords: [], points: [] };
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("ru-RU").format(Math.round(Number(n) || 0)) + " $";
const moneyCompact = n => new Intl.NumberFormat("ru-RU").format(Math.round(Number(n) || 0)) + "$";
const pct = n => (n >= 0 ? "+" : "") + Number(n || 0).toFixed(2) + "%";
const formatDate = value => {
  if (!value) return "—";
  const d = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("ru-RU");
};
function getPriceDate() {
  try { return localStorage.getItem(PRICE_DATE_KEY) || today(); } catch { return today(); }
}
function setPriceDate(date) {
  try { localStorage.setItem(PRICE_DATE_KEY, date || today()); } catch {}
}
function getLatestPriceUpdateDate() {
  if (!items.length) return null;
  const dates = items.map(i => {
    if (i.priceUpdatedAt) return String(i.priceUpdatedAt).slice(0, 10);
    const historyDates = (Array.isArray(i.history) ? i.history : []).map(h => h?.date).filter(Boolean).map(String).sort();
    return historyDates.length ? historyDates[historyDates.length - 1].slice(0, 10) : (i.date || null);
  }).filter(Boolean).sort();
  return dates[0] || null;
}

function daysSince(date) {
  if (!date) return Infinity;
  const start = new Date(String(date).slice(0, 10) + "T00:00:00");
  const now = new Date(today() + "T00:00:00");
  return Math.max(0, Math.floor((now - start) / 86400000));
}

function renderPriceFreshness() {
  const el = $("#priceFreshness");
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<span class="fresh-dot neutral"></span><span>Добавь предметы, чтобы отслеживать актуальность цен.</span>`;
    return;
  }
  const latest = getLatestPriceUpdateDate();
  const age = daysSince(latest);
  let state = "fresh", text = `Цены актуальны на <b>${esc(formatDate(latest))}</b>`;
  if (age > 7) {
    state = "stale";
    text = `<b>Срочно обновите цены</b>`;
  } else if (age > 0) {
    state = "warning";
    text = `<b>Рекомендуем обновить цены</b>`;
  }
  el.innerHTML = `<span class="fresh-dot ${state}"></span><span>${text}</span>`;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    render();
  } catch (error) {
    console.error(error);
    alert("Не удалось сохранить данные. Возможно, хранилище браузера переполнено. Попробуй использовать изображение меньшего размера.");
  }
}

function downloadBlob(content, filename, type = "application/octet-stream") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPortfolio() {
  const payload = {
    format: "smrp-portfolio",
    formatVersion: 1,
    appVersion: "25",
    savedAt: new Date().toISOString(),
    items,
    activityLog: activityLog.slice(0, 500),
    priceDate: getPriceDate()
  };
  const stamp = today();
  downloadBlob(JSON.stringify(payload), `santa-maria-portfolio-${stamp}.smrp`);
}

function normalizeLog(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(x => x && typeof x === "object").map(x => ({
    id: x.id || makeId(),
    type: x.type || "edit",
    text: String(x.text || ""),
    date: x.date || today(),
    time: x.time || "00:00:00",
    timestamp: Number(x.timestamp) || 0,
    ...x
  })).sort((a,b) => (Number(b.timestamp)||0) - (Number(a.timestamp)||0)).slice(0,500);
}

async function importPortfolioFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const payload = Array.isArray(parsed) ? { format: "smrp-portfolio", formatVersion: 0, items: parsed, activityLog: [] } : parsed;
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) throw new Error("Неверный формат файла.");
    if (payload.format && payload.format !== "smrp-portfolio") throw new Error("Это не файл портфеля Santa Maria.");
    const importedItems = normalizeItems(payload.items);
    const importedLog = normalizeLog(payload.activityLog);
    if (!confirm(`Загрузить портфель из файла?\n\nБудущие данные на этом устройстве будут заменены данными из файла.\nПредметов: ${importedItems.length}`)) return;
    items = importedItems;
    activityLog = importedLog;
    setPriceDate(payload.priceDate || (importedItems.length ? importedItems.map(i => String(i.priceUpdatedAt || i.date || today()).slice(0,10)).sort().at(-1) : today()));
    localStorage.setItem(KEY, JSON.stringify(items));
    saveLog();
    render();
    alert(`Портфель загружен. Предметов: ${items.length}.`);
  } catch (error) {
    console.error(error);
    alert("Не удалось загрузить файл. Проверь, что это корректный файл портфеля .smrp.");
  } finally {
    const input = $("#importFile");
    if (input) input.value = "";
  }
}

function profit(i) { return (Number(i.currentPrice) - Number(i.buyPrice)) * Number(i.qty); }
function invested(i) { return Number(i.buyPrice) * Number(i.qty); }
function current(i) { return Number(i.currentPrice) * Number(i.qty); }

function setCategory(value = "Прочее") {
  const safe = ["Недвижимость", "Транспорт", "Одежда", "Предметы", "Прочее"].includes(value) ? value : "Прочее";
  const input = $("#category");
  const wrap = $("#categorySelect");
  const label = $("#categoryValue");
  if (input) input.value = safe;
  if (wrap) wrap.dataset.value = safe;
  if (label) label.textContent = safe;
  document.querySelectorAll(".category-option").forEach(btn => {
    const active = btn.dataset.value === safe;
    btn.classList.toggle("selected", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function toggleCategoryMenu(force) {
  const wrap = $("#categorySelect");
  const trigger = $("#categoryTrigger");
  if (!wrap || !trigger) return;
  const open = typeof force === "boolean" ? force : !wrap.classList.contains("open");
  wrap.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

let calendarCursor = new Date();

function parseISODate(value) {
  if (!value) return new Date();
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPickerDate(value) {
  if (!value) return "Выберите дату";
  return parseISODate(value).toLocaleDateString("ru-RU");
}

function setDatePicker(value = today(), rerender = true) {
  const input = $("#date");
  const label = $("#dateValue");
  if (input) input.value = value || "";
  if (label) label.textContent = formatPickerDate(value);
  if (value) calendarCursor = parseISODate(value);
  if (rerender) renderCalendar();
}

function renderCalendar() {
  const grid = $("#dateGrid");
  const label = $("#dateMonthLabel");
  if (!grid || !label) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  label.textContent = calendarCursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/^./, c => c.toUpperCase());
  grid.innerHTML = "";

  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const selected = $("#date")?.value || "";
  const todayValue = today();

  for (let i = 0; i < 42; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "date-day";
    let dayNum, cellDate;
    if (i < start) {
      dayNum = prevDays - start + i + 1;
      cellDate = new Date(year, month - 1, dayNum);
      cell.classList.add("outside");
    } else if (i >= start + daysInMonth) {
      dayNum = i - start - daysInMonth + 1;
      cellDate = new Date(year, month + 1, dayNum);
      cell.classList.add("outside");
    } else {
      dayNum = i - start + 1;
      cellDate = new Date(year, month, dayNum);
    }
    const value = isoDate(cellDate);
    cell.textContent = dayNum;
    cell.dataset.date = value;
    if (value === selected) cell.classList.add("selected");
    if (value === todayValue) cell.classList.add("today");
    cell.onclick = () => {
      setDatePicker(value, false);
      toggleDateMenu(false);
    };
    grid.appendChild(cell);
  }
}

function toggleDateMenu(force) {
  const wrap = $("#dateSelect");
  const trigger = $("#dateTrigger");
  if (!wrap || !trigger) return;
  const open = typeof force === "boolean" ? force : !wrap.classList.contains("open");
  wrap.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) renderCalendar();
}

function openModal(item = null) {
  $("#modal").classList.remove("hidden");
  $("#modalTitle").textContent = item ? "Редактировать предмет" : "Добавить предмет";
  $("#itemId").value = item?.id || "";
  $("#name").value = item?.name || "";
  setCategory(item?.category || "Прочее");
  setDatePicker(item?.date || today());
  $("#qty").value = item?.qty || 1;
  $("#buyPrice").value = item?.buyPrice ?? "";
  $("#currentPrice").value = item?.currentPrice ?? "";
  $("#note").value = item?.note || "";
  $("#image").value = "";
  $("#imageLabel").textContent = item?.image ? "Выбрать другое изображение" : "Нажми, чтобы выбрать изображение";
}

function closeModal() { $("#modal").classList.add("hidden"); }

$("#addBtn").onclick = () => openModal();
$("#closeModal").onclick = closeModal;
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
$("#categoryTrigger").onclick = () => toggleCategoryMenu();
document.querySelectorAll(".category-option").forEach(btn => {
  btn.onclick = () => { setCategory(btn.dataset.value); toggleCategoryMenu(false); };
});
document.addEventListener("click", e => {
  const categoryWrap = $("#categorySelect");
  if (categoryWrap && !categoryWrap.contains(e.target)) toggleCategoryMenu(false);
  const dateWrap = $("#dateSelect");
  if (dateWrap && !dateWrap.contains(e.target)) toggleDateMenu(false);
});
$("#categoryTrigger").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCategoryMenu(true); }
  if (e.key === "Escape") toggleCategoryMenu(false);
});

$("#dateTrigger").onclick = () => toggleDateMenu();
$("#datePrev").onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); };
$("#dateNext").onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); };
$("#dateToday").onclick = () => { setDatePicker(today()); toggleDateMenu(false); };
$("#dateTrigger").addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDateMenu(); }
  if (e.key === "Escape") toggleDateMenu(false);
});

$("#image").addEventListener("change", e => {
  const file = e.target.files[0];
  $("#imageLabel").textContent = file ? file.name : "Нажми, чтобы выбрать изображение";
});

$("#itemForm").onsubmit = async e => {
  e.preventDefault();

  const id = $("#itemId").value;
  const existing = id ? items.find(i => i.id === id) : null;
  const file = $("#image").files[0];
  const image = file ? await fileToDataURL(file) : (existing?.image || "");
  const currentPrice = Number($("#currentPrice").value);
  const buyPrice = Number($("#buyPrice").value);
  const qty = Number($("#qty").value);

  const data = {
    name: $("#name").value.trim(),
    category: $("#category").value || "Прочее",
    date: $("#date").value,
    qty,
    buyPrice,
    currentPrice,
    note: $("#note").value.trim(),
    image
  };

  if (!data.name || !data.date || !Number.isFinite(qty) || qty < 1 || !Number.isFinite(buyPrice) || buyPrice < 0 || !Number.isFinite(currentPrice) || currentPrice < 0) {
    alert("Проверь заполнение формы.");
    return;
  }

  if (existing) {
    const oldPrice = Number(existing.currentPrice);
    const oldName = existing.name;
    Object.assign(existing, data);
    existing.history = Array.isArray(existing.history) ? existing.history : [];
    if (oldPrice !== data.currentPrice) {
      existing.history.push({ date: today(), price: data.currentPrice });
      existing.priceUpdatedAt = today();
      addLog("price", `Изменена цена «${data.name}»: ${money(oldPrice)} → ${money(data.currentPrice)}`, { itemId: existing.id, oldPrice, newPrice: data.currentPrice });
      setPriceDate(today());
    } else if (oldName !== data.name) {
      addLog("edit", `Изменён предмет «${oldName}» → «${data.name}»`, { itemId: existing.id });
    }
  } else {
    data.id = makeId();
    data.createdAt = Date.now();
    data.history = [
      { date: data.date, price: data.buyPrice },
      ...(data.currentPrice !== data.buyPrice ? [{ date: today(), price: data.currentPrice }] : [])
    ];
    data.priceUpdatedAt = today();
    items.push(data);
    addLog("buy", `Куплен предмет «${data.name}» за ${moneyCompact(data.buyPrice)} (${data.qty} шт.)`, { itemId: data.id, price: data.buyPrice, qty: data.qty });
    setPriceDate(today());
  }

  closeModal();
  save();
};

function tableRows(list, sortable = false) {
  if (!list.length) return `<div class="no-data">Пока нет предметов. Нажми «Добавить предмет».</div>`;

  const headers = [
    ["date", "Дата покупки"],
    ["name", "Название"],
    ["qty", "Количество"],
    ["invested", "Вложено"],
    ["current", "Текущая стоимость"],
    ["roi", "Доходность"],
    ["profit", "Потенциальная прибыль"],
    ["comment", "Комментарий"]
  ];

  const head = headers.map(([key, label]) => {
    if (!sortable) return `<th>${label}</th>`;
    const active = sortState.key === key;
    const arrow = active ? (sortState.dir === "asc" ? "↑" : "↓") : "↕";
    return `<th class="sortable-th ${active ? "active" : ""}" data-sort-key="${key}" tabindex="0" role="button" aria-label="Сортировать по ${label}">${label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join("");

  return `<table class="table"><thead><tr>${head}<th></th></tr></thead><tbody>${list.map(i => {
    const p = profit(i);
    const pc = invested(i) ? p / invested(i) * 100 : 0;
    return `<tr>
      <td class="date-cell">${esc(formatDate(i.date || ""))}</td>
      <td><div class="item-cell">${i.image ? `<img class="item-thumb" src="${i.image}" alt="">` : ""}<div><b>${esc(i.name)}</b></div></div></td>
      <td>${Number(i.qty) || 0}</td>
      <td>${money(invested(i))}</td>
      <td>${money(current(i))}</td>
      <td class="${pc >= 0 ? "green" : "red"}">${pct(pc)}</td>
      <td class="${p >= 0 ? "green" : "red"}">${p >= 0 ? "+" : ""}${money(p)}</td>
      <td class="comment-cell" title="${esc(i.note || "")}">${i.note ? esc(i.note) : "—"}</td>
      <td class="actions"><button class="icon-btn edit-btn" type="button" onclick="editItem('${i.id}')" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm12.4-12.4 3.5 3.5 1-1a1.7 1.7 0 0 0 0-2.4l-1.1-1.1a1.7 1.7 0 0 0-2.4 0l-1 1Z"/></svg></button><button class="icon-btn delete-btn" type="button" onclick="deleteItem('${i.id}')" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8v10m4-10v10m4-10v10M5 6h14m-9-3h4l1 3H9l1-3Zm-3 3 1 15h10l1-15"/></svg></button></td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

function compareItems(a, b, key) {
  switch (key) {
    case "date": return (Date.parse(a.date) || Number(a.createdAt) || 0) - (Date.parse(b.date) || Number(b.createdAt) || 0);
    case "name": return String(a.name || "").localeCompare(String(b.name || ""), "ru", { sensitivity: "base" });
    case "qty": return (Number(a.qty) || 0) - (Number(b.qty) || 0);
    case "invested": return invested(a) - invested(b);
    case "current": return current(a) - current(b);
    case "roi": {
      const ar = invested(a) ? profit(a) / invested(a) * 100 : 0;
      const br = invested(b) ? profit(b) / invested(b) * 100 : 0;
      return ar - br;
    }
    case "profit": return profit(a) - profit(b);
    default: return 0;
  }
}

function applySort(list) {
  return list.sort((a, b) => compareItems(a, b, sortState.key) * (sortState.dir === "asc" ? 1 : -1));
}

function toggleSort(key) {
  if (sortState.key === key) {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  } else {
    sortState.key = key;
    sortState.dir = key === "name" ? "asc" : "desc";
  }
  renderItems();
}

function render() {
  const inv = items.reduce((s, i) => s + invested(i), 0);
  const cur = items.reduce((s, i) => s + current(i), 0);
  const p = cur - inv;

  $("#invested").textContent = money(inv);
  $("#current").textContent = money(cur);
  const profitPercent = inv ? pct(p / inv * 100) : "0%";
  $("#profit").innerHTML = (p >= 0 ? "+" : "") + money(p).replace(/\s+\$/,'$') + ` <small id="profitPct">(${profitPercent})</small>`;
  $("#profit").className = p >= 0 ? "green" : "red";
  $("#count").textContent = items.reduce((s, i) => s + Number(i.qty), 0);
  renderPriceFreshness();

  $("#dashboardTable").innerHTML = tableRows(items.slice().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).slice(0, 8));

  const top = items.slice().sort((a, b) => profit(b) / Math.max(invested(b), 1) - profit(a) / Math.max(invested(a), 1)).slice(0, 5);
  $("#topItems").innerHTML = top.length
    ? top.map(i => {
        const pc = profit(i) / Math.max(invested(i), 1) * 100;
        return `<div class="item-row"><div><div class="item-name">${esc(i.name)}</div><div class="item-sub">${money(current(i))}</div></div><b class="${pc >= 0 ? "green" : "red"}">${pct(pc)}</b></div>`;
      }).join("")
    : `<div class="no-data">Нет данных</div>`;

  drawChart();
  renderItems();
  renderHistory();
}

function renderItems() {
  let list = items.slice();
  const q = ($( "#search")?.value || "").toLowerCase().trim();
  const dateFilter = $("#dateFilter")?.value || "all";
  const categoryFilter = $("#categoryFilter")?.value || "all";
  list = list.filter(i => String(i.name || "").toLowerCase().includes(q));
  if (categoryFilter !== "all") list = list.filter(i => (i.category || "Прочее") === categoryFilter);
  if (dateFilter !== "all") {
    const now = new Date(); now.setHours(0,0,0,0);
    list = list.filter(i => {
      const d = new Date(i.date || i.createdAt || now); d.setHours(0,0,0,0);
      const diff = Math.floor((now - d) / 86400000);
      if (dateFilter === "today") return diff === 0;
      if (dateFilter === "7") return diff >= 0 && diff <= 7;
      if (dateFilter === "30") return diff >= 0 && diff <= 30;
      if (dateFilter === "older") return diff > 30;
      return true;
    });
  }
  applySort(list);
  $("#itemsTable").innerHTML = tableRows(list, true);
}

function renderHistory() {
  const logRows = activityLog.slice().sort((a,b) => {
    const ta = Number(a.timestamp) || new Date(`${a.date}T${a.time || "00:00:00"}`).getTime() || 0;
    const tb = Number(b.timestamp) || new Date(`${b.date}T${b.time || "00:00:00"}`).getTime() || 0;
    return tb - ta;
  });
  const logHtml = logRows.length
    ? `<div class="activity-list">${logRows.map(log => {
        const cls = log.type === "buy" ? "activity-buy" : log.type === "delete" ? "activity-delete" : log.type === "price" ? "activity-price" : "activity-edit";
        const icon = log.type === "buy" ? "＋" : log.type === "delete" ? "×" : log.type === "price" ? "↗" : "✎";
        return `<div class="activity-item"><span class="activity-icon ${cls}">${icon}</span><div class="activity-main"><b>${esc(log.text)}</b><small>${esc(formatDate(log.date))} · ${esc(log.time)}</small></div></div>`;
      }).join("")}</div>`
    : `<div class="no-data">Журнал действий пока пуст.</div>`;

  $("#historyTable").innerHTML = logHtml;
}

function editItem(id) { openModal(items.find(i => i.id === id)); }

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function deleteItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (confirm(`Удалить «${item.name}»?`)) {
    items = items.filter(i => i.id !== id);
    addLog("delete", `Удалён предмет «${item.name}»`, { itemId: id });
    save();
  }
}


function openPriceUpdateModal() {
  const dateInput = $("#priceUpdateDate");
  dateInput.value = today();
  const wrap = $("#bulkPrices");
  if (!items.length) {
    wrap.innerHTML = `<div class="no-data">Сначала добавь хотя бы один предмет.</div>`;
  } else {
    wrap.innerHTML = items.slice().sort((a,b) => String(a.name).localeCompare(String(b.name), "ru")).map(i => `
      <div class="bulk-row">
        <div class="bulk-name">${i.image ? `<img class="item-thumb" src="${i.image}" alt="">` : ""}<div><b>${esc(i.name)}</b><small>Сейчас: ${money(i.currentPrice)} · ${i.qty} шт.</small></div></div>
        <input class="bulk-price" data-id="${i.id}" type="number" min="0" step="1" value="${Number(i.currentPrice) || 0}" aria-label="Новая цена для ${esc(i.name)}">
      </div>`).join("");
  }
  $("#priceUpdateModal").classList.remove("hidden");
}

function closePriceUpdateModal() { $("#priceUpdateModal").classList.add("hidden"); }

$("#updatePricesBtn").onclick = openPriceUpdateModal;
$("#closePriceUpdateModal").onclick = closePriceUpdateModal;
$("#priceUpdateModal").addEventListener("click", e => { if (e.target.id === "priceUpdateModal") closePriceUpdateModal(); });

$("#bulkPriceForm").onsubmit = e => {
  e.preventDefault();
  if (!items.length) return;
  const date = $("#priceUpdateDate").value || today();
  let changed = 0;
  document.querySelectorAll(".bulk-price").forEach(input => {
    const item = items.find(i => i.id === input.dataset.id);
    const next = Number(input.value);
    if (!item || !Number.isFinite(next) || next < 0 || next === Number(item.currentPrice)) return;
    const old = Number(item.currentPrice);
    item.currentPrice = next;
    item.priceUpdatedAt = date;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ date, price: next });
    addLog("price", `Обновлена цена «${item.name}»: ${money(old)} → ${money(next)}`, { itemId: item.id, oldPrice: old, newPrice: next, date });
    changed++;
  });
  if (changed) setPriceDate(date);
  closePriceUpdateModal();
  if (changed) save();
  else render();
  if (changed) alert(`Цены обновлены: ${changed} ${changed === 1 ? "предмет" : changed < 5 ? "предмета" : "предметов"}.`);
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function drawChart(hoverIndex = -1) {
  const c = $("#chart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(c.parentElement?.clientWidth || c.clientWidth || 600, 320);
  const h = 300;
  c.style.width = "100%";
  c.style.height = h + "px";
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const dateSet = new Set();
  items.forEach(i => {
    if (i.date) dateSet.add(i.date);
    (Array.isArray(i.history) ? i.history : []).forEach(hh => { if (hh.date) dateSet.add(hh.date); });
  });
  const dates = [...dateSet].sort();
  const points = [];

  dates.forEach(date => {
    let total = 0;
    let investedAtDate = 0;
    let hasItem = false;
    items.forEach(i => {
      if (!i.date || i.date > date) return;
      hasItem = true;
      investedAtDate += invested(i);
      const history = Array.isArray(i.history) ? i.history.slice() : [];
      history.push({ date: i.date, price: Number(i.buyPrice) || 0 });
      history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      let price = Number(i.buyPrice) || 0;
      history.forEach(hh => {
        if (String(hh.date) <= String(date) && Number.isFinite(Number(hh.price))) price = Number(hh.price);
      });
      total += price * (Number(i.qty) || 1);
    });
    if (hasItem) points.push({ date, value: total, invested: investedAtDate, pnl: total - investedAtDate });
  });

  const clean = [];
  points.forEach(point => {
    const last = clean[clean.length - 1];
    if (!last || last.value !== point.value || last.date !== point.date || last.pnl !== point.pnl) clean.push(point);
  });

  chartState = { coords: [], points: clean };
  if (clean.length < 2) {
    $("#emptyChart").style.display = "block";
    c.style.display = "none";
    hideChartTooltip();
    return;
  }
  $("#emptyChart").style.display = "none";
  c.style.display = "block";

  const vals = clean.map(p => p.value);
  const minValue = Math.min(...vals);
  const maxValue = Math.max(...vals);
  const range = Math.max(maxValue - minValue, Math.abs(maxValue) * 0.08, 1);
  const min = Math.max(0, minValue - range * 0.12);
  const max = maxValue + range * 0.12;
  const chartRange = Math.max(max - min, 1);
  const left = 12, right = 16, top = 18, bottom = 40;

  ctx.strokeStyle = "rgba(150,165,180,.12)";
  ctx.lineWidth = 1;
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#687384";
  for (let j = 0; j < 4; j++) {
    const y = top + j * (h - top - bottom) / 3;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
    const value = max - j * (max - min) / 3;
    const label = value >= 1000000 ? (value / 1000000).toFixed(1).replace(".0", "") + "M" : value >= 1000 ? Math.round(value / 1000) + "K" : Math.round(value).toString();
    ctx.fillText(label, left + 4, y - 5);
  }

  const coords = clean.map((p, index) => ({
    x: clean.length === 1 ? w / 2 : left + index * (w - left - right) / (clean.length - 1),
    y: top + (1 - (p.value - min) / chartRange) * (h - top - bottom),
    ...p
  }));
  chartState.coords = coords;

  const gradient = ctx.createLinearGradient(0, top, 0, h - bottom);
  gradient.addColorStop(0, "rgba(186,255,57,.26)");
  gradient.addColorStop(1, "rgba(186,255,57,0)");
  ctx.beginPath();
  coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.lineTo(coords[coords.length - 1].x, h - bottom); ctx.lineTo(coords[0].x, h - bottom); ctx.closePath();
  ctx.fillStyle = gradient; ctx.fill();

  ctx.strokeStyle = "#baff39"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();

  coords.forEach((p, index) => {
    const hovered = index === hoverIndex;
    ctx.beginPath(); ctx.fillStyle = hovered ? "#ffffff" : "#baff39"; ctx.arc(p.x, p.y, hovered ? 5.5 : 3.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = "#0b0f12"; ctx.arc(p.x, p.y, hovered ? 2.2 : 1.5, 0, Math.PI * 2); ctx.fill();
  });

  const labelIndexes = [...new Set([0, Math.floor((coords.length - 1) / 2), coords.length - 1])];
  ctx.fillStyle = "#697587"; ctx.font = "10px Inter, system-ui, sans-serif";
  labelIndexes.forEach(index => {
    const p = coords[index];
    const label = p.date.split("-").reverse().slice(0, 2).join(".");
    ctx.textAlign = index === 0 ? "left" : index === coords.length - 1 ? "right" : "center";
    ctx.fillText(label, p.x, h - 12);
  });
  ctx.textAlign = "left";
}

function hideChartTooltip() {
  const tip = $("#chartTooltip");
  if (tip) tip.classList.add("hidden");
}

function showChartTooltip(index) {
  const tip = $("#chartTooltip");
  const c = $("#chart");
  const point = chartState.coords[index];
  if (!tip || !c || !point) return;
  const pnl = Number(point.pnl) || 0;
  const label = pnl >= 0 ? "Прибыль" : "Убыток";
  const cls = pnl >= 0 ? "profit" : "loss";
  tip.innerHTML = `<b>${esc(formatDate(point.date))}</b><span>Стоимость портфеля: <strong>${money(point.value)}</strong></span><span>Вложено: <strong>${money(point.invested)}</strong></span><span class="${cls}">${label}: <strong>${pnl >= 0 ? "+" : ""}${money(pnl)}</strong></span>`;
  const panel = c.parentElement;
  const panelRect = panel.getBoundingClientRect();
  const canvasRect = c.getBoundingClientRect();
  const x = canvasRect.left - panelRect.left + point.x;
  const y = canvasRect.top - panelRect.top + point.y;
  tip.classList.remove("hidden");
  const tw = tip.offsetWidth || 210;
  const th = tip.offsetHeight || 100;
  tip.style.left = Math.max(10, Math.min(x - tw / 2, panel.clientWidth - tw - 10)) + "px";
  tip.style.top = Math.max(10, y - th - 14) + "px";
}

$("#chart").addEventListener("mousemove", e => {
  if (!chartState.coords.length) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  let best = -1, dist = Infinity;
  chartState.coords.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < dist) { dist = d; best = i; } });
  const threshold = Math.max(16, (rect.width / Math.max(chartState.coords.length - 1, 1)) * 0.45);
  if (dist <= threshold) { drawChart(best); showChartTooltip(best); } else { hideChartTooltip(); drawChart(-1); }
});
$("#chart").addEventListener("mouseleave", () => { hideChartTooltip(); drawChart(-1); });

document.querySelectorAll(".nav,.ghost").forEach(b => b.onclick = () => showView(b.dataset.view));

function showView(v) {
  document.querySelectorAll(".view").forEach(x => x.classList.add("hidden"));
  const view = $("#" + v + "View");
  if (!view) return;
  view.classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x => x.classList.toggle("active", x.dataset.view === v));
  const addBtn = $("#addBtn");
  if (addBtn) addBtn.classList.toggle("hidden-action", v === "history");
  const subtitle = $("#pageSubtitle");
  if (subtitle) {
    subtitle.textContent = v === "dashboard"
      ? "Следи за стоимостью своих предметов и потенциальной прибылью."
      : v === "items"
        ? "Управляй всеми купленными предметами."
        : "Все изменения цен, сохранённые системой.";
  }
}

$("#itemsTable").addEventListener("click", e => {
  const th = e.target.closest(".sortable-th");
  if (!th) return;
  toggleSort(th.dataset.sortKey);
});
$("#itemsTable").addEventListener("keydown", e => {
  const th = e.target.closest(".sortable-th");
  if (!th || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  toggleSort(th.dataset.sortKey);
});

$("#search").oninput = renderItems;
$("#dateFilter").onchange = renderItems;
$("#categoryFilter").onchange = renderItems;

function setupFilterDropdown(wrapId, triggerId, menuId, selectId, valueId) {
  const wrap = $("#" + wrapId);
  const trigger = $("#" + triggerId);
  const menu = $("#" + menuId);
  const select = $("#" + selectId);
  const value = $("#" + valueId);
  if (!wrap || !trigger || !menu || !select || !value) return;

  const close = () => {
    wrap.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    document.querySelectorAll(".filter-select.open").forEach(el => {
      if (el !== wrap) {
        el.classList.remove("open");
        el.querySelector(".filter-trigger")?.setAttribute("aria-expanded", "false");
      }
    });
    wrap.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  };
  const sync = () => {
    const option = select.options[select.selectedIndex];
    value.textContent = option ? option.textContent : "";
    menu.querySelectorAll(".filter-option").forEach(btn => {
      const active = btn.dataset.filterValue === select.value;
      btn.classList.toggle("selected", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  };

  trigger.onclick = () => wrap.classList.contains("open") ? close() : open();
  trigger.addEventListener("keydown", e => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });
  menu.querySelectorAll(".filter-option").forEach(btn => {
    btn.onclick = () => {
      select.value = btn.dataset.filterValue;
      select.dispatchEvent(new Event("change", {bubbles:true}));
      sync();
      close();
    };
  });
  select.addEventListener("change", sync);
  sync();
}

setupFilterDropdown("dateFilterWrap", "dateFilterTrigger", "dateFilterMenu", "dateFilter", "dateFilterValue");
setupFilterDropdown("categoryFilterWrap", "categoryFilterTrigger", "categoryFilterMenu", "categoryFilter", "categoryFilterValue");

window.onresize = drawChart;

const exportBtn = $("#exportBtn");
const importBtn = $("#importBtn");
const importFile = $("#importFile");
if (exportBtn) exportBtn.onclick = exportPortfolio;
if (importBtn) importBtn.onclick = () => importFile?.click();
if (importFile) importFile.addEventListener("change", e => importPortfolioFile(e.target.files?.[0]));

render();
