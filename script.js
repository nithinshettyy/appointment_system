// ============================================================
// script.js (FINAL – Search + Filter Fully Working + commented)
// ============================================================

console.log("script.js loaded"); // simple log to confirm script loaded

// Firebase compat references
const auth = firebase.auth();             // firebase auth instance (compat)
const db = firebase.firestore();          // firebase firestore instance (compat)

// State
let currentUserProfile = null;            // will hold the logged-in user's profile document
let selectedRequestDocId = null;          // currently selected appointment doc id (for details/actions)

// Search + Filter cache
let coordinatorCache = [];                // cache of coordinator's assigned appointments for filtering/searching

// DOM References
const registerPage = document.getElementById('registerPage');
const loginPage = document.getElementById('loginPage');
const studentDashboard = document.getElementById('studentDashboard');
const coordinatorDashboard = document.getElementById('coordinatorDashboard');
const studentMsg = document.getElementById('studentMsg');
const requestList = document.getElementById('requestList');
const facultySelect = document.getElementById('faculty');

// Popups & UI pieces
const successPopup = document.getElementById('successPopup');
const successLottie = document.getElementById('successLottie');
const successText = document.getElementById('successText');

const detailsPopup = document.getElementById('detailsPopup');
const rejectPopup = document.getElementById('rejectPopup');

// Search and Filter inputs (coordinator UI)
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

// Details Popup Elements (for showing student info when coordinator opens a request)
const d_name = document.getElementById('d_name');
const d_usn = document.getElementById('d_usn');
const d_email = document.getElementById('d_email');
const d_dept = document.getElementById('d_dept');
const d_branch = document.getElementById('d_branch');
const d_year = document.getElementById('d_year');
const d_purpose = document.getElementById('d_purpose');
const d_date_time = document.getElementById('d_date_time');
// ---------- Page visibility helpers ----------
// Simple helpers to show/hide the main pages and overlays.
// The design uses a single-page-app style where only one "page" div shows at a time.
function hideAllPages(){
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  document.querySelectorAll('.overlay').forEach(o=>o.style.display='none');
}
function showRegister(){ hideAllPages(); registerPage.style.display='block'; }
function showLogin(){ hideAllPages(); loginPage.style.display='block'; }
function showStudentDashboard(){ hideAllPages(); studentDashboard.style.display='block'; }
function showCoordinatorDashboard(){ hideAllPages(); coordinatorDashboard.style.display='block'; }


// ----------- Register ----------
// Toggle between student/coordinator fields in the registration form
function toggleRegisterForm(){
  let role = document.getElementById('regRole').value;
  document.getElementById('studentFields').style.display = role==='student' ? 'block' : 'none';
  document.getElementById('coordFields').style.display = role==='coordinator' ? 'block' : 'none';
}

// Register new user (uses Firebase Auth + Firestore to save profile)
// Note: This function intentionally matches your original logic and field names.
async function register(){
  try{
    let role = document.getElementById('regRole').value;
    let pass = (document.getElementById('regPass').value || "").trim();
    if(!pass) return alert("Enter a password");

    let email = role==='student'
      ? (document.getElementById('stuEmail').value || "").trim()
      : (document.getElementById('coEmail').value || "").trim();

    if(!email) return alert("Provide an email");

    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid;

    let profile = { role, email, uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

    if(role==='student'){
      // collect student-specific fields
      profile.name = document.getElementById('stuName').value.trim();
      profile.dept = document.getElementById('stuDept').value.trim();
      profile.branch = document.getElementById('stuBranch').value.trim();
      profile.year = document.getElementById('stuYear').value.trim();
      profile.userId = document.getElementById('stuUSN').value.trim();
    } else {
      // collect coordinator-specific fields
      profile.name = document.getElementById('coName').value.trim();
      profile.dept = document.getElementById('coDept').value.trim();
      profile.userId = document.getElementById('coUserId').value.trim();
    }

    // save profile in 'users' collection using uid as document id
    await db.collection('users').doc(uid).set(profile);
    alert("Registered successfully!");
    showLogin();

  }catch(err){
    alert("Registration error: " + err.message);
  }
}


// ----------- Login ----------
async function login(){
  try{
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    await auth.signInWithEmailAndPassword(email, pass); // firebase auth sign-in
  }catch(err){
    alert("Login failed: "+err.message);
  }
}


// ----------- Logout ----------
function logout(){
  auth.signOut();                     // firebase sign out
  currentUserProfile = null;          // clear local state
  selectedRequestDocId = null;
  hideAllPages();
  showLogin();
}


// ----------- Auth Routing (onAuthStateChanged) ----------
// This reacts to auth state changes and sets up snapshot listeners
let studentListenerUnsub = null;
let coordinatorListenerUnsub = null;
let coordinatorsListenerUnsub = null;

auth.onAuthStateChanged(async (user)=>{

  // remove previous realtime listeners (if any) to avoid leaks / duplicate handlers
  if(studentListenerUnsub) studentListenerUnsub();
  if(coordinatorListenerUnsub) coordinatorListenerUnsub();
  if(coordinatorsListenerUnsub) coordinatorsListenerUnsub();

  if(!user){
    // not logged in → show login page
    hideAllPages();
    showLogin();
    return;
  }

  // fetch user's profile document from Firestore
  const doc = await db.collection('users').doc(user.uid).get();
  if(!doc.exists) return alert("Profile missing.");

  currentUserProfile = doc.data();

  // keep a live list of all coordinators (for student dropdown)
  coordinatorsListenerUnsub = db.collection('users')
    .where('role','==','coordinator')
    .onSnapshot(snap => renderCoordinators(snap));

  // route based on role in profile
  if(currentUserProfile.role === "student"){
    showStudentDashboard();
    loadStudentDetails();

    // listen for this student's appointments
    studentListenerUnsub = db.collection('appointments')
      .where('studentUid','==', user.uid)
      .orderBy('createdAt','desc')
      .onSnapshot(snap => renderStudentAppointments(snap));

  } else {
    // coordinator: show coordinator dashboard and listen for appointments assigned to this coordinator
    showCoordinatorDashboard();

    coordinatorListenerUnsub = db.collection('appointments')
      .where('facultyUid','==', user.uid)
      .orderBy('date','asc')
      .onSnapshot(snap => renderCoordinatorRequests(snap));
  }
});
/* ---------- Student Helpers ---------- */

// populate student profile area and set min date for appointment date input
function loadStudentDetails(){
  document.getElementById('s_name').innerText = "Name: " + currentUserProfile.name;
  document.getElementById('s_email').innerText = "Email: " + currentUserProfile.email;
  document.getElementById('s_dept').innerText = "Dept: " + currentUserProfile.dept;
  document.getElementById('s_branch').innerText = "Branch: " + currentUserProfile.branch;
  document.getElementById('s_year').innerText = "Year: " + currentUserProfile.year;
  document.getElementById('s_usn').innerText = "USN: " + currentUserProfile.userId;

  // prevent selecting past dates
  document.getElementById('date').setAttribute("min", new Date().toISOString().split("T")[0]);
}

// fill the student-facing coordinator dropdown (keeps updated by snapshot listener)
function renderCoordinators(snap){
  facultySelect.innerHTML = '<option value="">Select Coordinator</option>';
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = `${d.name} (${d.dept})`;
    facultySelect.appendChild(opt);
  });
}

/* ---------- Submit Appointment ---------- */
// called by student when submitting an appointment request
async function submitAppointment(){
  const purpose = document.getElementById('purpose').value.trim();
  const facultyUid = facultySelect.value;
  const facultyName = facultySelect.options[facultySelect.selectedIndex]?.textContent;
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;

  if(!purpose || !facultyUid || !date || !time) return alert("Fill all fields");

  // add appointment doc to 'appointments' collection
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
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  showSuccess("Appointment Sent");
}

/* ---------- Student Apps List ---------- */
// renders student's own appointment list
function renderStudentAppointments(snap){
  studentMsg.innerHTML = "";
  if(snap.empty){
    studentMsg.innerHTML = "<p>No appointments yet.</p>";
    return;
  }

  snap.forEach(doc=>{
    const r = doc.data();
    const id = doc.id;

    // show withdraw button only when status is pending
    const withdrawBtn = r.status === "Pending"
      ? `<button class="btn small red" onclick="withdrawAppointment('${id}')">Withdraw</button>`
      : "";

    studentMsg.innerHTML += `
      <div class="request-card">
        <div>
          <p><b>Coordinator:</b> ${r.facultyName}</p>
          <p><b>Purpose:</b> ${r.purpose}</p>
          <p><b>Date:</b> ${r.date} <b>Time:</b> ${r.time}</p>
          <p><b>Status:</b> ${r.status}</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          ${badgeHTML(r.status)}
          ${withdrawBtn}
          <button class="btn small cancel" onclick="deleteAppointment('${id}')">Delete</button>
        </div>
      </div>
    `;
  });
}

/* ============================================================
   COORDINATOR — SEARCH + FILTER (FINAL WORKING VERSION)
   ============================================================ */

/*
  renderCoordinatorRequests(snap)
  - fills coordinatorCache[] with appointment objects
  - each object has r.id (doc id) and fields from Firestore
  - then calls renderCoordinatorFiltered() to apply search + status filter
*/
function renderCoordinatorRequests(snap){

  coordinatorCache = []; // reset cache
  snap.forEach(doc=>{
    let r = doc.data();
    r.id = doc.id;
    coordinatorCache.push(r);
  });

  renderCoordinatorFiltered(); // apply search/filter render
}

/*
  renderCoordinatorFiltered()
  - uses coordinatorCache (already loaded from snapshot)
  - applies searchInput text match and statusFilter selection
  - groups results by date and renders them
*/
function renderCoordinatorFiltered() {

  requestList.innerHTML = "";

  let search = searchInput?.value.toLowerCase() || "";
  let filter = statusFilter?.value || "all";

  const filtered = coordinatorCache.filter(r => {

    let matchSearch =
      r.studentName?.toLowerCase().includes(search) ||
      r.studentId?.toLowerCase().includes(search);

    let matchStatus =
      filter === "all" || r.status === filter;

    return matchSearch && matchStatus;
  });

  // 1️⃣ If nothing found
  if(filtered.length === 0){
    requestList.innerHTML = `<p style="color:#ddd; padding:10px;">No appointments found.</p>`;
    return;
  }

  // 2️⃣ Sort by status priority FIRST
  const priority = { "Pending": 1, "Rejected": 2, "Approved": 3 };
  filtered.sort((a, b) => {
    return (priority[a.status] || 99) - (priority[b.status] || 99);
  });

  // 3️⃣ Sort pending by oldest createdAt
  filtered.sort((a, b) => {
    if (a.status === "Pending" && b.status === "Pending") {
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    }
    return 0;
  });

  // 4️⃣ Display each item (NO DATE GROUPING ANYMORE)
  filtered.forEach(r => {

    requestList.innerHTML += `
      <div class="request-card">
        <div>
          <p><b>${r.studentName} (${r.studentId})</b></p>
          <p>${r.purpose}</p>
          <p><b>Date:</b> ${r.date || "—"}  <b>Time:</b> ${r.time || "—"}</p>
          <p><b>Status:</b> ${r.status}</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${badgeHTML(r.status)}
          <button class="btn small" onclick="openDetails('${r.id}')">View</button>
        </div>
      </div>
    `;
  });

}

/* ---------- Badge ---------- */
// small helper returning HTML badge for status (keeps UI consistent)
function badgeHTML(status){
  const s = (status || "Pending").toLowerCase();
  if(s==="approved") return `<span class="badge approved">Approved</span>`;
  if(s==="rejected") return `<span class="badge rejected">Rejected</span>`;
  if(s==="withdrawn") return `<span class="badge withdrawn">Withdrawn</span>`;
  return `<span class="badge pending">Pending</span>`;
}

/* ---------- DELETE / WITHDRAW ---------- */
// delete a Firestore appointment document
async function deleteAppointment(docId){
  await db.collection('appointments').doc(docId).delete();
  showSuccess("Deleted");
}

// mark appointment as withdrawn
async function withdrawAppointment(docId){
  await db.collection('appointments').doc(docId).update({
    status: "Withdrawn"
  });
  showSuccess("Withdrawn");
}

/* ---------- DETAILS POPUP ---------- */
// opens details popup for a specific appointment docId
async function openDetails(docId){
  selectedRequestDocId = docId;

  const snap = await db.collection('appointments').doc(docId).get();
  const req = snap.data();

  // also fetch student profile to display full details
  const stuSnap = await db.collection('users').doc(req.studentUid).get();
  const stu = stuSnap.data();

  // populate popup fields
  d_name.innerText = "Name: " + stu.name;
  d_usn.innerText = "USN: " + stu.userId;
  d_email.innerText = "Email: " + stu.email;
  d_dept.innerText = "Dept: " + stu.dept;
  d_branch.innerText = "Branch: " + stu.branch;
  d_year.innerText = "Year: " + stu.year;
  d_purpose.innerText = "Purpose: " + req.purpose;
  d_date_time.innerText = "Date & Time: " + req.date + " — " + req.time;

  // show the overlay
  detailsPopup.style.display = 'flex';
}

function closeDetailsPopup(){
  detailsPopup.style.display='none';
}

/* ---------- Approve ---------- */
async function approveRequest(){
  await db.collection('appointments').doc(selectedRequestDocId).update({
    status: "Approved"
  });
  closeDetailsPopup();
  showSuccess("Approved");
}

/* ---------- Reject ---------- */
function openRejectPopup(){
  // show suggestion popup; hide details to avoid stacking
  rejectPopup.style.display='flex';
  detailsPopup.style.display='none';
}

function closeRejectPopup(){
  rejectPopup.style.display='none';
}

async function submitSuggestion(){
  const d = document.getElementById('suggestDate').value;
  const t = document.getElementById('suggestTime').value;

  await db.collection('appointments').doc(selectedRequestDocId).update({
    status: "Rejected",
    suggestedDate: d,
    suggestedTime: t
  });

  closeRejectPopup();
  showSuccess("Suggestion Sent");
}

/* ---------- Success Popup ---------- */
function showSuccess(txt){
  successText.innerText = txt;
  successPopup.style.display='flex';
  successLottie.play();

  // auto-hide after 1s to keep UX snappy
  setTimeout(()=>{
    successLottie.stop();
    successPopup.style.display='none';
  },1000);
}

/* ---------- INIT ---------- */
// wire up search + filter inputs to re-render filtered list dynamically
searchInput?.addEventListener("input", renderCoordinatorFiltered);
statusFilter?.addEventListener("change", renderCoordinatorFiltered);

// start app on login page by default
hideAllPages();
showLogin();

// allow clicking overlay background to close popups
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click', (e)=>{
    if(e.target===o) o.style.display='none';
  });
});
/* click overlay to close */
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click', (e)=>{
    if(e.target===o){ 
      o.style.display='none'; 
    }
  });
});

function openCredits() {
  document.getElementById("creditPopup").style.display = "flex";
}

function closeCredits() {
  document.getElementById("creditPopup").style.display = "none";
}
