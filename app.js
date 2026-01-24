
const APP_CONFIG = {
  COMPANY_NAME: "RS Home Care",
  DEFAULT_USERNAME: "RShomecare",
  DEFAULT_PASSWORD: "RS@Home",
  DEFAULT_ADMIN_6_DIGIT_CODE: "141614",
  VERSION: "RS v1.1.0"
};

const STORE_KEY    = "rshomecare_data_v1";
const THEME_KEY    = "rshomecare_theme_v1";
const AUTH_KEY     = "rshomecare_auth_v1";
const CREDS_KEY    = "rshomecare_creds_v2";        // hashed credentials
const ATTEMPTS_KEY = "rshomecare_attempt_logs_v1"; // wrong login logs
const DASH_FILTER_KEY = "rshomecare_dash_filter_v1";

const $  = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

const money = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const todayISO = () => new Date().toISOString().slice(0,10);

function calcAge(dobISO){
  if(!dobISO) return "";
  const dob = new Date(dobISO);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age < 0 ? "" : age;
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ===========================
   Storage
   =========================== */
function loadStore(){
  const raw = localStorage.getItem(STORE_KEY);
  if(raw){
    try { return JSON.parse(raw); } catch(e){}
  }
  return { clients: [], employees: [], workers: [], salary: [], expense: [] };
}
function saveStore(db){
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

function setTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
function toggleTheme(){
  const cur = localStorage.getItem(THEME_KEY) || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
}

function isAuthed(){ return localStorage.getItem(AUTH_KEY) === "1"; }
function setAuthed(v){ localStorage.setItem(AUTH_KEY, v ? "1" : "0"); }

/** Convert file input to base64 dataURL */
function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function downloadDataURL(dataUrl, filename){
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadTextAsFile(text, filename){
  const blob = new Blob([text], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

/* ===========================
   Security (Hash creds)
   =========================== */
async function sha256Hex(str){
  const enc = new TextEncoder().encode(String(str));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function ensureCredsInitialized(){
  const raw = localStorage.getItem(CREDS_KEY);
  if(raw) return;

  // Initialize with defaults (hashed)
  const username = APP_CONFIG.DEFAULT_USERNAME;
  const passHash = await sha256Hex(APP_CONFIG.DEFAULT_PASSWORD);
  const codeHash = await sha256Hex(APP_CONFIG.DEFAULT_ADMIN_6_DIGIT_CODE);

  const creds = {
    username,
    passHash,
    codeHash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
}

function getCreds(){
  const raw = localStorage.getItem(CREDS_KEY);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}

async function verifyLogin(username, password, code){
  const creds = getCreds();
  if(!creds) return { ok:false, reason:"Credentials not initialized" };

  const uOk = String(username||"").trim() === String(creds.username||"");
  const pHash = await sha256Hex(String(password||"").trim());
  const cHash = await sha256Hex(String(code||"").trim());

  const pOk = pHash === creds.passHash;
  const cOk = cHash === creds.codeHash;

  if(uOk && pOk && cOk) return { ok:true };

  let reason = "Wrong credentials.";
  if(!uOk) reason = "Wrong username.";
  else if(!pOk) reason = "Wrong password.";
  else if(!cOk) reason = "Wrong 6-digit admin code.";

  return { ok:false, reason };
}

async function updateCredsAdminOnly({currentPassword, currentCode, newUsername, newPassword, newCode}){
  const creds = getCreds();
  if(!creds) return { ok:false, msg:"No credentials found." };

  const pHash = await sha256Hex(String(currentPassword||"").trim());
  const cHash = await sha256Hex(String(currentCode||"").trim());

  if(pHash !== creds.passHash || cHash !== creds.codeHash){
    return { ok:false, msg:"Current password or admin code is incorrect." };
  }

  // validations
  if(newUsername && String(newUsername).trim().length < 3){
    return { ok:false, msg:"Username must be at least 3 characters." };
  }
  if(newPassword && String(newPassword).trim().length < 4){
    return { ok:false, msg:"Password must be at least 4 characters." };
  }
  if(newCode && !/^\d{6}$/.test(String(newCode).trim())){
    return { ok:false, msg:"Admin code must be exactly 6 digits." };
  }

  const next = {...creds};

  if(newUsername) next.username = String(newUsername).trim();
  if(newPassword) next.passHash = await sha256Hex(String(newPassword).trim());
  if(newCode) next.codeHash = await sha256Hex(String(newCode).trim());

  next.updatedAt = new Date().toISOString();

  localStorage.setItem(CREDS_KEY, JSON.stringify(next));
  return { ok:true, msg:"Credentials updated successfully." };
}

/* ===========================
   Login attempt logs
   =========================== */
function loadAttemptLogs(){
  const raw = localStorage.getItem(ATTEMPTS_KEY);
  if(!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch(e){
    return [];
  }
}

function saveAttemptLogs(logs){
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(logs));
}

function addAttemptLog({enteredUsername, reason}){
  const logs = loadAttemptLogs();
  const attemptNo = logs.length + 1;
  logs.unshift({
    attemptNo,
    time: new Date().toISOString(),
    enteredUsername: String(enteredUsername||"").trim(),
    reason: String(reason||"")
  });
  saveAttemptLogs(logs.slice(0, 200)); // keep last 200
}

function renderAttemptLogs(){
  const box = $("#attemptLogsBox");
  if(!box) return;

  const logs = loadAttemptLogs();
  box.innerHTML = "";

  if(logs.length === 0){
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `<div class="listItemTop">
        <div class="listItemName">No failed login attempts</div>
      </div>
      <div class="listItemMeta muted">You're safe.</div>`;
    box.appendChild(div);
    return;
  }

  for(const l of logs){
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTop">
        <div class="listItemName">Attempt #${escapeHtml(String(l.attemptNo))} — ${escapeHtml(l.reason)}</div>
        <div class="muted">${escapeHtml(new Date(l.time).toLocaleString())}</div>
      </div>
      <div class="listItemMeta muted">Username entered: ${escapeHtml(l.enteredUsername || "(blank)")}</div>
    `;
    box.appendChild(div);
  }
}

/* ===========================
   Derived income/expense
   =========================== */
function buildIncomeList(db){
  const income = [];
  for(const c of db.clients){
    const amt = Number(c.amountPaid || 0);
    if(amt > 0){
      income.push({
        id: "inc_" + c.id,
        source: "Client Payment",
        name: c.clientName || "",
        amount: amt,
        date: c.entryDate || "",
        invoice: c.invoiceNumber || ""
      });
    }
  }
  income.sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  return income;
}

function buildExpenseList(db){
  const out = [];
  for(const s of db.salary){
    const amt = Number(s.salaryAmount || 0);
    if(amt > 0){
      out.push({
        id: "sal_" + s.id,
        name: `Salary: ${s.employeeName || ""}`,
        amount: amt,
        forWhat: `Slip: ${s.salarySlipNumber || ""}`,
        date: s.paidDate || "",
        method: s.paidOption || ""
      });
    }
  }
  for(const e of db.expense){
    out.push({
      id: "exp_" + e.id,
      name: e.name || "",
      amount: Number(e.amount || 0),
      forWhat: e.forWhat || "",
      date: e.date || "",
      method: e.paymentMethod || ""
    });
  }
  out.sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  return out;
}

function sumByMonth(items, dateKey, amountKey){
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let total = 0;
  for(const it of items){
    const d = it[dateKey] ? new Date(it[dateKey]) : null;
    if(!d || isNaN(d)) continue;
    if(d.getFullYear() === y && d.getMonth() === m){
      total += Number(it[amountKey] || 0);
    }
  }
  return total;
}
function sumByYear(items, dateKey, amountKey){
  const y = new Date().getFullYear();
  let total = 0;
  for(const it of items){
    const d = it[dateKey] ? new Date(it[dateKey]) : null;
    if(!d || isNaN(d)) continue;
    if(d.getFullYear() === y){
      total += Number(it[amountKey] || 0);
    }
  }
  return total;
}

function filterByMonthYear(items, dateKey, month, year){
  return items.filter(it => {
    const v = it[dateKey];
    if(!v) return false;
    const d = new Date(v);
    if(isNaN(d)) return false;
    if(year !== "" && d.getFullYear() !== Number(year)) return false;
    if(month !== "" && d.getMonth() !== Number(month)) return false;
    return true;
  });
}

/* ===========================
   UI helpers
   =========================== */
function showPage(name){
  $$(".page").forEach(p => p.classList.add("hidden"));
  $(`#page-${name}`)?.classList.remove("hidden");

  $$(".navItem").forEach(b => b.classList.remove("active"));
  $(`.navItem[data-page="${name}"]`)?.classList.add("active");

  // refresh logs when opening settings
  if(name === "settings"){
    renderAttemptLogs();
    setVersionLabels();
  }
}

/* Basic validation helpers */
function isDigits(s){ return /^\d+$/.test(String(s||"")); }
function isDecimal(s){ return /^-?\d+(\.\d+)?$/.test(String(s||"").trim()); }

function validateRecord(fields, values){
  // phone validation (if present)
  const phoneKeys = ["clientPhone","phone","responsiblePersonPhone"];
  for(const k of phoneKeys){
    if(values[k] && String(values[k]).trim()){
      const v = String(values[k]).trim();
      if(!isDigits(v) || v.length < 8){
        return `Invalid phone number in ${k}.`;
      }
    }
  }

  // aadhar validation (if present)
  if(values.aadhar && String(values.aadhar).trim()){
    const v = String(values.aadhar).trim();
    if(!isDigits(v) || v.length !== 12){
      return "Aadhar number must be 12 digits.";
    }
  }

  // amounts
  const amountKeys = ["amountPaid","balanceAmount","salaryAllocated","salaryAmount","amount"];
  for(const k of amountKeys){
    if(values[k] && String(values[k]).trim()){
      const v = String(values[k]).trim();
      if(!isDecimal(v)){
        return `Invalid amount in ${k}.`;
      }
      if(Number(v) < 0){
        return `Amount cannot be negative in ${k}.`;
      }
    }
  }

  // admin code length if entered (modal)
  const codeField = fields.find(x => x.isAdminCode === true);
  if(codeField){
    const codeVal = String(values[codeField.key] || "").trim();
    if(!/^\d{6}$/.test(codeVal)){
      return "Admin code must be exactly 6 digits.";
    }
  }

  return "";
}

function openModal(title, fields, initialValues, onSave){
  $("#modalTitle").textContent = title;
  $("#modalMsg").textContent = "";

  const form = $("#modalForm");
  form.innerHTML = "";

  for(const f of fields){
    const wrap = document.createElement("label");
    wrap.className = f.className || "";
    wrap.textContent = f.label;

    let el;
    if(f.type === "select"){
      el = document.createElement("select");
      for(const opt of f.options){
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        el.appendChild(o);
      }
    } else if(f.type === "textarea"){
      el = document.createElement("textarea");
      el.rows = f.rows || 3;
    } else if(f.type === "file"){
      el = document.createElement("input");
      el.type = "file";
      el.accept = f.accept || "image/*";
    } else {
      el = document.createElement("input");
      el.type = f.type || "text";
      if(f.maxlength) el.maxLength = f.maxlength;
      if(f.inputmode) el.inputMode = f.inputmode;
      if(f.placeholder) el.placeholder = f.placeholder;
    }

    el.id = f.key;
    el.name = f.key;

    if(f.type !== "file" && initialValues && initialValues[f.key] != null){
      el.value = initialValues[f.key];
    }
    wrap.appendChild(el);

    if(f.help){
      const sm = document.createElement("small");
      sm.className = "muted";
      sm.textContent = f.help;
      wrap.appendChild(sm);
    }

    form.appendChild(wrap);

    // Other field support
    if(f.otherKey){
      const otherLabel = document.createElement("label");
      otherLabel.className = "hidden " + (f.otherClassName || "");
      otherLabel.id = `${f.otherKey}__wrap`;
      otherLabel.textContent = f.otherLabel || "Other";

      const otherInput = document.createElement("input");
      otherInput.type = "text";
      otherInput.id = f.otherKey;
      otherInput.name = f.otherKey;
      otherInput.placeholder = "Type here...";
      if(initialValues && initialValues[f.otherKey]) otherInput.value = initialValues[f.otherKey];

      otherLabel.appendChild(otherInput);
      form.appendChild(otherLabel);

      const toggleOther = () => {
        if(el.value === "other"){
          otherLabel.classList.remove("hidden");
        } else {
          otherLabel.classList.add("hidden");
          otherInput.value = "";
        }
      };
      el.addEventListener("change", toggleOther);
      toggleOther();
    }

    // Auto age
    if(f.autoAgeTarget){
      const dobEl = el;
      const ageElId = f.autoAgeTarget;
      const updateAge = () => {
        const ageEl = document.getElementById(ageElId);
        if(ageEl) ageEl.value = String(calcAge(dobEl.value) || "");
      };
      dobEl.addEventListener("change", updateAge);
      setTimeout(updateAge, 0);
    }
  }

  $("#modal").classList.remove("hidden");

  const close = () => $("#modal").classList.add("hidden");
  $("#modalClose").onclick = close;
  $("#modalCancel").onclick = (e) => { e.preventDefault(); close(); };

  form.onsubmit = async (e) => {
    e.preventDefault();

    const values = { ...(initialValues || {}) };

    for(const f of fields){
      const el = document.getElementById(f.key);
      if(!el) continue;

      if(f.type === "file"){
        const file = el.files && el.files[0];
        if(file){
          values[f.key] = await fileToDataURL(file);
          values[`${f.key}__name`] = file.name;
        } else {
          values[f.key] = values[f.key] || "";
          values[`${f.key}__name`] = values[`${f.key}__name`] || "";
        }
      } else {
        values[f.key] = el.value;
      }

      if(f.otherKey){
        const otherEl = document.getElementById(f.otherKey);
        values[f.otherKey] = otherEl ? otherEl.value : "";
      }
    }

    // validation
    const err = validateRecord(fields, values);
    if(err){
      $("#modalMsg").textContent = err;
      return;
    }

    // admin code check (hashed)
    const codeField = fields.find(x => x.isAdminCode === true);
    if(codeField){
      const codeVal = String(values[codeField.key] || "").trim();
      const creds = getCreds();
      const hash = await sha256Hex(codeVal);
            if(!creds || hash !== creds.codeHash){
        $("#modalMsg").textContent = "Invalid admin code.";
        return;
      }
    }

    try{
      await onSave(values);
      close();
    }catch(err){
      $("#modalMsg").textContent = String(err?.message || err || "Failed to save.");
    }
  };
}

/* ===========================
   Rendering helpers (tables/lists)
   =========================== */
function setVersionLabels(){
  $("#loginVersion") && ($("#loginVersion").textContent = APP_CONFIG.VERSION);
  $("#footerVersion") && ($("#footerVersion").textContent = APP_CONFIG.VERSION);
  $("#settingsVersionLabel") && ($("#settingsVersionLabel").textContent = APP_CONFIG.VERSION);
}

function setYears(){
  const y = String(new Date().getFullYear());
  $("#yearNow") && ($("#yearNow").textContent = y);
  $("#footerYear") && ($("#footerYear").textContent = y);
}

function setLoginMsg(text, ok=false){
  const el = $("#loginMsg");
  if(!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("bad", !ok && !!text);
}

function renderClients(db){
  const tb = $("#clientsTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  for(const c of db.clients){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.clientName)}</td>
      <td>${escapeHtml(c.clientPhone)}</td>
      <td>${escapeHtml(c.dob)}</td>
      <td>${escapeHtml(c.age)}</td>
      <td class="money">${escapeHtml(money(c.amountPaid))}</td>
      <td class="money">${escapeHtml(money(c.balanceAmount))}</td>
      <td>${escapeHtml(c.invoiceNumber)}</td>
      <td>${escapeHtml(c.entryDate)}</td>
      <td>${escapeHtml(c.workerName)}</td>
      <td class="actions">
        <button class="btn sm" data-act="edit" data-id="${escapeHtml(c.id)}">Edit</button>
        <button class="btn sm danger" data-act="del" data-id="${escapeHtml(c.id)}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

function renderEmployees(db){
  const tb = $("#employeesTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  for(const e of db.employees){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.accessNo)}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.phone)}</td>
      <td>${escapeHtml(e.dob)}</td>
      <td>${escapeHtml(e.age)}</td>
      <td>${escapeHtml(e.role)}</td>
      <td class="money">${escapeHtml(money(e.salaryAllocated))}</td>
      <td class="actions">
        <button class="btn sm" data-act="edit" data-id="${escapeHtml(e.id)}">Edit</button>
        <button class="btn sm danger" data-act="del" data-id="${escapeHtml(e.id)}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

function renderWorkers(db){
  const tb = $("#workersTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  for(const w of db.workers){
    const aadharBtn = w.aadharImage
      ? `<button class="btn sm" data-act="dlAadhar" data-id="${escapeHtml(w.id)}">Download</button>`
      : `<span class="muted">No file</span>`;

    const photoBtn = w.workerPhoto
      ? `<button class="btn sm" data-act="dlPhoto" data-id="${escapeHtml(w.id)}">Download</button>`
      : `<span class="muted">No file</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(w.name)}</td>
      <td>${escapeHtml(w.phone)}</td>
      <td>${escapeHtml(w.dob)}</td>
      <td>${escapeHtml(w.age)}</td>
      <td>
        <div class="row" style="gap:6px; flex-wrap:wrap;">
          ${aadharBtn}
          ${photoBtn}
        </div>
      </td>
      <td>${escapeHtml(w.specialist)}</td>
      <td class="actions">
        <button class="btn sm" data-act="edit" data-id="${escapeHtml(w.id)}">Edit</button>
        <button class="btn sm danger" data-act="del" data-id="${escapeHtml(w.id)}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

function renderSalary(db){
  const tb = $("#salaryTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  for(const s of db.salary){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.accessNo)}</td>
      <td>${escapeHtml(s.employeeName)}</td>
      <td>${escapeHtml(s.salarySlipNumber)}</td>
      <td class="money">${escapeHtml(money(s.salaryAmount))}</td>
      <td>${escapeHtml(s.paidDate)}</td>
      <td>${escapeHtml(s.paidOption)}</td>
      <td class="actions">
        <button class="btn sm" data-act="edit" data-id="${escapeHtml(s.id)}">Edit</button>
        <button class="btn sm danger" data-act="del" data-id="${escapeHtml(s.id)}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

function renderExpense(db){
  const tb = $("#expenseTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  for(const e of db.expense){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.name)}</td>
      <td class="money">${escapeHtml(money(e.amount))}</td>
      <td>${escapeHtml(e.forWhat)}</td>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.paymentMethod)}</td>
      <td class="actions">
        <button class="btn sm" data-act="edit" data-id="${escapeHtml(e.id)}">Edit</button>
        <button class="btn sm danger" data-act="del" data-id="${escapeHtml(e.id)}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

function renderIncome(db){
  const tb = $("#incomeTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  const income = buildIncomeList(db);

  for(const i of income){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(i.source)}</td>
      <td>${escapeHtml(i.name)}</td>
      <td class="money">${escapeHtml(money(i.amount))}</td>
      <td>${escapeHtml(i.date)}</td>
      <td>${escapeHtml(i.invoice)}</td>
    `;
    tb.appendChild(tr);
  }
}

function renderRecentLists(db){
  const incBox = $("#recentIncome");
  const expBox = $("#recentExpense");
  if(!incBox || !expBox) return;

  const income = buildIncomeList(db).slice(0, 7);
  const expense = buildExpenseList(db).slice(0, 7);

  const itemHTML = (title, amt, date) => `
    <div class="listItem">
      <div class="listItemTop">
        <div class="listItemName">${escapeHtml(title)}</div>
        <div class="money">${escapeHtml(money(amt))}</div>
      </div>
      <div class="listItemMeta muted">${escapeHtml(date || "")}</div>
    </div>
  `;

  incBox.innerHTML = income.length
    ? income.map(x => itemHTML(`${x.name}`, x.amount, x.date)).join("")
    : `<div class="listItem"><div class="listItemName muted">No income yet.</div></div>`;

  expBox.innerHTML = expense.length
    ? expense.map(x => itemHTML(`${x.name}`, x.amount, x.date)).join("")
    : `<div class="listItem"><div class="listItemName muted">No expense yet.</div></div>`;
}

/* ===========================
   Dashboard (month/year filter)
   =========================== */
function loadDashFilter(){
  const raw = localStorage.getItem(DASH_FILTER_KEY);
  if(!raw) return { month:"", year:"" };
  try{
    const v = JSON.parse(raw);
    return { month: v?.month ?? "", year: v?.year ?? "" };
  }catch(e){
    return { month:"", year:"" };
  }
}
function saveDashFilter(month, year){
  localStorage.setItem(DASH_FILTER_KEY, JSON.stringify({ month, year }));
}
function clearDashFilter(){
  localStorage.removeItem(DASH_FILTER_KEY);
}

function formatDashLabel(month, year){
  const mNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  if(month === "" && year === "") return "Default (current month/year)";
  if(month !== "" && year !== "") return `${mNames[Number(month)]} ${year}`;
  if(month === "" && year !== "") return `Year ${year}`;
  if(month !== "" && year === "") return `${mNames[Number(month)]} (all years)`;
  return "";
}

function renderDashboard(db){
  const income = buildIncomeList(db);
  const expense = buildExpenseList(db);

  const filter = loadDashFilter();
  const month = String(filter.month ?? "");
  const year  = String(filter.year ?? "");

  // show filter values in UI
  $("#dashMonth") && ($("#dashMonth").value = month);
  $("#dashYear") && ($("#dashYear").value = year);
  $("#dashFilterLabel") && ($("#dashFilterLabel").textContent = formatDashLabel(month, year));

  // Monthly summary
  let mIncome = 0, mExpense = 0, mLabel = "";
  if(month !== "" && year !== ""){
    const incF = filterByMonthYear(income, "date", month, year);
    const expF = filterByMonthYear(expense, "date", month, year);
    mIncome = incF.reduce((a,x)=>a+Number(x.amount||0),0);
    mExpense = expF.reduce((a,x)=>a+Number(x.amount||0),0);
    mLabel = formatDashLabel(month, year);
  } else if(month === "" && year !== ""){
    // when only year chosen, treat "This Month" cards as 0 and clarify label
    mIncome = 0; mExpense = 0;
    mLabel = "Month view: choose month + year";
  } else {
    // default current month
    mIncome = sumByMonth(income, "date", "amount");
    mExpense = sumByMonth(expense, "date", "amount");
    const now = new Date();
    mLabel = `${now.toLocaleString(undefined,{month:"long"})} ${now.getFullYear()}`;
  }

  $("#mIncome") && ($("#mIncome").textContent = money(mIncome));
  $("#mExpense") && ($("#mExpense").textContent = money(mExpense));
  $("#mProfit") && ($("#mProfit").textContent = money(mIncome - mExpense));
  $("#mLabel") && ($("#mLabel").textContent = mLabel);

  // Yearly summary
  let yIncome = 0, yExpense = 0, yLabel = "";
  if(year !== ""){
    const incF = filterByMonthYear(income, "date", "", year);
    const expF = filterByMonthYear(expense, "date", "", year);
    yIncome = incF.reduce((a,x)=>a+Number(x.amount||0),0);
    yExpense = expF.reduce((a,x)=>a+Number(x.amount||0),0);
    yLabel = `Year ${year}`;
  } else {
    yIncome = sumByYear(income, "date", "amount");
    yExpense = sumByYear(expense, "date", "amount");
    yLabel = `Year ${new Date().getFullYear()}`;
  }

  $("#yIncome") && ($("#yIncome").textContent = money(yIncome));
  $("#yExpense") && ($("#yExpense").textContent = money(yExpense));
  $("#yProfit") && ($("#yProfit").textContent = money(yIncome - yExpense));
  $("#yLabel") && ($("#yLabel").textContent = yLabel);

  renderRecentLists(db);
}

/* ===========================
   Search filtering (client/employee/etc.)
   =========================== */
function wireSearch(inputId, tableId){
  const input = $(inputId);
  const table = $(tableId);
  if(!input || !table) return;

  input.addEventListener("input", () => {
    const q = String(input.value||"").toLowerCase().trim();
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach(r => {
      const txt = r.textContent.toLowerCase();
      r.style.display = (!q || txt.includes(q)) ? "" : "none";
    });
  });
}

/* ===========================
   CRUD modals (fields definitions)
   =========================== */
function clientFields(){
  return [
    { key:"clientName", label:"Client Name", type:"text", placeholder:"Full name" },
    { key:"clientPhone", label:"Phone", type:"text", inputmode:"numeric", maxlength:15, placeholder:"Phone number" },
    { key:"dob", label:"DOB", type:"date", autoAgeTarget:"age" },
    { key:"age", label:"Age", type:"number", placeholder:"Auto", help:"Auto calculated from DOB (editable if needed)." },
    { key:"amountPaid", label:"Amount Paid", type:"number", placeholder:"0" },
    { key:"balanceAmount", label:"Balance", type:"number", placeholder:"0" },
    { key:"invoiceNumber", label:"Invoice", type:"text", placeholder:"RS-2140" },
    { key:"entryDate", label:"Entry Date", type:"date" },
    { key:"workerName", label:"Allocated Worker", type:"text", placeholder:"Worker name" }
  ];
}

function employeeFields(){
  return [
    { key:"accessNo", label:"Access No", type:"text", placeholder:"RS-14160" },
    { key:"name", label:"Employee Name", type:"text" },
    { key:"phone", label:"Phone", type:"text", inputmode:"numeric", maxlength:15 },
    { key:"dob", label:"DOB", type:"date", autoAgeTarget:"age" },
    { key:"age", label:"Age", type:"number", placeholder:"Auto" },
    { key:"role", label:"Role", type:"text", placeholder:"Manager" },
    { key:"salaryAllocated", label:"Salary Allocated", type:"number", placeholder:"0" }
  ];
}

function workerFields(){
  return [
    { key:"name", label:"Worker Name", type:"text" },
    { key:"phone", label:"Phone", type:"text", inputmode:"numeric", maxlength:15 },
    { key:"dob", label:"DOB", type:"date", autoAgeTarget:"age" },
    { key:"age", label:"Age", type:"number", placeholder:"Auto" },
    { key:"aadhar", label:"Aadhar Number", type:"text", inputmode:"numeric", maxlength:12, placeholder:"12 digits" },
    { key:"specialist", label:"Specialist", type:"text", placeholder:"e.g. Nurse / Cook / Driver" },
    { key:"aadharImage", label:"Aadhar Image", type:"file", accept:"image/*" },
    { key:"workerPhoto", label:"Worker Photo", type:"file", accept:"image/*" }
  ];
}

function salaryFields(db){
  const employees = db.employees || [];
  const opts = employees.map(e => ({ value: e.name, label: `${e.name} (${e.accessNo||""})` }));
  opts.unshift({ value:"", label:"Select employee" });

  return [
    { key:"accessNo", label:"Access No", type:"text", placeholder:"Employee access no" },
    { key:"employeeName", label:"Employee", type:"select", options: opts },
    { key:"salarySlipNumber", label:"Slip No", type:"text", placeholder:"SLIP-001" },
    { key:"salaryAmount", label:"Amount", type:"number", placeholder:"0" },
    { key:"paidDate", label:"Paid Date", type:"date" },
    {
      key:"paidOption",
      label:"Paid Option",
      type:"select",
      options:[
        {value:"Cash", label:"Cash"},
        {value:"UPI", label:"UPI"},
        {value:"Bank", label:"Bank"},
        {value:"other", label:"Other"}
      ],
      otherKey:"paidOptionOther",
      otherLabel:"Other Paid Option"
    }
  ];
}

function expenseFields(){
  return [
    { key:"name", label:"Expense Name", type:"text", placeholder:"e.g. Petrol" },
    { key:"amount", label:"Amount", type:"number", placeholder:"0" },
    { key:"forWhat", label:"For What", type:"text", placeholder:"Short note" },
    { key:"date", label:"Date", type:"date" },
    {
      key:"paymentMethod",
      label:"Payment Method",
      type:"select",
      options:[
        {value:"Cash", label:"Cash"},
        {value:"UPI", label:"UPI"},
        {value:"Card", label:"Card"},
        {value:"Bank", label:"Bank"},
        {value:"other", label:"Other"}
      ],
      otherKey:"paymentOther",
      otherLabel:"Other Payment Method"
    }
  ];
}

/* ===========================
   Admin settings modal (change username/pass/code)
   =========================== */
function openAdminCredsModal(){
  openModal(
    "Change Admin Credentials",
    [
      { key:"currentPassword", label:"Current Password", type:"password" },
      { key:"currentCode", label:"Current 6-Digit Admin Code", type:"text", inputmode:"numeric", maxlength:6, isAdminCode:true, help:"Enter your current admin code to verify." },
      { key:"newUsername", label:"New Username (optional)", type:"text", placeholder:"Leave blank to keep" },
      { key:"newPassword", label:"New Password (optional)", type:"password", placeholder:"Leave blank to keep" },
      { key:"newCode", label:"New 6-Digit Code (optional)", type:"text", inputmode:"numeric", maxlength:6, help:"Leave blank to keep current code." }
    ],
    {},
    async (vals) => {
      // NOTE: The modal already validated 'currentCode' format; now we update creds.
      const res = await updateCredsAdminOnly({
        currentPassword: vals.currentPassword,
        currentCode: vals.currentCode,
        newUsername: vals.newUsername,
        newPassword: vals.newPassword,
        newCode: vals.newCode
      });
      if(!res.ok) throw new Error(res.msg);
      alert(res.msg);
    }
  );
}

/* ===========================
   Excel export (SheetJS)
   =========================== */
function exportExcel(db){
  if(typeof XLSX === "undefined"){
    alert("Excel library not loaded.");
    return;
  }

  const income = buildIncomeList(db);
  const expense = buildExpenseList(db);

  const wb = XLSX.utils.book_new();

  const addSheet = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("Clients", db.clients.map(c => ({
    "Client Name": c.clientName,
    "Phone": c.clientPhone,
    "DOB": c.dob,
    "Age": c.age,
    "Amount Paid": Number(c.amountPaid||0),
    "Balance": Number(c.balanceAmount||0),
    "Invoice": c.invoiceNumber,
    "Entry Date": c.entryDate,
    "Worker": c.workerName
  })));

  addSheet("Employees", db.employees.map(e => ({
    "Access No": e.accessNo,
    "Name": e.name,
    "Phone": e.phone,
    "DOB": e.dob,
    "Age": e.age,
    "Role": e.role,
    "Salary Allocated": Number(e.salaryAllocated||0)
  })));

  addSheet("Workers", db.workers.map(w => ({
    "Name": w.name,
    "Phone": w.phone,
    "DOB": w.dob,
    "Age": w.age,
    "Aadhar": w.aadhar,
    "Specialist": w.specialist,
    "Has Aadhar Image": !!w.aadharImage,
    "Has Photo": !!w.workerPhoto
  })));

  addSheet("Salary", db.salary.map(s => ({
    "Access No": s.accessNo,
    "Employee": s.employeeName,
    "Slip No": s.salarySlipNumber,
    "Amount": Number(s.salaryAmount||0),
    "Paid Date": s.paidDate,
    "Paid Option": (s.paidOption === "other" ? (s.paidOptionOther||"Other") : s.paidOption)
  })));

  addSheet("Expense", db.expense.map(e => ({
    "Name": e.name,
    "Amount": Number(e.amount||0),
    "For What": e.forWhat,
    "Date": e.date,
    "Payment Method": (e.paymentMethod === "other" ? (e.paymentOther||"Other") : e.paymentMethod)
  })));

  addSheet("Income", income.map(i => ({
    "Source": i.source,
    "Name": i.name,
    "Amount": Number(i.amount||0),
    "Date": i.date,
    "Invoice": i.invoice
  })));

  addSheet("Derived Expense (incl Salary)", expense.map(x => ({
    "Name": x.name,
    "Amount": Number(x.amount||0),
    "For What": x.forWhat,
    "Date": x.date,
    "Method": x.method
  })));

  const fn = `RS_HomeCare_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fn);
}

/* ===========================
   Backup / Restore JSON
   =========================== */
function backupJson(db){
  const payload = {
    version: APP_CONFIG.VERSION,
    exportedAt: new Date().toISOString(),
    storeKey: STORE_KEY,
    data: db,
    creds: getCreds(),           // includes hashes only
    attemptLogs: loadAttemptLogs(),
    dashFilter: loadDashFilter(),
    theme: localStorage.getItem(THEME_KEY) || "dark"
  };
  downloadTextAsFile(JSON.stringify(payload, null, 2), `RS_Backup_${todayISO()}.json`);
}

function restoreJsonFromFile(file, onDone){
  const r = new FileReader();
  r.onload = () => {
    try{
      const obj = JSON.parse(String(r.result||""));
      if(!obj || typeof obj !== "object") throw new Error("Invalid JSON.");

      if(obj.data){
        saveStore(obj.data);
      }
      if(obj.creds){
        localStorage.setItem(CREDS_KEY, JSON.stringify(obj.creds));
      }
      if(Array.isArray(obj.attemptLogs)){
        saveAttemptLogs(obj.attemptLogs);
      }
      if(obj.dashFilter){
        localStorage.setItem(DASH_FILTER_KEY, JSON.stringify(obj.dashFilter));
      }
      if(obj.theme){
        setTheme(obj.theme);
      }
      alert("Restore complete.");
      onDone && onDone();
    }catch(e){
      alert("Restore failed: " + (e?.message || e));
    }
  };
  r.readAsText(file);
}

/* ===========================
   App refresh (render everything)
   =========================== */
function refreshAll(db){
  renderDashboard(db);
  renderClients(db);
  renderEmployees(db);
  renderWorkers(db);
  renderSalary(db);
  renderExpense(db);
  renderIncome(db);
}

/* ===========================
   Event wiring
   =========================== */
function wireNav(){
  // Only bind real pages
  $$(".navItem[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.getAttribute("data-page");
      if(page) showPage(page);
    });
  });
}
function wireAttendanceMenu(){
  const toggleBtn = $("#attendanceToggle");
  const menu = $("#attendanceMenu");
  if(!toggleBtn || !menu) return;

  toggleBtn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  // Optional: handle clicks on the 7 buttons
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-att]");
    if(!btn) return;

    const key = btn.getAttribute("data-att");

    // For now just show which one clicked
    alert("Attendance clicked: " + key);

    // Later you can do:
    // - showPage("somePage")
    // - openModal(...)
    // - window.open("somefile.html","_blank")
  });
}
function wireDashboardFilter(db){
  $("#applyDashFilterBtn")?.addEventListener("click", () => {
    const m = $("#dashMonth")?.value ?? "";
    const y = String($("#dashYear")?.value ?? "").trim();
    saveDashFilter(m, y);
    renderDashboard(db);
  });

  $("#clearDashFilterBtn")?.addEventListener("click", () => {
    clearDashFilter();
    renderDashboard(db);
  });
}

function wireTableActions(db){
  // Clients
  $("#clientsTable")?.addEventListener("click", (e) => {
    const btn = e.target?.closest("button");
    if(!btn) return;
    const act = btn.getAttribute("data-act");
    const id  = btn.getAttribute("data-id");
    const idx = db.clients.findIndex(x => x.id === id);
    if(idx < 0) return;

    if(act === "edit"){
      openModal("Edit Client", clientFields(), db.clients[idx], async (vals) => {
        vals.age = vals.age || calcAge(vals.dob);
        db.clients[idx] = { ...db.clients[idx], ...vals };
        saveStore(db); refreshAll(db);
      });
    } else if(act === "del"){
      if(confirm("Delete this client?")){
        db.clients.splice(idx, 1);
        saveStore(db); refreshAll(db);
      }
    }
  });

  // Employees
  $("#employeesTable")?.addEventListener("click", (e) => {
    const btn = e.target?.closest("button");
    if(!btn) return;
    const act = btn.getAttribute("data-act");
    const id  = btn.getAttribute("data-id");
    const idx = db.employees.findIndex(x => x.id === id);
    if(idx < 0) return;

    if(act === "edit"){
      openModal("Edit Employee", employeeFields(), db.employees[idx], async (vals) => {
        vals.age = vals.age || calcAge(vals.dob);
        db.employees[idx] = { ...db.employees[idx], ...vals };
        saveStore(db); refreshAll(db);
      });
    } else if(act === "del"){
      if(confirm("Delete this employee?")){
        db.employees.splice(idx, 1);
        saveStore(db); refreshAll(db);
      }
    }
  });

  // Workers
  $("#workersTable")?.addEventListener("click", (e) => {
    const btn = e.target?.closest("button");
    if(!btn) return;
    const act = btn.getAttribute("data-act");
    const id  = btn.getAttribute("data-id");
    const idx = db.workers.findIndex(x => x.id === id);
    if(idx < 0) return;
    const w = db.workers[idx];

    if(act === "dlAadhar" && w.aadharImage){
      downloadDataURL(w.aadharImage, w["aadharImage__name"] || `aadhar_${w.name||"worker"}.png`);
      return;
    }
    if(act === "dlPhoto" && w.workerPhoto){
      downloadDataURL(w.workerPhoto, w["workerPhoto__name"] || `photo_${w.name||"worker"}.png`);
      return;
    }

    if(act === "edit"){
      openModal("Edit Worker", workerFields(), w, async (vals) => {
        vals.age = vals.age || calcAge(vals.dob);
        db.workers[idx] = { ...w, ...vals };
        saveStore(db); refreshAll(db);
      });
    } else if(act === "del"){
      if(confirm("Delete this worker?")){
        db.workers.splice(idx, 1);
        saveStore(db); refreshAll(db);
      }
    }
  });

  // Salary
  $("#salaryTable")?.addEventListener("click", (e) => {
    const btn = e.target?.closest("button");
    if(!btn) return;
    const act = btn.getAttribute("data-act");
    const id  = btn.getAttribute("data-id");
    const idx = db.salary.findIndex(x => x.id === id);
    if(idx < 0) return;

    if(act === "edit"){
      openModal("Edit Salary", salaryFields(db), db.salary[idx], async (vals) => {
        // normalize "other" option
        if(vals.paidOption === "other" && vals.paidOptionOther){
          // keep as-is; display handled elsewhere
        }
        db.salary[idx] = { ...db.salary[idx], ...vals };
        saveStore(db); refreshAll(db);
      });
    } else if(act === "del"){
      if(confirm("Delete this salary record?")){
        db.salary.splice(idx, 1);
        saveStore(db); refreshAll(db);
      }
    }
  });

  // Expense
  $("#expenseTable")?.addEventListener("click", (e) => {
    const btn = e.target?.closest("button");
    if(!btn) return;
    const act = btn.getAttribute("data-act");
    const id  = btn.getAttribute("data-id");
    const idx = db.expense.findIndex(x => x.id === id);
    if(idx < 0) return;

    if(act === "edit"){
      openModal("Edit Expense", expenseFields(), db.expense[idx], async (vals) => {
        db.expense[idx] = { ...db.expense[idx], ...vals };
        saveStore(db); refreshAll(db);
      });
    } else if(act === "del"){
      if(confirm("Delete this expense?")){
        db.expense.splice(idx, 1);
        saveStore(db); refreshAll(db);
      }
    }
  });
}

function wireAddButtons(db){
  $("#addClientBtn")?.addEventListener("click", () => {
    const init = { entryDate: todayISO(), amountPaid: 0, balanceAmount: 0 };
    openModal("Add Client", clientFields(), init, async (vals) => {
      const rec = {
        id: uid(),
        ...vals,
        age: vals.age || calcAge(vals.dob)
      };
      db.clients.unshift(rec);
      saveStore(db); refreshAll(db);
    });
  });

  $("#addEmployeeBtn")?.addEventListener("click", () => {
    const init = {};
    openModal("Add Employee", employeeFields(), init, async (vals) => {
      const rec = {
        id: uid(),
        ...vals,
        age: vals.age || calcAge(vals.dob)
      };
      db.employees.unshift(rec);
      saveStore(db); refreshAll(db);
    });
  });

  $("#addWorkerBtn")?.addEventListener("click", () => {
    const init = {};
    openModal("Add Worker", workerFields(), init, async (vals) => {
      const rec = {
        id: uid(),
        ...vals,
        age: vals.age || calcAge(vals.dob)
      };
      db.workers.unshift(rec);
      saveStore(db); refreshAll(db);
    });
  });

  $("#addSalaryBtn")?.addEventListener("click", () => {
    const init = { paidDate: todayISO(), salaryAmount: 0 };
    openModal("Add Salary", salaryFields(db), init, async (vals) => {
      const rec = { id: uid(), ...vals };
      db.salary.unshift(rec);
      saveStore(db); refreshAll(db);
    });
  });

  $("#addExpenseBtn")?.addEventListener("click", () => {
    const init = { date: todayISO(), amount: 0 };
    openModal("Add Expense", expenseFields(), init, async (vals) => {
      const rec = { id: uid(), ...vals };
      db.expense.unshift(rec);
      saveStore(db); refreshAll(db);
    });
  });
}

function wireSettings(db){
  $("#backupJsonBtn")?.addEventListener("click", () => backupJson(db));

  $("#restoreJsonInput")?.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    restoreJsonFromFile(file, () => {
      const next = loadStore();
      Object.assign(db, next); // keep reference
      refreshAll(db);
      renderAttemptLogs();
    });
    e.target.value = "";
  });

  $("#openAdminSettingsBtn")?.addEventListener("click", openAdminCredsModal);

  $("#clearAttemptLogsBtn")?.addEventListener("click", () => {
    if(confirm("Clear all failed login attempt logs?")){
      saveAttemptLogs([]);
      renderAttemptLogs();
    }
  });
}

/* ===========================
   Login / Logout
   =========================== */
async function doLogin(){
  const u = $("#loginUser")?.value || "";
  const p = $("#loginPass")?.value || "";
  const c = $("#loginCode")?.value || "";

  const res = await verifyLogin(u, p, c);
  if(res.ok){
    setAuthed(true);
    setLoginMsg("Login successful ✅", true);
    showApp();
  } else {
    setAuthed(false);
    setLoginMsg(res.reason || "Login failed.", false);
    addAttemptLog({ enteredUsername: u, reason: res.reason || "Wrong credentials" });
  }
}

function showLogin(){
  $("#loginScreen")?.classList.remove("hidden");
  $("#app")?.classList.add("hidden");
  renderAttemptLogs();
}

function showApp(){
  $("#loginScreen")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");
  showPage("dashboard");
}

function doLogout(){
  setAuthed(false);
  showLogin();
}

/* ===========================
   Boot
   =========================== */
async function init(){
  setYears();
  setVersionLabels();

  // init theme
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  setTheme(savedTheme);

  // creds
  await ensureCredsInitialized();

  const db = loadStore();

  // wire theme buttons
  $("#themeBtn")?.addEventListener("click", toggleTheme);
  $("#loginThemeBtn")?.addEventListener("click", toggleTheme);

  // wire login/logout
  $("#loginBtn")?.addEventListener("click", doLogin);
  $("#logoutBtn")?.addEventListener("click", doLogout);

  // allow enter to login quickly
  ["#loginUser","#loginPass","#loginCode"].forEach(id => {
    $(id)?.addEventListener("keydown", (e) => {
      if(e.key === "Enter") doLogin();
    });
  });

  // export
  $("#exportExcelBtn")?.addEventListener("click", () => exportExcel(db));

  // nav + dashboard filter
 wireNav();
wireAttendanceMenu();
wireDashboardFilter(db);

  // add buttons
  wireAddButtons(db);

  // table actions
  wireTableActions(db);

  // settings actions
  wireSettings(db);
  // searches (continue)
  wireSearch("#searchClients",   "#clientsTable");
  wireSearch("#searchEmployees", "#employeesTable");
  wireSearch("#searchWorkers",   "#workersTable");
  wireSearch("#searchSalary",    "#salaryTable");
  wireSearch("#searchExpense",   "#expenseTable");
  wireSearch("#searchIncome",    "#incomeTable");

  // initial render
  refreshAll(db);

  // show correct screen
  if(isAuthed()) showApp();
  else showLogin();
}

// run
document.addEventListener("DOMContentLoaded", init);
