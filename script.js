// ============================================================
// script.js (FULL UPDATED – Coordinator Sorting/Search FIXED)
// ============================================================

console.log("script.js loaded");

// Firebase
const auth = firebase.auth();
const db = firebase.firestore();

// Global State
let currentUserProfile = null;
let selectedRequestDocId = null;

// Coordinator Cache (Used for search/filter)
let coordinatorCache = [];

// DOM
const registerPage = document.getElementById('registerPage');
const loginPage = document.getElementById('loginPage');
const studentDashboard = document.getElementById('studentDashboard');
const coordinatorDashboard = document.getElementById('coordinatorDashboard');
const studentMsg = document.getElementById('studentMsg');
const requestList = document.getElementById('requestList');
const facultySelect = document.getElementById('faculty');

const successPopup = document.getElementById('successPopup');
const successLottie = document.getElementById('successLottie');
const successText = document.getElementById('successText');

const detailsPopup = document.getElementById('detailsPopup');
const rejectPopup = document.getElementById('rejectPopup');

// Details Popup DOM
const d_name = document.getElementById('d_name');
const d_usn = document.getElementById('d_usn');
const d_email = document.getElementById('d_email');
const d_dept = document.getElementById('d_dept');
const d_branch = document.getElementById('d_branch');
const d_year = document.getElementById('d_year');
const d_purpose = document.getElementById('d_purpose');
const d_date_time = document.getElementById('d_date_time');

// Hide pages
function hideAllPages() {
  document.querySelectorAll(".page").forEach(p => p.style.display = "none");
  document.querySelectorAll(".overlay").forEach(o => o.style.display = "none");
}

function showRegister() { hideAllPages(); registerPage.style.display = 'block'; }
function showLogin() { hideAllPages(); loginPage.style.display = 'block'; }
function showStudentDashboard() { hideAllPages(); studentDashboard.style.display = 'block'; }
function showCoordinatorDashboard() { hideAllPages(); coordinatorDashboard.style.display = 'block'; }

/* ------------------ REGISTER ------------------ */
function toggleRegisterForm() {
  let role = document.getElementById('regRole').value;
  document.getElementById('studentFields').style.display = role === "student" ? "block" : "none";
  document.getElementById('coordFields').style.display = role === "coordinator" ? "block" : "none";
}

async function register() {
  try {
    let role = document.getElementById('regRole').value;
    let pass = document.getElementById('regPass').value.trim();
    if (!pass) return alert("Enter a password");

    let email = role === "student"
      ? document.getElementById('stuEmail').value.trim()
      : document.getElementById('coEmail').value.trim();

    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid;

    let profile = { role, email, uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (role === "student") {
      profile.name = document.getElementById('stuName').value.trim();
      profile.dept = document.getElementById('stuDept').value.trim();
      profile.branch = document.getElementById('stuBranch').value.trim();
      profile.year = document.getElementById('stuYear').value.trim();
      profile.userId = document.getElementById('stuUSN').value.trim();
    } else {
      profile.name = document.getElementById('coName').value.trim();
      profile.dept = document.getElementById('coDept').value.trim();
      profile.userId = document.getElementById('coUserId').value.trim();
    }

    await db.collection('users').doc(uid).set(profile);
    alert("Registered! Please Login.");
    showLogin();

  } catch (err) {
    alert("Registration error: " + err.message);
  }
}

/* ------------------ LOGIN ------------------ */
async function login() {
  try {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    alert("Login failed: " + err.message);
  }
}

/* ------------------ LOGOUT ------------------ */
function logout() {
  auth.signOut();
  hideAllPages();
  showLogin();
}

/* ------------------ AUTH STATE ------------------ */
let studentListenerUnsub = null;
let coordinatorListenerUnsub = null;
let coordinatorsListenerUnsub = null;

auth.onAuthStateChanged(async (user) => {

  if (studentListenerUnsub) studentListenerUnsub();
  if (coordinatorListenerUnsub) coordinatorListenerUnsub();

  if (!user) {
    hideAllPages();
    showLogin();
    return;
  }

  const doc = await db.collection('users').doc(user.uid).get();
  if (!doc.exists) {
    auth.signOut();
    return alert("Profile missing — Please register again.");
  }

  currentUserProfile = doc.data();

  if (currentUserProfile.role === "student") {

    showStudentDashboard();
    loadStudentDetails();

    studentListenerUnsub = db.collection('appointments')
      .where('studentUid', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => renderStudentAppointments(snap));

  } else {

    showCoordinatorDashboard();
    loadCoordinatorProfile();

    coordinatorListenerUnsub = db.collection('appointments')
      .where('facultyUid', '==', user.uid)
      .orderBy('date', 'asc')
      .onSnapshot(snap => {

        coordinatorCache = [];
        snap.forEach(doc => {
          let r = doc.data();
          r.id = doc.id;
          coordinatorCache.push(r);
        });

        renderCoordinatorRequestsFromCache();
      });
  }
});

/* ------------------ STUDENT FUNCTIONS ------------------ */
function loadStudentDetails() {
  document.getElementById('s_name').innerText = "Name: " + currentUserProfile.name;
  document.getElementById('s_email').innerText = "Email: " + currentUserProfile.email;
  document.getElementById('s_dept').innerText = "Dept: " + currentUserProfile.dept;
  document.getElementById('s_branch').innerText = "Branch: " + currentUserProfile.branch;
  document.getElementById('s_year').innerText = "Year: " + currentUserProfile.year;
  document.getElementById('s_usn').innerText = "USN: " + currentUserProfile.userId;
}

async function submitAppointment() {
  const purpose = document.getElementById('purpose').value.trim();
  const facultyUid = facultySelect.value;
  const facultyName = facultySelect.options[facultySelect.selectedIndex]?.textContent;
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;

  await db.collection('appointments').add({
    studentUid: auth.currentUser.uid,
    studentId: currentUserProfile.userId,
    studentName: currentUserProfile.name,
    facultyUid,
    facultyName,
    purpose,
    date,
    time,
    status: "Pending",
    suggestedDate: "",
    suggestedTime: "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  showSuccess("Appointment Sent");
}

function renderStudentAppointments(snap) {
  studentMsg.innerHTML = "";

  if (snap.empty) {
    studentMsg.innerHTML = "<p>No appointments yet.</p>";
    return;
  }

  snap.forEach(doc => {
    const r = doc.data();
    const id = doc.id;

    studentMsg.innerHTML += `
      <div class="request-card">
        <div>
          <p><b>Coordinator:</b> ${r.facultyName}</p>
          <p><b>Purpose:</b> ${r.purpose}</p>
          <p><b>Date:</b> ${r.date}</p>
          <p><b>Time:</b> ${r.time}</p>
          <p><b>Status:</b> ${r.status}</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${badgeHTML(r.status)}
          <button class="btn small cancel" onclick="deleteAppointment('${id}')">Delete</button>
        </div>
      </div>
    `;
  });
}

/* ------------------ COORDINATOR FUNCTIONS ------------------ */
function loadCoordinatorProfile() {
  document.getElementById('c_name').innerText = "Name: " + currentUserProfile.name;
  document.getElementById('c_email').innerText = "Email: " + currentUserProfile.email;
  document.getElementById('c_dept').innerText = "Department: " + currentUserProfile.dept;
}

function renderCoordinatorRequestsFromCache() {

  requestList.innerHTML = "";

  let pending = 0, approved = 0, rejected = 0, withdrawn = 0;

  coordinatorCache.forEach(r => {
    if (r.status === "Pending") pending++;
    if (r.status === "Approved") approved++;
    if (r.status === "Rejected") rejected++;
    if (r.status === "Withdrawn") withdrawn++;
  });

  const set = (id, val) => { const e = document.getElementById(id); if(e) e.innerText = val; };
  set("stat_pending", pending);
  set("stat_approved", approved);
  set("stat_rejected", rejected);
  set("stat_withdrawn", withdrawn);

  const search = (document.getElementById('searchInput')?.value || "").toLowerCase();
  const filter = document.getElementById('statusFilter')?.value || "all";

  const filtered = coordinatorCache.filter(r => {
    const matchSearch =
      r.studentName?.toLowerCase().includes(search) ||
      r.studentId?.toLowerCase().includes(search);

    const matchStatus = filter === "all" || r.status === filter;

    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    requestList.innerHTML = `<p style="color:#ddd">No appointments found.</p>`;
    return;
  }

  const groups = {};
  filtered.forEach(r => {
    const d = r.date || "No-Date";
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  const today = new Date().toISOString().split("T")[0];
  const dates = Object.keys(groups).sort((a,b)=>{
    if(a===today) return -1;
    if(b===today) return 1;
    return a.localeCompare(b);
  });

  dates.forEach(d => {
    requestList.innerHTML += `<h4 style="color:white;margin-top:10px">${d===today?(`Today (${d})`):d}</h4>`;
  
    groups[d].forEach(r=>{
      requestList.innerHTML += `
        <div class="request-card">
          <div>
            <p><b>${r.studentName} (${r.studentId})</b></p>
            <p>${r.purpose}</p>
            <p><b>Date:</b> ${r.date} <b>Time:</b> ${r.time}</p>
            <p><b>Status:</b> ${r.status}</p>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            ${badgeHTML(r.status)}
            <button class="btn small" onclick="openDetails('${r.id}')">View</button>
          </div>
        </div>
      `;
    });
  });
}

/* SEARCH + FILTER */
document.getElementById("searchInput")?.addEventListener("input", renderCoordinatorRequestsFromCache);
document.getElementById("statusFilter")?.addEventListener("change", renderCoordinatorRequestsFromCache);

/* ------------------ POPUPS ------------------ */
async function openDetails(docId) {
  selectedRequestDocId = docId;

  const snap = await db.collection('appointments').doc(docId).get();
  const req = snap.data();

  const stuSnap = await db.collection('users').doc(req.studentUid).get();
  const stu = stuSnap.data();

  d_name.innerText = "Name: " + stu.name;
  d_usn.innerText = "USN: " + stu.userId;
  d_email.innerText = "Email: " + stu.email;
  d_dept.innerText = "Dept: " + stu.dept;
  d_branch.innerText = "Branch: " + stu.branch;
  d_year.innerText = "Year: " + stu.year;
  d_purpose.innerText = "Purpose: " + req.purpose;
  d_date_time.innerText = "Date & Time: " + req.date + " — " + req.time;

  detailsPopup.style.display = "flex";
}

function closeDetailsPopup() { detailsPopup.style.display = "none"; }

async function approveRequest() {
  await db.collection('appointments').doc(selectedRequestDocId).update({ status: "Approved" });
  closeDetailsPopup();
  showSuccess("Approved");
}

function openRejectPopup() {
  rejectPopup.style.display = "flex";
  detailsPopup.style.display = "none";
}
function closeRejectPopup() { rejectPopup.style.display = "none"; }

async function submitSuggestion(){
  const d = document.getElementById('suggestDate').value;
  const t = document.getElementById('suggestTime').value;
  
  await db.collection('appointments').doc(selectedRequestDocId).update({
    status: "Rejected",
    suggestedDate: d,
    suggestedTime: t
  });

  closeRejectPopup();
  showSuccess("Rejected");
}

/* ------------------ SUCCESS POPUP ------------------ */
function showSuccess(txt){
  successText.innerText = txt;
  successPopup.style.display = "flex";
  successLottie.play();

  setTimeout(()=>{
    successPopup.style.display = "none";
    successLottie.stop();
  },1000);
}

/* ------------------ INIT ------------------ */
hideAllPages();
showLogin();

// Close overlay on click
document.querySelectorAll(".overlay").forEach(o=>{
  o.addEventListener("click", e=>{
    if(e.target===o) o.style.display="none";
  });
});

/* ------------------ BADGE ------------------ */
function badgeHTML(status){
  const s = status.toLowerCase();
  if(s==="approved") return `<span class="badge approved">Approved</span>`;
  if(s==="rejected") return `<span class="badge rejected">Rejected</span>`;
  if(s==="withdrawn") return `<span class="badge withdrawn">Withdrawn</span>`;
  return `<span class="badge pending">Pending</span>`;
}
