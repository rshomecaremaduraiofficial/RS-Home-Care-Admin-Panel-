
const APP_CONFIG = {
  COMPANY_NAME: "RS Home Care",
  DEFAULT_USERNAME: "RShomecare",
  DEFAULT_PASSWORD: "RS@Home",
  ADMIN_6_DIGIT_CODE: "141614" 
};

const STORE_KEY = "rshomecare_data_v1";
const THEME_KEY = "rshomecare_theme_v1";
const AUTH_KEY  = "rshomecare_auth_v1";

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

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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


/* ===========================
   UI helpers
   =========================== */
function showPage(name){
  $$(".page").forEach(p => p.classList.add("hidden"));
  $(`#page-${name}`)?.classList.remove("hidden");

  $$(".navItem").forEach(b => b.classList.remove("active"));
  $(`.navItem[data-page="${name}"]`)?.classList.add("active");
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
let toastTimer;


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

    // admin code check
    const codeField = fields.find(x => x.isAdminCode === true);
    if(codeField){
      const codeVal = String(values[codeField.key] || "").trim();
      if(codeVal !== APP_CONFIG.ADMIN_6_DIGIT_CODE){
        $("#modalMsg").textContent = "Wrong 6-digit admin code. Record was NOT saved.";
        return;
      }
    }

    onSave(values);
    close();
  };
}

/* ===========================
   Fields
   =========================== */
function clientFields(){
  return [
    { key:"clientName", label:"Client Full Name", className:"span2", placeholder:"Full name" },
    { key:"formNumber", label:"Form Number (Optional)", placeholder:"Optional" },

    { key:"clientPhone", label:"Client Phone Number", inputmode:"numeric", placeholder:"Phone number" },
    { key:"dob", label:"Date of Birth", type:"date", autoAgeTarget:"age" },
    { key:"age", label:"Age (Auto)", type:"text", placeholder:"Auto" },

    { key:"address", label:"Address", className:"full", placeholder:"Full address" },

    { key:"agreementImage", label:"Upload Client Agreement Image", type:"file", className:"full" },

    { key:"workerName", label:"Worker Name", placeholder:"Worker assigned" },
    { key:"contractPeriod", label:"Contract Period (Optional)", placeholder:"Optional" },
    { key:"amountPaid", label:"Amount Paid (Adds to Income)", inputmode:"decimal", placeholder:"0" },

    { key:"balanceAmount", label:"Balance Amount", inputmode:"decimal", placeholder:"0" },
    { key:"invoiceNumber", label:"Invoice Number", placeholder:"INV-..." },
    { key:"entryDate", label:"Entry Date", type:"date" },

    { key:"responsiblePersonName", label:"Responsible Person Name (Optional)", placeholder:"Optional" },
    { key:"responsiblePersonPhone", label:"Responsible Person Phone (Optional)", inputmode:"numeric", placeholder:"Optional" },

    { key:"specialRequirement", label:"Any Special Requirement (Optional)", type:"textarea", rows:3, className:"full" },

    { key:"adminCode", label:"Enter 6-Digit Admin Code to Save", inputmode:"numeric", maxlength:6, placeholder:"123456", className:"span2", isAdminCode:true }
  ];
}

function employeeFields(){
  return [
    { key:"accessNumber", label:"Employee Access Number", placeholder:"RS-0001" },
    { key:"employeeName", label:"Employee Name", className:"span2", placeholder:"Full name" },

    { key:"dob", label:"Date of Birth", type:"date", autoAgeTarget:"age" },
    { key:"age", label:"Age (Auto)", type:"text", placeholder:"Auto" },
    { key:"phone", label:"Phone Number", inputmode:"numeric", placeholder:"Phone" },

    { key:"address", label:"Address", className:"full", placeholder:"Full address" },
    { key:"aadhar", label:"Aadhar Number", inputmode:"numeric", placeholder:"Aadhar number" },

    { key:"photo", label:"Upload Employee Photo", type:"file", className:"full" },

    { key:"salaryAllocated", label:"Salary Allocated (View Only)", inputmode:"decimal", placeholder:"0" },

    {
      key:"role", label:"Responsibility / Role", type:"select",
      options:[
        {value:"managing_director", label:"Managing Director"},
        {value:"supervisor", label:"Supervisor"},
        {value:"team_leader", label:"Team Leader"},
        {value:"client_worker", label:"Client Worker"},
        {value:"admin", label:"Admin"},
        {value:"cleaner", label:"Cleaner"},
        {value:"other", label:"Other"}
      ],
      otherKey:"roleOther",
      otherLabel:"Other Role (Type)"
    },

    { key:"adminCode", label:"Enter 6-Digit Admin Code to Save", inputmode:"numeric", maxlength:6, placeholder:"123456", className:"span2", isAdminCode:true }
  ];
}

function workerFields(){
  return [
    { key:"workerName", label:"Worker Name", className:"span2", placeholder:"Full name" },
    { key:"phone", label:"Phone Number", inputmode:"numeric", placeholder:"Phone" },

    { key:"dob", label:"Date of Birth", type:"date", autoAgeTarget:"age" },
    { key:"age", label:"Age (Auto)", type:"text", placeholder:"Auto" },
    { key:"aadhar", label:"Aadhar Number", inputmode:"numeric", placeholder:"Aadhar number" },

    { key:"address", label:"Address", className:"full", placeholder:"Full address" },

    {
      key:"specialist", label:"Specialist In", type:"select",
      options:[
        {value:"baby_care", label:"Baby Care"},
        {value:"child_care", label:"Child Care"},
        {value:"elderly_care", label:"Elderly Care"},
        {value:"cooking", label:"Cooking"},
        {value:"nurse", label:"Nurse"},
        {value:"cleaner", label:"Cleaner"},
        {value:"other", label:"Other"}
      ],
      otherKey:"specialistOther",
      otherLabel:"Other Specialist (Type)"
    },

    { key:"aadharImage", label:"Upload Aadhar Card Image", type:"file", className:"span2" },
    { key:"workerImage", label:"Upload Worker Photo", type:"file", className:"span2" },

    { key:"adminCode", label:"Enter 6-Digit Admin Code to Save", inputmode:"numeric", maxlength:6, placeholder:"123456", className:"span2", isAdminCode:true }
  ];
}

function salaryFields(){
  return [
    { key:"accessNumber", label:"Employee Access Number", placeholder:"RS-0001" },
    { key:"employeeName", label:"Employee Name", className:"span2", placeholder:"Full name" },

    { key:"salarySlipNumber", label:"Salary Slip Number", placeholder:"SLIP-..." },
    { key:"salaryAmount", label:"Salary Amount (Adds to Expense)", inputmode:"decimal", placeholder:"0" },
    { key:"paidDate", label:"Paid Date", type:"date" },

    {
      key:"paidOption", label:"Paid Option", type:"select",
      options:[
        {value:"online", label:"Online Transfer"},
        {value:"offline_transfer", label:"Offline Transfer"}
      ]
    },

    { key:"adminCode", label:"Enter 6-Digit Admin Code to Save", inputmode:"numeric", maxlength:6, placeholder:"123456", className:"span2", isAdminCode:true }
  ];
}

function expenseFields(){
  return [
    { key:"name", label:"Name", placeholder:"Expense name" },
    { key:"amount", label:"Amount", inputmode:"decimal", placeholder:"0" },
    { key:"forWhat", label:"For What", className:"span2", placeholder:"Reason / details" },

    { key:"date", label:"Date", type:"date" },
    {
      key:"paymentMethod", label:"Payment Method", type:"select",
      options:[
        {value:"online", label:"Online Transfer"},
        {value:"offline_transfer", label:"Offline Transfer"}
      ]
    },

    { key:"adminCode", label:"Enter 6-Digit Admin Code to Save", inputmode:"numeric", maxlength:6, placeholder:"123456", className:"span2", isAdminCode:true }
  ];
}

/* ===========================
   Render tables
   =========================== */
function renderClients(db, filter=""){
  const tbody = $("#clientsTable tbody");
  tbody.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const rows = db.clients.filter(c => {
    const hay = `${c.clientName||""} ${c.clientPhone||""} ${c.invoiceNumber||""} ${c.workerName||""}`.toLowerCase();
    return hay.includes(q);
  });

  for(const c of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.clientName||"")}</td>
      <td>${escapeHtml(c.clientPhone||"")}</td>
      <td>${escapeHtml(c.dob||"")}</td>
      <td><span class="pill">${escapeHtml(String(calcAge(c.dob)||c.age||""))}</span></td>
      <td class="money">${money(c.amountPaid||0)}</td>
      <td>${money(c.balanceAmount||0)}</td>
      <td>${escapeHtml(c.invoiceNumber||"")}</td>
      <td>${escapeHtml(c.entryDate||"")}</td>
      <td>${escapeHtml(c.workerName||"")}</td>
      <td>
        <div class="actions">
          <button class="btn" data-act="view" data-id="${c.id}">View</button>
          <button class="btn" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="btn danger" data-act="del" data-id="${c.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.onclick = (e) => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const item = db.clients.find(x => x.id === id);
    if(!item) return;

    if(act === "view"){
      openModal("View Client", clientFields().map(f => ({...f, type: (f.type==="file" ? "text" : f.type)})), item, ()=>{});
      setTimeout(() => {
        if(item.agreementImage){
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn";
          b.textContent = "⬇️ Download Agreement Image";
          b.onclick = () => downloadDataURL(item.agreementImage, item.agreementImage__name || "agreement.png");
          $("#modalForm").appendChild(b);
        }
      }, 0);
    }

    if(act === "edit"){
      openModal("Edit Client", clientFields(), item, (values) => {
        delete values.adminCode;
        db.clients = db.clients.map(x => x.id === id ? {...x, ...values} : x);
        saveStore(db);
        renderAll(db);
      });
    }

    if(act === "del"){
      if(!confirm("Delete this record?")) return;
      db.clients = db.clients.filter(x => x.id !== id);
      saveStore(db);
      renderAll(db);
    }
  };
}

function niceRole(e){
  const v = e.role || "";
  if(v === "other") return e.roleOther || "Other";
  return (v || "").replaceAll("_"," ").toUpperCase();
}
function niceSpecialist(w){
  const v = w.specialist || "";
  if(v === "other") return w.specialistOther || "Other";
  return (v || "").replaceAll("_"," ").toUpperCase();
}

function renderEmployees(db, filter=""){
  const tbody = $("#employeesTable tbody");
  tbody.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const rows = db.employees.filter(e => {
    const hay = `${e.accessNumber||""} ${e.employeeName||""} ${e.phone||""} ${e.aadhar||""} ${niceRole(e)}`.toLowerCase();
    return hay.includes(q);
  });

  for(const e1 of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e1.accessNumber||"")}</td>
      <td>${escapeHtml(e1.employeeName||"")}</td>
      <td>${escapeHtml(e1.phone||"")}</td>
      <td>${escapeHtml(e1.dob||"")}</td>
      <td><span class="pill">${escapeHtml(String(calcAge(e1.dob)||e1.age||""))}</span></td>
      <td><span class="pill">${escapeHtml(niceRole(e1))}</span></td>
      <td class="money">${money(e1.salaryAllocated||0)}</td>
      <td>
        <div class="actions">
          <button class="btn" data-act="view" data-id="${e1.id}">View</button>
          <button class="btn" data-act="edit" data-id="${e1.id}">Edit</button>
          <button class="btn danger" data-act="del" data-id="${e1.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.onclick = (ev) => {
    const btn = ev.target.closest("button");
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const item = db.employees.find(x => x.id === id);
    if(!item) return;

    if(act === "view"){
      openModal("View Employee", employeeFields().map(f => ({...f, type: (f.type==="file" ? "text" : f.type)})), item, ()=>{});
      setTimeout(() => {
        if(item.photo){
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn";
          b.textContent = "⬇️ Download Employee Photo";
          b.onclick = () => downloadDataURL(item.photo, item.photo__name || "employee.png");
          $("#modalForm").appendChild(b);
        }
      }, 0);
    }

    if(act === "edit"){
      openModal("Edit Employee", employeeFields(), item, (values) => {
        delete values.adminCode;
        db.employees = db.employees.map(x => x.id === id ? {...x, ...values} : x);
        saveStore(db);
        renderAll(db);
      });
    }

    if(act === "del"){
      if(!confirm("Delete this record?")) return;
      db.employees = db.employees.filter(x => x.id !== id);
      saveStore(db);
      renderAll(db);
    }
  };
}

function renderWorkers(db, filter=""){
  const tbody = $("#workersTable tbody");
  tbody.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const rows = db.workers.filter(w => {
    const hay = `${w.workerName||""} ${w.phone||""} ${w.aadhar||""} ${niceSpecialist(w)}`.toLowerCase();
    return hay.includes(q);
  });

  for(const w1 of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(w1.workerName||"")}</td>
      <td>${escapeHtml(w1.phone||"")}</td>
      <td>${escapeHtml(w1.dob||"")}</td>
      <td><span class="pill">${escapeHtml(String(calcAge(w1.dob)||w1.age||""))}</span></td>
      <td>${escapeHtml(w1.aadhar||"")}</td>
      <td><span class="pill">${escapeHtml(niceSpecialist(w1))}</span></td>
      <td>
        <div class="actions">
          <button class="btn" data-act="view" data-id="${w1.id}">View</button>
          <button class="btn" data-act="edit" data-id="${w1.id}">Edit</button>
          <button class="btn danger" data-act="del" data-id="${w1.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.onclick = (ev) => {
    const btn = ev.target.closest("button");
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const item = db.workers.find(x => x.id === id);
    if(!item) return;

    if(act === "view"){
      openModal("View Worker", workerFields().map(f => ({...f, type: (f.type==="file" ? "text" : f.type)})), item, ()=>{});
      setTimeout(() => {
        if(item.aadharImage){
          const b1 = document.createElement("button");
          b1.type = "button";
          b1.className = "btn";
          b1.textContent = "⬇️ Download Aadhar Image";
          b1.onclick = () => downloadDataURL(item.aadharImage, item.aadharImage__name || "aadhar.png");
          $("#modalForm").appendChild(b1);
        }
        if(item.workerImage){
          const b2 = document.createElement("button");
          b2.type = "button";
          b2.className = "btn";
          b2.style.marginLeft = "8px";
          b2.textContent = "⬇️ Download Worker Photo";
          b2.onclick = () => downloadDataURL(item.workerImage, item.workerImage__name || "worker.png");
          $("#modalForm").appendChild(b2);
        }
      }, 0);
    }

    if(act === "edit"){
      openModal("Edit Worker", workerFields(), item, (values) => {
        delete values.adminCode;
        db.workers = db.workers.map(x => x.id === id ? {...x, ...values} : x);
        saveStore(db);
        renderAll(db);
      });
    }

    if(act === "del"){
      if(!confirm("Delete this record?")) return;
      db.workers = db.workers.filter(x => x.id !== id);
      saveStore(db);
      renderAll(db);
    }
  };
}

function renderSalary(db, filter=""){
  const tbody = $("#salaryTable tbody");
  tbody.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const rows = db.salary.filter(s => {
    const hay = `${s.accessNumber||""} ${s.employeeName||""} ${s.salarySlipNumber||""} ${s.paidDate||""} ${s.paidOption||""}`.toLowerCase();
    return hay.includes(q);
  });

  for(const s1 of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s1.accessNumber||"")}</td>
      <td>${escapeHtml(s1.employeeName||"")}</td>
      <td>${escapeHtml(s1.salarySlipNumber||"")}</td>
      <td class="money">${money(s1.salaryAmount||0)}</td>
      <td>${escapeHtml(s1.paidDate||"")}</td>
      <td><span class="pill">${escapeHtml((s1.paidOption||"").replaceAll("_"," ").toUpperCase())}</span></td>
      <td>
        <div class="actions">
          <button class="btn" data-act="view" data-id="${s1.id}">View</button>
          <button class="btn" data-act="edit" data-id="${s1.id}">Edit</button>
          <button class="btn danger" data-act="del" data-id="${s1.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.onclick = (ev) => {
    const btn = ev.target.closest("button");
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const item = db.salary.find(x => x.id === id);
    if(!item) return;

    if(act === "view"){
      openModal("View Salary", salaryFields(), item, ()=>{});
    }

    if(act === "edit"){
      openModal("Edit Salary", salaryFields(), item, (values) => {
        delete values.adminCode;
        db.salary = db.salary.map(x => x.id === id ? {...x, ...values} : x);
        saveStore(db);
        renderAll(db);
      });
    }

    if(act === "del"){
      if(!confirm("Delete this record?")) return;
      db.salary = db.salary.filter(x => x.id !== id);
      saveStore(db);
      renderAll(db);
    }
  };
}

function renderExpense(db, filter=""){
  const tbody = $("#expenseTable tbody");
  tbody.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const rows = db.expense.filter(x => {
    const hay = `${x.name||""} ${x.forWhat||""} ${x.date||""} ${x.paymentMethod||""}`.toLowerCase();
    return hay.includes(q);
  });

  for(const e1 of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e1.name||"")}</td>
      <td class="money">${money(e1.amount||0)}</td>
      <td>${escapeHtml(e1.forWhat||"")}</td>
      <td>${escapeHtml(e1.date||"")}</td>
      <td><span class="pill">${escapeHtml((e1.paymentMethod||"").replaceAll("_"," ").toUpperCase())}</span></td>
      <td>
        <div class="actions">
          <button class="btn" data-act="view" data-id="${e1.id}">View</button>
          <button class="btn danger" data-act="del" data-id="${e1.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.onclick = (ev) => {
    const btn = ev.target.closest("button");
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const item = db.expense.find(x => x.id === id);
    if(!item) return;

    if(act === "view"){
      openModal("View Expense", expenseFields(), item, ()=>{});
    }

    if(act === "del"){
      if(!confirm("Delete this record?")) return;
      db.expense = db.expense.filter(x => x.id !== id);
      saveStore(db);
      renderAll(db);
    }
  };
}

function renderIncome(db, filter=""){
  const tbody = $("#incomeTable tbody");
  tbody.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const income = buildIncomeList(db).filter(i => {
    const hay = `${i.source||""} ${i.name||""} ${i.invoice||""} ${i.date||""}`.toLowerCase();
    return hay.includes(q);
  });

  for(const i1 of income){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(i1.source||"")}</span></td>
      <td>${escapeHtml(i1.name||"")}</td>
      <td class="money">${money(i1.amount||0)}</td>
      <td>${escapeHtml(i1.date||"")}</td>
      <td>${escapeHtml(i1.invoice||"")}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ===========================
   Dashboard
   =========================== */
function renderDashboard(db){
  const income = buildIncomeList(db);
  const expense = buildExpenseList(db);

  const mInc = sumByMonth(income, "date", "amount");
  const mExp = sumByMonth(expense, "date", "amount");
  const yInc = sumByYear(income, "date", "amount");
  const yExp = sumByYear(expense, "date", "amount");

  $("#mIncome").textContent  = money(mInc);
  $("#mExpense").textContent = money(mExp);
  $("#mProfit").textContent  = money(mInc - mExp);

  $("#yIncome").textContent  = money(yInc);
  $("#yExpense").textContent = money(yExp);
  $("#yProfit").textContent  = money(yInc - yExp);

  const now = new Date();
  $("#mLabel").textContent = now.toLocaleString(undefined, { month:"long", year:"numeric" });
  $("#yLabel").textContent = String(now.getFullYear());

  const incBox = $("#recentIncome");
  const expBox = $("#recentExpense");
  incBox.innerHTML = "";
  expBox.innerHTML = "";

  income.slice(0,6).forEach(i => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTop">
        <div class="listItemName">${escapeHtml(i.name||"")}</div>
        <div class="money">${money(i.amount||0)}</div>
      </div>
      <div class="listItemMeta">${escapeHtml(i.date||"")} • ${escapeHtml(i.invoice||"")}</div>
    `;
    incBox.appendChild(div);
  });

  expense.slice(0,6).forEach(e => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTop">
        <div class="listItemName">${escapeHtml(e.name||"")}</div>
        <div class="money">${money(e.amount||0)}</div>
      </div>
      <div class="listItemMeta">${escapeHtml(e.date||"")} • ${escapeHtml(e.method||"")}</div>
    `;
    expBox.appendChild(div);
  });
}

function renderAll(db){
  renderDashboard(db);
  renderClients(db, $("#searchClients")?.value || "");
  renderEmployees(db, $("#searchEmployees")?.value || "");
  renderWorkers(db, $("#searchWorkers")?.value || "");
  renderSalary(db, $("#searchSalary")?.value || "");
  renderExpense(db, $("#searchExpense")?.value || "");
  renderIncome(db, $("#searchIncome")?.value || "");
}

/* ===========================
   Wiring buttons / search / nav
   =========================== */
function wireNav(){
  $$(".navItem").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
}

function wireAddButtons(db){
  $("#addClientBtn").onclick = () => {
    openModal("Add Client", clientFields(), { entryDate: todayISO() }, (values) => {
      delete values.adminCode;
      values.id = uid();
      db.clients.push(values);
      saveStore(db);
      renderAll(db);
    });
  };

  $("#addEmployeeBtn").onclick = () => {
    openModal("Add Employee", employeeFields(), {}, (values) => {
      delete values.adminCode;
      values.id = uid();
      db.employees.push(values);
      saveStore(db);
      renderAll(db);
    });
  };

  $("#addWorkerBtn").onclick = () => {
    openModal("Add Worker", workerFields(), {}, (values) => {
      delete values.adminCode;
      values.id = uid();
      db.workers.push(values);
      saveStore(db);
      renderAll(db);
    });
  };

  $("#addSalaryBtn").onclick = () => {
    openModal("Add Salary", salaryFields(), { paidDate: todayISO() }, (values) => {
      delete values.adminCode;
      values.id = uid();
      db.salary.push(values);
      saveStore(db);
      renderAll(db);
    });
  };

  $("#addExpenseBtn").onclick = () => {
    openModal("Add Expense", expenseFields(), { date: todayISO() }, (values) => {
      delete values.adminCode;
      values.id = uid();
      db.expense.push(values);
      saveStore(db);
      renderAll(db);
    });
  };
}

function wireSearch(db){
  $("#searchClients").addEventListener("input", (e)=> renderClients(db, e.target.value));
  $("#searchEmployees").addEventListener("input", (e)=> renderEmployees(db, e.target.value));
  $("#searchWorkers").addEventListener("input", (e)=> renderWorkers(db, e.target.value));
  $("#searchSalary").addEventListener("input", (e)=> renderSalary(db, e.target.value));
  $("#searchExpense").addEventListener("input", (e)=> renderExpense(db, e.target.value));
  $("#searchIncome").addEventListener("input", (e)=> renderIncome(db, e.target.value));
}
/* ===========================
   Excel Export
   =========================== */
function exportExcel(db){
  if(typeof XLSX === "undefined"){
    alert("Excel library not loaded. Check SheetJS CDN in HTML.");
    return;
  }

  const wb = XLSX.utils.book_new();

  const income = buildIncomeList(db);
  const expense = buildExpenseList(db);

  const summary = [
    ["Company", APP_CONFIG.COMPANY_NAME],
    ["Export Date", new Date().toISOString()],
    [],
    ["This Month Income", sumByMonth(income, "date", "amount")],
    ["This Month Expense", sumByMonth(expense, "date", "amount")],
    ["This Month Profit/Loss", sumByMonth(income, "date", "amount") - sumByMonth(expense, "date", "amount")],
    [],
    ["This Year Income", sumByYear(income, "date", "amount")],
    ["This Year Expense", sumByYear(expense, "date", "amount")],
    ["This Year Profit/Loss", sumByYear(income, "date", "amount") - sumByYear(expense, "date", "amount")]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.clients.map(c => ({
    ClientName: c.clientName || "",
    Phone: c.clientPhone || "",
    DOB: c.dob || "",
    Age: calcAge(c.dob) || c.age || "",
    Address: c.address || "",
    WorkerName: c.workerName || "",
    AmountPaid: Number(c.amountPaid || 0),
    BalanceAmount: Number(c.balanceAmount || 0),
    InvoiceNumber: c.invoiceNumber || "",
    EntryDate: c.entryDate || ""
  }))), "Clients");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.employees.map(e => ({
    AccessNumber: e.accessNumber || "",
    Name: e.employeeName || "",
    Phone: e.phone || "",
    DOB: e.dob || "",
    Age: calcAge(e.dob) || e.age || "",
    Aadhar: e.aadhar || "",
    Role: niceRole(e),
    SalaryAllocated: Number(e.salaryAllocated || 0)
  }))), "Employees");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.workers.map(w => ({
    Name: w.workerName || "",
    Phone: w.phone || "",
    DOB: w.dob || "",
    Age: calcAge(w.dob) || w.age || "",
    Aadhar: w.aadhar || "",
    Address: w.address || "",
    Specialist: niceSpecialist(w)
  }))), "Workers");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.salary.map(s => ({
    AccessNumber: s.accessNumber || "",
    EmployeeName: s.employeeName || "",
    SlipNumber: s.salarySlipNumber || "",
    Amount: Number(s.salaryAmount || 0),
    PaidDate: s.paidDate || "",
    PaidOption: (s.paidOption || "").replaceAll("_"," ")
  }))), "Salary");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.expense.map(e => ({
    Name: e.name || "",
    Amount: Number(e.amount || 0),
    ForWhat: e.forWhat || "",
    Date: e.date || "",
    Method: (e.paymentMethod || "").replaceAll("_"," ")
  }))), "Expense");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildIncomeList(db).map(i => ({
    Source: i.source || "",
    Name: i.name || "",
    Amount: Number(i.amount || 0),
    Date: i.date || "",
    Invoice: i.invoice || ""
  }))), "Income");

  XLSX.writeFile(wb, "RS_Home_Care_Data.xlsx");
}

/* ===========================
   Auth UI
   =========================== */
function initAuthUI(){
  $("#yearNow").textContent = String(new Date().getFullYear());
  $("#footerYear").textContent = String(new Date().getFullYear());

  $("#loginThemeBtn").onclick = toggleTheme;
  $("#themeBtn").onclick = toggleTheme;

  $("#logoutBtn").onclick = () => {
    setAuthed(false);
    $("#app").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
  };

  $("#loginBtn").onclick = () => {
    const u = ($("#loginUser").value || "").trim();
    const p = ($("#loginPass").value || "").trim();
    const c = ($("#loginCode").value || "").trim();

    if(u !== APP_CONFIG.DEFAULT_USERNAME || p !== APP_CONFIG.DEFAULT_PASSWORD){
      $("#loginMsg").textContent = "Wrong username or password.";
      return;
    }
    if(c !== APP_CONFIG.ADMIN_6_DIGIT_CODE){
      $("#loginMsg").textContent = "Wrong 6-digit admin code.";
      return;
    }

    $("#loginMsg").textContent = "";
    setAuthed(true);
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
  };
}

/* ===========================
   Boot
   =========================== */
(function boot(){
  try{
    setTheme(localStorage.getItem(THEME_KEY) || "dark");
    initAuthUI();

    const db = loadStore();

    $("#exportExcelBtn").onclick = () => exportExcel(db);

    wireNav();
    wireAddButtons(db);
    wireSearch(db);

    if(isAuthed()){
      $("#loginScreen").classList.add("hidden");
      $("#app").classList.remove("hidden");
    } else {
      $("#app").classList.add("hidden");
      $("#loginScreen").classList.remove("hidden");
    }

    showPage("dashboard");
    renderAll(db);
  } catch(err){
    console.error(err);
    alert("JavaScript error. Open Console (F12) to see the error.");
  }
})();
