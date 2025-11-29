// script.js (debugged + fallback)
// load this after firebase is initialized

console.log("script.js loaded");

// Firebase compat references (same as your app)
const auth = firebase.auth();
const db = firebase.firestore();

// State
let currentUserProfile = null;
let selectedRequestDocId = null;

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

const d_name = document.getElementById('d_name');
const d_email = document.getElementById('d_email');
const d_dept = document.getElementById('d_dept');
const d_branch = document.getElementById('d_branch');
const d_year = document.getElementById('d_year');
const d_purpose = document.getElementById('d_purpose');
const d_date_time = document.getElementById('d_date_time');

function hideAllPages(){
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  document.querySelectorAll('.overlay').forEach(o=>o.style.display='none');
}
function showRegister(){ hideAllPages(); registerPage.style.display='block'; }
function showLogin(){ hideAllPages(); loginPage.style.display='block'; }
function showStudentDashboard(){ hideAllPages(); studentDashboard.style.display='block'; }
function showCoordinatorDashboard(){ hideAllPages(); coordinatorDashboard.style.display='block'; }

/* ---------- Register ---------- */
function toggleRegisterForm(){
  let role = document.getElementById('regRole').value;
  document.getElementById('studentFields').style.display = role==='student' ? 'block' : 'none';
  document.getElementById('coordFields').style.display = role==='coordinator' ? 'block' : 'none';
}

async function register(){
  try{
    let role = document.getElementById('regRole').value;
    let pass = (document.getElementById('regPass').value || "").trim();
    if(!pass) return alert("Enter a password");

    let email = role==='student'
      ? (document.getElementById('stuEmail').value || "").trim()
      : (document.getElementById('coEmail').value || "").trim();
    if(!email) return alert("Provide an email (used for login)");

    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid;

    let profile = { role, email, uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

    if(role==='student'){
      profile.name = (document.getElementById('stuName').value || "").trim();
      profile.dept = (document.getElementById('stuDept').value || "").trim();
      profile.branch = (document.getElementById('stuBranch').value || "").trim();
      profile.year = (document.getElementById('stuYear').value || "").trim();
      profile.userId = (document.getElementById('stuUSN').value || "").trim();
    } else {
      profile.name = (document.getElementById('coName').value || "").trim();
      profile.dept = (document.getElementById('coDept').value || "").trim();
      profile.userId = (document.getElementById('coUserId').value || "").trim()
    }

    await db.collection('users').doc(uid).set(profile);
    console.log("Registered profile saved", profile);
    alert("Registered! You can now login.");
    showLogin();
  }catch(err){
    console.error("Registration error:", err);
    alert("Registration error: " + (err.message || err));
  }
}

/* ---------- Login ---------- */
async function login(){
  try{
    const email = (document.getElementById('loginEmail').value || "").trim();
    const pass = (document.getElementById('loginPass').value || "").trim();
    if(!email||!pass) return alert("Fill email & password");
    await auth.signInWithEmailAndPassword(email, pass);
    console.log("login successful for", email);
    // routing handled in onAuthStateChanged
  }catch(err){
    console.error("Login failed:", err);
    alert("Login failed: "+(err.message||err));
  }
}

/* ---------- Logout ---------- */
function logout(){
  auth.signOut();
  currentUserProfile = null;
  selectedRequestDocId = null;
  hideAllPages();
  showLogin();
}

/* ---------- Auth State & routing ---------- */
let studentListenerUnsub = null;
let coordinatorListenerUnsub = null;
let coordinatorsListenerUnsub = null;

auth.onAuthStateChanged(async (user)=>{
  // clear existing listeners
  if(studentListenerUnsub){ studentListenerUnsub(); studentListenerUnsub = null; }
  if(coordinatorListenerUnsub){ coordinatorListenerUnsub(); coordinatorListenerUnsub = null; }
  if(coordinatorsListenerUnsub){ coordinatorsListenerUnsub(); coordinatorsListenerUnsub = null; }

  if(user){
    console.log("Auth user:", user.uid);
    const doc = await db.collection('users').doc(user.uid).get();
    if(!doc.exists){
      await auth.signOut();
      return alert("Profile missing — please register again.");
    }
    currentUserProfile = doc.data();
    console.log("Loaded profile:", currentUserProfile);

    // live coordinators dropdown (real-time)
    coordinatorsListenerUnsub = db.collection('users')
      .where('role','==','coordinator')
      .onSnapshot(snap => {
        renderCoordinators(snap);
      }, err => {
        console.error("Coordinator listener error:", err);
      });

    if(currentUserProfile.role === 'student'){
      showStudentDashboard();
      loadStudentDetails();

      // student appointments (real-time)
      studentListenerUnsub = db.collection('appointments')
        .where('studentUid','==', user.uid)
        .orderBy('createdAt','desc')
        .onSnapshot(snap => {
          console.log("student appointments snapshot count:", snap.size);
          renderStudentAppointments(snap);

          // fallback if snapshot empty: fetch all appointments for debugging
          if(snap.empty){
            console.warn("student snapshot empty — trying fallback fetch of appointments for this userId and by studentName");
            debug_fallback_fetch_for_student(user.uid, currentUserProfile);
          }
        }, err => {
          console.error("student appointments snap error:", err);
          // try fallback fetch on error
          debug_fallback_fetch_for_student(user.uid, currentUserProfile);
        });

    } else {
      showCoordinatorDashboard();

      coordinatorListenerUnsub = db.collection('appointments')
        .where('facultyUid','==', user.uid)
        .orderBy('date','asc')
        .onSnapshot(snap => {
          console.log("coordinator appointments snapshot count:", snap.size);
          renderCoordinatorRequests(snap);

          if(snap.empty){
            console.warn("coordinator snapshot empty — trying fallback fetch for this coordinator UID");
            debug_fallback_fetch_for_coordinator(user.uid, currentUserProfile);
          }
        }, err => {
          console.error("coordinator appointments snap error:", err);
          debug_fallback_fetch_for_coordinator(user.uid, currentUserProfile);
        });
    }
  } else {
    console.log("No auth user");
    currentUserProfile = null;
    hideAllPages();
    showLogin();
  }
});

/* ---------- Helpers and data functions ---------- */
function loadStudentDetails(){
  document.getElementById('s_name').innerText = "Name: " + (currentUserProfile.name || "");
  document.getElementById('s_email').innerText = "Email: " + (currentUserProfile.email || "");
  document.getElementById('s_dept').innerText = "Dept: " + (currentUserProfile.dept || "");
  document.getElementById('s_branch').innerText = "Branch: " + (currentUserProfile.branch || "");
  document.getElementById('s_year').innerText = "Year: " + (currentUserProfile.year || "");
  document.getElementById('s_usn').innerText = "USN: " + (currentUserProfile.userId || "");
  const today = new Date().toISOString().split("T")[0];
  document.getElementById('date').setAttribute("min", today);
}

/* Render coordinator dropdown from snapshot */
function renderCoordinators(snap){
  if(!facultySelect) return;
  facultySelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = "";
  placeholder.textContent = "Select Coordinator";
  facultySelect.appendChild(placeholder);

  snap.forEach(doc => {
    const d = doc.data();
    const opt = document.createElement('option');
    opt.value = doc.id; // UID
    opt.textContent = `${d.name || '(no-name)'} (${d.dept || ''})`;
    facultySelect.appendChild(opt);
  });
  console.log("Coordinators rendered:", snap.size);
}

/* Submit appointment */
async function submitAppointment(){
  if(!auth.currentUser || !currentUserProfile) return alert("You must be logged in as a student");
  const purpose = (document.getElementById('purpose').value || "").trim();
  const facultyUid = facultySelect.value;
  const facultyName = facultySelect.options[facultySelect.selectedIndex]?.textContent || "";
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;
  if(!purpose||!facultyUid||!date||!time) return alert("Fill all fields and select a coordinator");
  if(date < new Date().toISOString().split("T")[0]) return alert("Past date not allowed!");

  try{
    const docRef = await db.collection('appointments').add({
      studentUid: auth.currentUser.uid,
      studentId: currentUserProfile.userId || "",
      studentName: currentUserProfile.name || "",
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
    console.log("Appointment created, docId:", docRef.id);
    document.getElementById('purpose').value = '';
    document.getElementById('time').value = '';
    showSuccess("Appointment Sent");
  }catch(err){
    console.error("Submit appointment error:", err);
    alert("Failed to send appointment: "+(err.message||err));
  }
}

/* Render student appointments */
function renderStudentAppointments(snap){
  studentMsg.innerHTML = "";
  if(!snap || snap.empty){
    studentMsg.innerHTML = `<p style="color:#ddd">No appointments yet.</p>`;
    return;
  }
  snap.forEach(doc=>{
    const r = doc.data();
    const id = doc.id;
    const suggested = r.status==="Rejected" && r.suggestedDate ? `<p><b>Suggested:</b> ${r.suggestedDate} — ${r.suggestedTime}</p>` : '';
    const withdrawBtn = r.status==="Pending" ? `<button class="btn small red" onclick="withdrawAppointment('${id}')">Withdraw</button>` : '';
    studentMsg.innerHTML += `
      <div class="request-card">
        <div>
          <p><b>Coordinator:</b> ${r.facultyName}</p>
          <p><b>Purpose:</b> ${r.purpose}</p>
          <p><b>Date:</b> ${r.date} &nbsp; <b>Time:</b> ${r.time}</p>
          <p><b>Status:</b> ${r.status}</p>
          ${suggested}
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

/* Render coordinator requests */
function renderCoordinatorRequests(snap){
  requestList.innerHTML = "";
  if(!snap || snap.empty){
    requestList.innerHTML = `<p style="color:#ddd">No assigned appointments.</p>`;
    return;
  }

  // group by date
  const groups = {};
  snap.forEach(doc=>{
    const r = doc.data();
    const id = doc.id;
    const d = r.date || 'No-Date';
    groups[d] = groups[d] || [];
    groups[d].push({ id, data: r });
  });

  const today = new Date().toISOString().split("T")[0];
  const dates = Object.keys(groups).sort((a,b)=>{
    if(a===today) return -1;
    if(b===today) return 1;
    return a < b ? -1 : 1;
  });

  dates.forEach(d=>{
    requestList.innerHTML += `<h4 style="color:white;margin-top:8px">${d===today?("Today ("+d+")"):d}</h4>`;
    groups[d].forEach(item=>{
      const r = item.data;
      const id = item.id;
      requestList.innerHTML += `
        <div class="request-card">
          <div>
            <p><b>${r.studentName || r.studentId || 'Student'}</b></p>
            <p>${r.purpose}</p>
            <p><b>Time:</b> ${r.time} &nbsp; <b>Status:</b> ${r.status}</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${badgeHTML(r.status)}
            <button class="btn small" onclick="openDetails('${id}')">View</button>
          </div>
        </div>
      `;
    });
  });
}

/* badge helper */
function badgeHTML(status){
  if(!status) status = "Pending";
  const s = status.toLowerCase();
  if(s==="approved") return `<span class="badge approved">Approved</span>`;
  if(s==="rejected") return `<span class="badge rejected">Rejected</span>`;
  if(s==="withdrawn") return `<span class="badge withdrawn">Withdrawn</span>`;
  return `<span class="badge pending">Pending</span>`;
}

/* Delete */
async function deleteAppointment(docId){
  if(!confirm("Delete this appointment?")) return;
  try{ await db.collection('appointments').doc(docId).delete(); showSuccess("Deleted"); }
  catch(err){ console.error("Delete failed:", err); alert("Delete failed: "+(err.message||err)); }
}

/* Withdraw */
async function withdrawAppointment(docId){
  try{ await db.collection('appointments').doc(docId).update({ status: "Withdrawn" }); showSuccess("Withdrawn"); }
  catch(err){ console.error("Withdraw failed:", err); alert("Withdraw failed: "+(err.message||err)); }
}

/* Details popup */
async function openDetails(docId){
  selectedRequestDocId = docId;
  const snap = await db.collection('appointments').doc(docId).get();
  if(!snap.exists) return alert("Request not found");
  const req = snap.data();
  const stuDoc = req.studentUid ? await db.collection('users').doc(req.studentUid).get() : null;
  const stu = stuDoc && stuDoc.exists ? stuDoc.data() : {};

  d_name.innerText = "Name: " + (stu.name || req.studentName || req.studentId || '');
  d_email.innerText = "Email: " + (stu.email || '');
  d_dept.innerText = "Dept: " + (stu.dept || '');
  d_branch.innerText = "Branch: " + (stu.branch || '');
  d_year.innerText = "Year: " + (stu.year || '');
  d_purpose.innerText = "Purpose: " + req.purpose;
  d_date_time.innerText = "Date & Time: " + req.date + " — " + req.time;

  detailsPopup.style.display = 'flex';
}
function closeDetailsPopup(){ detailsPopup.style.display='none'; }

async function approveRequest(){
  if(!selectedRequestDocId) return;
  try{ await db.collection('appointments').doc(selectedRequestDocId).update({ status: "Approved" }); closeDetailsPopup(); showSuccess("Approved"); }
  catch(err){ console.error("Approve failed:", err); alert("Approve failed: "+(err.message||err)); }
}

function openRejectPopup(){
  if(!selectedRequestDocId) return;
  document.getElementById('suggestDate').setAttribute('min', new Date().toISOString().split('T')[0]);
  document.getElementById('suggestDate').value = '';
  document.getElementById('suggestTime').value = '';
  detailsPopup.style.display='none';
  rejectPopup.style.display='flex';
}
function closeRejectPopup(){ rejectPopup.style.display='none'; }

async function submitSuggestion(){
  const sdate = document.getElementById('suggestDate').value;
  const stime = document.getElementById('suggestTime').value;
  if(!sdate || !stime) return alert("Fill both fields");
  try{
    await db.collection('appointments').doc(selectedRequestDocId).update({
      status: "Rejected",
      suggestedDate: sdate,
      suggestedTime: stime
    });
    closeRejectPopup();
    showSuccess("Suggestion Sent");
  }catch(err){ console.error("Suggestion failed:", err); alert("Suggestion failed: "+(err.message||err)); }
}

/* Lottie Success */
function showSuccess(txt){
  if(successText) successText.innerText = txt;
  if(successPopup) successPopup.style.display='flex';
  try{ successLottie.play(); }catch(e){}
  setTimeout(()=>{
    try{ successLottie.stop(); }catch(e){}
    if(successPopup) successPopup.style.display='none';
  },1000);
}

/* ---------- Debug fallbacks (help track mismatches) ---------- */
async function debug_fallback_fetch_for_student(uid, profile){
  try{
    console.log("fallback: fetching appointments with studentUid==", uid);
    const snap = await db.collection('appointments').where('studentUid','==', uid).orderBy('createdAt','desc').get();
    console.log("fallback query count (studentUid):", snap.size);
    if(!snap.empty){ return renderStudentAppointments(snap); }

    // next fallback: try by studentId or studentName
    if(profile && profile.userId){
      console.log("fallback: trying studentId==", profile.userId);
      const byId = await db.collection('appointments').where('studentId','==', profile.userId).get();
      console.log("fallback by studentId count:", byId.size);
      if(!byId.empty) return renderStudentAppointments(byId);
    }
    if(profile && profile.name){
      console.log("fallback: trying studentName==", profile.name);
      const byName = await db.collection('appointments').where('studentName','==', profile.name).get();
      console.log("fallback by studentName count:", byName.size);
      if(!byName.empty) return renderStudentAppointments(byName);
    }

    console.warn("No appointments found in fallbacks.");
  }catch(err){
    console.error("fallback fetch error (student):", err);
  }
}

async function debug_fallback_fetch_for_coordinator(uid, profile){
  try{
    console.log("fallback: fetching appointments with facultyUid==", uid);
    const snap = await db.collection('appointments').where('facultyUid','==', uid).orderBy('date','asc').get();
    console.log("fallback query count (facultyUid):", snap.size);
    if(!snap.empty){ return renderCoordinatorRequests(snap); }

    // try by facultyName
    if(profile && profile.name){
      console.log("fallback: trying facultyName==", profile.name);
      const byName = await db.collection('appointments').where('facultyName','==', profile.name).get();
      console.log("fallback by facultyName count:", byName.size);
      if(!byName.empty) return renderCoordinatorRequests(byName);
    }

    console.warn("No coordinator appointments found in fallbacks.");
  }catch(err){
    console.error("fallback fetch error (coordinator):", err);
  }
}

/* Initialize UI */
hideAllPages();
showLogin();

/* click overlay to close */
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click', (e)=>{ if(e.target===o){ o.style.display='none'; }});
});


