import React, { useState, useMemo, useEffect } from "react";

// ─── SUPER-ADMIN credentials (hardcoded, fixed) ───────────────────────────────
const SUPER_ADMIN_CODE = "SUPERADMIN-2025";
const SUPER_ADMIN_PASS = "EcoleHub#Admin";

// ─── Storage ──────────────────────────────────────────────────────────────────
const SCHOOLS_DB_KEY  = "schools_saas_db";
const STUDENTS_DB_KEY = "schools_students_db";
const DIRECTORS_DB_KEY = "schools_directors_db";

function getSchools(){try{return JSON.parse(localStorage.getItem(SCHOOLS_DB_KEY)||"{}");}catch{return{};}}
function saveSchool(code,data){const db=getSchools();db[code]=data;localStorage.setItem(SCHOOLS_DB_KEY,JSON.stringify(db));}
function getStudents(sc){try{const a=JSON.parse(localStorage.getItem(STUDENTS_DB_KEY)||"{}");return a[sc]||[];}catch{return[];}}
function saveStudents(sc,list){const a=JSON.parse(localStorage.getItem(STUDENTS_DB_KEY)||"{}");a[sc]=list;localStorage.setItem(STUDENTS_DB_KEY,JSON.stringify(a));}
function getDirectors(){try{return JSON.parse(localStorage.getItem(DIRECTORS_DB_KEY)||"{}");}catch{return{};}}
function saveDirectors(data){localStorage.setItem(DIRECTORS_DB_KEY,JSON.stringify(data));}
function getDirectorFor(code){return getDirectors()[code]||{nom:"",prenom:"",tel:"",email:""};}
function setDirectorFor(code,info){const d=getDirectors();d[code]=info;saveDirectors(d);}
const RESULTS_DB_KEY="schools_results_db";
function getResults(sc){try{const a=JSON.parse(localStorage.getItem(RESULTS_DB_KEY)||"{}");return a[sc]||{};}catch{return{};}}
function saveResults(sc,data){const a=JSON.parse(localStorage.getItem(RESULTS_DB_KEY)||"{}");a[sc]=data;localStorage.setItem(RESULTS_DB_KEY,JSON.stringify(a));}

function generateCode(n){return n.slice(0,3).toUpperCase().replace(/\s/g,"X")+"-"+Math.floor(1000+Math.random()*9000);}
function genId(){return "ELV-"+Math.floor(10000+Math.random()*90000);}

// ─── Parents storage ──────────────────────────────────────────────────────────
const PARENTS_DB_KEY  = "ecole_parents_db";
const SMS_NOTIFS_KEY  = "sms_notifs";

function getParents(){try{return JSON.parse(localStorage.getItem(PARENTS_DB_KEY)||"{}");}catch{return{};}}
function saveParent(pid,data){const db=getParents();db[pid]=data;localStorage.setItem(PARENTS_DB_KEY,JSON.stringify(db));}
function genParentId(){return "PAR-"+Date.now()+"-"+Math.floor(Math.random()*9999);}
function genSmsCode(){
  // 6-digit unique code — verify not already used
  let code,db,used=true,attempts=0;
  const parents=getParents();
  const usedCodes=new Set(Object.values(parents).map(p=>p.smsCode).filter(Boolean));
  while(used&&attempts<100){
    code=String(Math.floor(100000+Math.random()*900000));
    used=usedCodes.has(code);
    attempts++;
  }
  return code||String(Math.floor(100000+Math.random()*900000));
}

function getSmsNotifs(schoolName){
  try{return JSON.parse(localStorage.getItem(SMS_NOTIFS_KEY)||"[]").filter(n=>n.school===schoolName);}
  catch{return[];}
}
function addSmsNotif(notif){
  try{
    const all=JSON.parse(localStorage.getItem(SMS_NOTIFS_KEY)||"[]");
    all.push({...notif,read:false,time:new Date().toISOString()});
    localStorage.setItem(SMS_NOTIFS_KEY,JSON.stringify(all));
  }catch{}
}
function markSmsNotifsRead(schoolName){
  try{
    const all=JSON.parse(localStorage.getItem(SMS_NOTIFS_KEY)||"[]");
    const updated=all.map(n=>n.school===schoolName?{...n,read:true}:n);
    localStorage.setItem(SMS_NOTIFS_KEY,JSON.stringify(updated));
  }catch{}
}

// Create or update parent account when a student is enrolled
// Returns array of {isNew, tel, nomParent, code, role} for new accounts
function upsertParentForStudent(student, schoolData){
  const newAccounts=[];
  const db=getParents();

  const process=(tel,prenom,nom,role)=>{
    if(!tel||!tel.trim()) return;
    const telClean=tel.trim();
    // Find existing parent with same phone + same school
    const existing=Object.values(db).find(p=>
      p.tel===telClean && p.schoolCode===schoolData.code
    );
    if(existing){
      // Just link the new student if not already linked
      if(!existing.linkedStudentIds.includes(student.id)){
        existing.linkedStudentIds=[...existing.linkedStudentIds,student.id];
        saveParent(existing.id,existing);
      }
      // No new SMS needed — account already exists
    } else {
      // Create brand-new parent account with unique code
      const code=genSmsCode();
      const pid=genParentId();
      const nomParent=[prenom,nom].filter(Boolean).join(" ").trim()||"Parent";
      const pdata={
        id:pid,
        nomComplet:nomParent,
        tel:telClean,
        schoolName:schoolData.name,
        schoolCode:schoolData.code,
        pays:"",
        password:"",          // set on first login
        smsCode:code,
        codeUsed:false,
        linkedStudentIds:[student.id],
        createdAt:new Date().toISOString()
      };
      saveParent(pid,pdata);
      // Log SMS notification
      addSmsNotif({
        tel:telClean,
        studentName:`${student.prenom} ${student.nom}`,
        classe:student.classe||"",
        smsCode:code,
        nomParent,
        role,
        school:schoolData.name,
        schoolCode:schoolData.code,
      });
      newAccounts.push({isNew:true,tel:telClean,nomParent,smsCode:code,studentName:`${student.prenom} ${student.nom}`,classe:student.classe||"",role});
    }
  };

  process(student.pere?.tel, student.pere?.prenom, student.pere?.nom, "Père");
  process(student.mere?.tel, student.mere?.prenom, student.mere?.nom, "Mère");
  return newAccounts; // array (empty if all parents already had accounts)
}

// Login: match tel + schoolName + smsCode, then check/set password
function findParentLogin(nom, pays, schoolName, tel, password, smsCode){
  if(!tel||!schoolName||!smsCode||!password) return {error:"Remplissez tous les champs."};
  const db=getParents();
  // Match on tel + school + code (case-insensitive school name)
  const p=Object.values(db).find(p=>
    p.tel===tel.trim() &&
    p.schoolName.toLowerCase()===schoolName.trim().toLowerCase() &&
    p.smsCode===smsCode.trim()
  );
  if(!p) return {error:"Code SMS, numéro ou école incorrects."};
  if(!p.password){
    // First login — register name, pays, password
    if(password.length<4) return {error:"Mot de passe trop court (min. 4 caractères)."};
    p.nomComplet = nom.trim()||p.nomComplet;
    p.pays       = pays.trim();
    p.password   = password;
    p.codeUsed   = true;
    saveParent(p.id,p);
    return {parent:p};
  }
  // Subsequent login — check password only (don't verify name/pays to be flexible)
  if(p.password!==password) return {error:"Mot de passe incorrect."};
  return {parent:p};
}

// ─── Tokens ───────────────────────────────────────────────────────────────────
const c={navy:"#0A1628",navyMid:"#112240",navyLight:"#1B3A6B",gold:"#F4C542",goldLight:"#FFD97D",white:"#FFFFFF",muted:"#8892B0",success:"#4ECDC4",red:"#FF6B6B",purple:"#A78BFA",orange:"#FDBA74"};

// ─── Matières par système ─────────────────────────────────────────────────────
const MATIERES_FRANCAISE=[
  {key:"bio",  label:"Biologie",   icon:"🌿",color:"#86EFAC"},
  {key:"chim", label:"Chimie",     icon:"⚗️", color:"#67E8F9"},
  {key:"phys", label:"Physique",   icon:"⚡", color:"#FDE047"},
  {key:"math", label:"Maths",      icon:"📐", color:"#74C0FC"},
  {key:"fr",   label:"Français",   icon:"📖", color:"#F9A8D4"},
  {key:"hist", label:"Histoire",   icon:"📜", color:"#FCA5A5"},
  {key:"geo",  label:"Géographie", icon:"🌍", color:"#6EE7B7"},
  {key:"ecm",  label:"ECM",        icon:"⚖️", color:"#C4B5FD"},
];
const MATIERES_FRANCO_ARABE=[
  {key:"tarbiya",   label:"التربية الإسلامية",icon:"📿",color:"#C4B5FD",rtl:true},
  {key:"lugha",     label:"اللغة العربية",    icon:"✍️", color:"#A78BFA",rtl:true},
  {key:"inchaa",    label:"الإنشاء والتعبير", icon:"📝",color:"#818CF8",rtl:true},
  {key:"tarikh",    label:"التاريخ",          icon:"📜",color:"#FCA5A5",rtl:true},
  {key:"jughrafia", label:"الجغرافيا",        icon:"🌍",color:"#6EE7B7",rtl:true},
  {key:"bio",  label:"Biologie",   icon:"🌿",color:"#86EFAC"},
  {key:"chim", label:"Chimie",     icon:"⚗️", color:"#67E8F9"},
  {key:"phys", label:"Physique",   icon:"⚡", color:"#FDE047"},
  {key:"math", label:"Maths",      icon:"📐", color:"#74C0FC"},
  {key:"fr",   label:"Français",   icon:"📖", color:"#F9A8D4"},
];
function getMatieres(langue,classLevel){
  if(classLevel==="college"&&langue==="franco-arabe") return MATIERES_FRANCO_ARABE;
  return MATIERES_FRANCAISE;
}

// ─── Classes ─────────────────────────────────────────────────────────────────
const LEVELS=[
  {id:"maternelle",label:"Maternelle",icon:"🌱",ages:"3–6 ans",  classes:["Petite Section","Moyenne Section","Grande Section"]},
  {id:"primaire",  label:"Primaire",  icon:"📚",ages:"6–12 ans", classes:["1ère Année","2ème Année","3ème Année","4ème Année","5ème Année","6ème Année"]},
  {id:"college",   label:"Collège",   icon:"🏫",ages:"12–16 ans",classes:["7ème","8ème","9ème","10ème"]},
  {id:"lycee",     label:"Lycée",     icon:"🎓",ages:"16–19 ans",classes:["11ème","12ème","Terminale"]},
];
const MODULE_MAP={maternelle:[{icon:"🎨",title:"Activités",count:"Éveil & créativité"},{icon:"📋",title:"Présences",count:"Gestion quotidienne"}],primaire:[{icon:"📝",title:"Bulletins",count:"Notes & évaluations"},{icon:"📅",title:"EDT",count:"Planning hebdo"},{icon:"📋",title:"Présences",count:"Assiduité"}],college:[{icon:"📊",title:"Notes",count:"Par matière"},{icon:"📅",title:"EDT",count:"Emploi du temps"},{icon:"💬",title:"Messagerie",count:"Élèves & parents"}],lycee:[{icon:"🏆",title:"Résultats",count:"Examens & bac"},{icon:"📅",title:"Planning",count:"Cours & révisions"},{icon:"🎯",title:"Orientation",count:"Parcours & vœux"}]};

const SAMPLE=[
  {prenom:"Amara",nom:"Diallo",niveau:"primaire",classe:"4ème Année",dateNaissance:"2014-03-12",genre:"F",statut:"actif",noteCours:14,noteEval:15,noteCompo:14,paiement:"payé",montant:50000,pere:{prenom:"Mamadou",nom:"Diallo",fonction:"Ingénieur",tel:"06 11 22 33 44"},mere:{prenom:"Fatoumata",nom:"Diallo",profession:"Médecin",tel:"06 11 22 33 55"}},
  {prenom:"Lucas",nom:"Martin",niveau:"college",classe:"7ème",dateNaissance:"2011-07-08",genre:"M",statut:"actif",noteCours:12,noteEval:11,noteCompo:13,paiement:"partiel",montant:25000,pere:{prenom:"Pierre",nom:"Martin",fonction:"Enseignant",tel:"06 55 44 33 22"},mere:{prenom:"Claire",nom:"Martin",profession:"Infirmière",tel:"06 55 44 33 11"}},
  {prenom:"Sofia",nom:"Benzara",niveau:"lycee",classe:"11ème",dateNaissance:"2009-11-20",genre:"F",statut:"actif",noteCours:17,noteEval:16,noteCompo:16,paiement:"payé",montant:75000,pere:{prenom:"Karim",nom:"Benzara",fonction:"Architecte",tel:"06 77 88 99 00"},mere:{prenom:"Nadia",nom:"Benzara",profession:"Comptable",tel:"06 77 88 99 11"}},
  {prenom:"Jade",nom:"Moreau",niveau:"lycee",classe:"12ème",dateNaissance:"2008-02-14",genre:"F",statut:"actif",noteCours:18,noteEval:17,noteCompo:19,paiement:"payé",montant:75000,pere:{prenom:"François",nom:"Moreau",fonction:"Directeur",tel:"06 66 77 88 99"},mere:{prenom:"Isabelle",nom:"Moreau",profession:"Avocate",tel:"06 66 77 88 00"}},
  {prenom:"Adam",nom:"Hamidi",niveau:"primaire",classe:"1ère Année",dateNaissance:"2017-06-30",genre:"M",statut:"actif",noteCours:13,noteEval:14,noteCompo:13,paiement:"partiel",montant:20000,pere:{prenom:"Yacine",nom:"Hamidi",fonction:"Chauffeur",tel:"06 88 99 00 11"},mere:{prenom:"Amina",nom:"Hamidi",profession:"Coiffeuse",tel:"06 88 99 00 22"}},
];

function calcMoyenne(s){const v=[s.noteCours,s.noteEval,s.noteCompo].filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
function mention(n){if(n===null||n===undefined)return{label:"–",color:c.muted,rgb:"136,146,176"};if(n>=16)return{label:"Très Bien",color:"#4ECDC4",rgb:"78,205,196"};if(n>=14)return{label:"Bien",color:"#74C0FC",rgb:"116,192,252"};if(n>=12)return{label:"Assez Bien",color:c.gold,rgb:"244,197,66"};if(n>=10)return{label:"Passable",color:c.muted,rgb:"136,146,176"};return{label:"Insuffisant",color:c.red,rgb:"255,107,107"};}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:${c.navy};color:${c.white};min-height:100vh}
  .app-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden}
  .bg-orb{position:fixed;border-radius:50%;filter:blur(80px);opacity:.15;pointer-events:none}
  @keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:none;opacity:1}}
  .card{background:${c.navyMid};border:1px solid rgba(244,197,66,.18);border-radius:20px;padding:44px 40px;width:100%;max-width:480px;z-index:1;animation:cardIn .5s cubic-bezier(.22,1,.36,1) both}
  .logo-mark{display:flex;align-items:center;gap:10px;margin-bottom:32px}
  .logo-icon{width:38px;height:38px;background:${c.gold};border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:20px}
  .logo-text{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;letter-spacing:.02em}
  .logo-text span{color:${c.gold}}
  h1{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;line-height:1.2;margin-bottom:6px}
  .subtitle{color:${c.muted};font-size:13px;margin-bottom:28px}
  label{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${c.muted};margin-bottom:6px}
  .input-wrap{position:relative;margin-bottom:18px}
  input[type="text"],input[type="password"],input[type="date"],input[type="number"],input[type="email"],select,textarea{width:100%;padding:13px 15px;background:${c.navy};border:1.5px solid rgba(136,146,176,.2);border-radius:10px;color:${c.white};font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s}
  input:focus,select:focus,textarea:focus{border-color:${c.gold}}
  input::placeholder,textarea::placeholder{color:rgba(136,146,176,.45)}
  select option{background:${c.navyMid}}
  .btn-primary{width:100%;padding:14px;background:${c.gold};color:${c.navy};border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:.15s;margin-top:6px}
  .btn-primary:hover{background:${c.goldLight};transform:translateY(-1px);box-shadow:0 8px 24px rgba(244,197,66,.25)}
  .btn-secondary{background:transparent;color:${c.muted};border:1.5px solid rgba(136,146,176,.25);border-radius:10px;padding:11px 20px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:.15s}
  .btn-secondary:hover{border-color:${c.gold};color:${c.gold}}
  .btn-icon{background:transparent;border:none;cursor:pointer;padding:5px 7px;border-radius:7px;font-size:14px;transition:.15s;color:${c.muted}}
  .btn-icon:hover{background:rgba(244,197,66,.12);color:${c.gold}}
  .step-indicator{display:flex;gap:6px;margin-bottom:28px}
  .step-dot{height:4px;border-radius:2px;flex:1;background:rgba(136,146,176,.2);transition:.3s}
  .step-dot.active{background:${c.gold}} .step-dot.done{background:${c.success}}
  .choice-grid{display:grid;gap:12px;margin-bottom:24px}
  .choice-card{padding:18px 20px;background:${c.navy};border:2px solid rgba(136,146,176,.15);border-radius:13px;cursor:pointer;transition:.2s;display:flex;align-items:center;gap:14px}
  .choice-card:hover{border-color:rgba(244,197,66,.4);background:rgba(244,197,66,.04)}
  .choice-card.selected{border-color:${c.gold};background:rgba(244,197,66,.08)}
  .choice-icon{width:42px;height:42px;border-radius:9px;background:rgba(244,197,66,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
  .choice-card.selected .choice-icon{background:rgba(244,197,66,.22)}
  .choice-label{font-weight:600;font-size:14px} .choice-desc{font-size:12px;color:${c.muted};margin-top:2px}
  .checkmark{margin-left:auto;width:19px;height:19px;border-radius:50%;border:2px solid rgba(136,146,176,.3);display:flex;align-items:center;justify-content:center;font-size:10px;transition:.2s;flex-shrink:0}
  .choice-card.selected .checkmark{background:${c.gold};border-color:${c.gold};color:${c.navy}}
  .code-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(244,197,66,.1);border:1px solid rgba(244,197,66,.28);border-radius:8px;padding:9px 15px;font-size:13px;color:${c.gold};font-weight:600;margin-bottom:24px;letter-spacing:.05em}
  .btn-row{display:flex;gap:10px;margin-top:6px}
  .error-msg{color:${c.red};font-size:12px;margin-top:6px;font-weight:500}
  .divider{height:1px;background:rgba(136,146,176,.1);margin:20px 0}
  .tag{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
  .tag-public{background:rgba(78,205,196,.14);color:${c.success}} .tag-private{background:rgba(244,197,66,.14);color:${c.gold}}
  .tag-actif{background:rgba(78,205,196,.14);color:${c.success}} .tag-inactif{background:rgba(255,107,107,.14);color:${c.red}}
  /* DASHBOARD */
  .dash-shell{display:flex;min-height:100vh;width:100%;max-width:1500px;z-index:1;animation:cardIn .4s cubic-bezier(.22,1,.36,1) both}
  .sidebar{width:200px;flex-shrink:0;background:${c.navyMid};border-right:1px solid rgba(244,197,66,.1);padding:20px 0;display:flex;flex-direction:column}
  .sidebar-logo{display:flex;align-items:center;gap:8px;padding:0 14px 18px;border-bottom:1px solid rgba(136,146,176,.1);margin-bottom:8px}
  .nav-item{display:flex;align-items:center;gap:9px;padding:10px 14px;cursor:pointer;font-size:12.5px;font-weight:500;color:${c.muted};transition:.15s;border-left:3px solid transparent;white-space:nowrap}
  .nav-item:hover{color:${c.white};background:rgba(244,197,66,.06)}
  .nav-item.active{color:${c.gold};background:rgba(244,197,66,.08);border-left-color:${c.gold}}
  .nav-icon{font-size:15px;width:18px;text-align:center}
  .sidebar-bottom{margin-top:auto;padding:14px 18px;border-top:1px solid rgba(136,146,176,.1)}
  .dash-main{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px 28px}
  .dash-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:12px}
  .school-nm{font-family:'Playfair Display',serif;font-size:18px;font-weight:900}
  .school-sub{font-size:12px;color:${c.muted};display:flex;gap:8px;align-items:center;margin-top:3px}
  .school-ava{width:44px;height:44px;border-radius:11px;background:${c.gold};display:flex;align-items:center;justify-content:center;font-size:20px}
  .stats-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
  .stat-tile{background:${c.navyMid};border:1px solid rgba(244,197,66,.1);border-radius:13px;padding:15px 14px}
  .stat-val{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;color:${c.gold}}
  .stat-lbl{font-size:11px;color:${c.muted};margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
  .section-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px}
  .section-title{font-family:'Playfair Display',serif;font-size:17px;font-weight:700}
  .filter-bar{display:flex;gap:9px;margin-bottom:14px;flex-wrap:wrap}
  .search-input{flex:1;min-width:160px;padding:9px 13px;background:${c.navyMid};border:1.5px solid rgba(136,146,176,.18);border-radius:9px;color:${c.white};font-family:'DM Sans',sans-serif;font-size:13px;outline:none;transition:.2s}
  .search-input:focus{border-color:${c.gold}} .search-input::placeholder{color:rgba(136,146,176,.45)}
  .filter-sel{padding:9px 13px;background:${c.navyMid};border:1.5px solid rgba(136,146,176,.18);border-radius:9px;color:${c.white};font-family:'DM Sans',sans-serif;font-size:13px;outline:none;cursor:pointer}
  .filter-sel:focus{border-color:${c.gold}}
  .level-pill{display:inline-block;padding:3px 11px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(244,197,66,.1);border:1px solid rgba(244,197,66,.22);color:${c.gold}}
  .levels-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px}
  .modules-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:13px}
  .module-card{background:${c.navyMid};border:1px solid rgba(244,197,66,.1);border-radius:13px;padding:18px 16px;transition:.2s;cursor:pointer}
  .module-card:hover{transform:translateY(-2px);border-color:rgba(244,197,66,.3);box-shadow:0 10px 28px rgba(0,0,0,.25)}
  .module-icon{font-size:24px;margin-bottom:9px} .module-title{font-weight:700;font-size:13px} .module-count{font-size:11px;color:${c.muted};margin-top:2px}
  .footer-note{text-align:center;font-size:11px;color:rgba(136,146,176,.35);margin-top:18px}

  /* TABLE */
  .fil-wrap{overflow-x:auto;border-radius:14px;border:1px solid rgba(244,197,66,.1)}
  .fil-table{width:100%;border-collapse:collapse;min-width:1400px}
  .fil-table .gh{background:rgba(10,22,40,.9)}
  .fil-table .gh th{padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid rgba(136,146,176,.1);white-space:nowrap}
  .fil-table .gh .th-eleve{color:${c.gold}} .fil-table .gh .th-pere{color:#74C0FC} .fil-table .gh .th-mere{color:#F9A8D4}
  .fil-table .gh .th-note{color:${c.success}} .fil-table .gh .th-pay{color:#FDBA74}
  .fil-table tbody tr:hover td{background:rgba(244,197,66,.03)}
  .fil-table td{padding:10px 12px;font-size:12px;border-bottom:1px solid rgba(136,146,176,.06);vertical-align:middle;white-space:nowrap}
  .fil-table tbody tr:last-child td{border-bottom:none}
  .av{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
  .av-f{background:rgba(167,139,250,.2);color:${c.purple}} .av-m{background:rgba(78,205,196,.2);color:${c.success}}
  .cell-name{display:flex;align-items:center;gap:8px}
  .cell-main{font-weight:600;font-size:13px} .cell-sub{font-size:10px;color:${c.muted}}
  .empty-state{text-align:center;padding:56px 20px;color:${c.muted}}
  .empty-state .big{font-size:44px;margin-bottom:10px}
  .drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100;display:flex;justify-content:flex-end;animation:fadeIn .2s ease}
  .drawer{width:560px;max-width:96vw;background:${c.navyMid};border-left:1px solid rgba(244,197,66,.15);height:100vh;overflow-y:auto;padding:28px 26px;animation:slideIn .25s cubic-bezier(.22,1,.36,1)}
  .drawer-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
  .drawer-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:900}
  .drawer-section{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(136,146,176,.12)}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .form-grid .span2{grid-column:span 2}
`;


// ─── ParentPortal (inscription + connexion) ──────────────────────────────────
function ParentPortal({onBack, onParentLogin}){
  const [nom,setNom]       = useState("");
  const [school,setSchool] = useState("");
  const [tel,setTel]       = useState("");
  const [code,setCode]     = useState("");
  const [pass,setPass]     = useState("");
  const [showPass,setShowPass] = useState(false);
  const [err,setErr]       = useState("");
  const [loading,setLoading] = useState(false);
  const PINK = "linear-gradient(135deg,#F9A8D4,#E879F9)";

  const handleLogin=async()=>{
    setErr("");
    if(!nom.trim()||!school.trim()||!tel.trim()||!code.trim()||!pass){
      setErr("Veuillez remplir tous les champs."); return;
    }
    setLoading(true);
    // Small delay to simulate network
    await new Promise(r=>setTimeout(r,600));
    const result=findParentLogin(nom,"",school,tel,pass,code);
    setLoading(false);
    if(result.error){setErr(result.error);return;}
    onParentLogin(result.parent);
  };

  return(
    <div className="card">
      <div className="logo-mark">
        <div className="logo-icon" style={{background:"rgba(249,168,212,.15)",fontSize:22}}>👨‍👩‍👧</div>
        <div className="logo-text">École<span>Hub</span> <span style={{fontSize:11,color:"#F9A8D4",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Parents</span></div>
      </div>

      <h1>Espace Parents 👨‍👩‍👧</h1>
      <p className="subtitle">Consultez le suivi scolaire de vos enfants</p>

      {/* Info notice */}
      <div style={{background:"rgba(249,168,212,.08)",border:"1px solid rgba(249,168,212,.2)",borderRadius:10,padding:"11px 14px",marginBottom:22,fontSize:12,color:"#F9A8D4",lineHeight:1.6}}>
        📱 <strong>Code SMS</strong> : votre code à 6 chiffres vous a été transmis lors de l'inscription de votre enfant.<br/>
        🔑 <strong>Mot de passe</strong> : choisissez-en un lors de votre première connexion.
      </div>

      <div className="input-wrap">
        <label>Votre nom complet</label>
        <input type="text" placeholder="Prénom et nom" value={nom} onChange={e=>setNom(e.target.value)}/>
      </div>

      <div className="input-wrap">
        <label>Nom de l'école</label>
        <input type="text" placeholder="Nom exact de l'établissement" value={school} onChange={e=>setSchool(e.target.value)}/>
      </div>
      <div className="input-wrap">
        <label>Numéro de téléphone</label>
        <input type="text" placeholder="Ex: 06 12 34 56 78" value={tel} onChange={e=>setTel(e.target.value)}/>
      </div>
      <div className="input-wrap">
        <label>Code SMS reçu</label>
        <input type="text" placeholder="_ _ _ _ _ _" value={code}
          onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
          maxLength={6}
          style={{letterSpacing:"0.4em",fontSize:20,textAlign:"center",fontWeight:900,
            color:code.length===6?"#F4C542":"#fff",
            borderColor:code.length===6?"rgba(244,197,66,.5)":"rgba(136,146,176,.2)"}}/>
        {code.length>0&&code.length<6&&<div style={{fontSize:11,color:"#8892B0",marginTop:3}}>{6-code.length} chiffre{6-code.length>1?"s":""} restant{6-code.length>1?"s":""}</div>}
        {code.length===6&&<div style={{fontSize:11,color:"#4ECDC4",marginTop:3}}>✓ Code complet</div>}
      </div>
      <div className="input-wrap">
        <label>Mot de passe</label>
        <div style={{position:"relative"}}>
          <input type={showPass?"text":"password"} placeholder="Votre mot de passe (min. 4 caractères)"
            value={pass} onChange={e=>setPass(e.target.value)} style={{paddingRight:46}}/>
          <button onClick={()=>setShowPass(v=>!v)}
            style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#8892B0",padding:0}}>
            {showPass?"🙈":"👁️"}
          </button>
        </div>
        <div style={{fontSize:11,color:"#8892B0",marginTop:4}}>
          Première connexion : ce mot de passe sera enregistré pour vos prochaines visites.
        </div>
      </div>

      {err&&(
        <div style={{background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:9,padding:"10px 14px",marginBottom:10,fontSize:13,color:"#FF6B6B"}}>
          ⚠️ {err}
        </div>
      )}

      <button className="btn-primary" onClick={handleLogin}
        disabled={loading||code.length!==6||!tel.trim()||!pass}
        style={{background:loading||code.length!==6||!tel.trim()||!pass?"rgba(136,146,176,.2)":PINK,color:loading||code.length!==6||!tel.trim()||!pass?"#8892B0":"#4A044E",marginTop:0,cursor:loading?"not-allowed":"pointer",transition:".2s"}}>
        {loading?(
          <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{width:16,height:16,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #4A044E",borderRadius:"50%",animation:"spin 1s linear infinite",display:"inline-block"}}/>
            Vérification…
          </span>
        ):"🔐 Accéder à l'espace parents"}
      </button>
      <button className="btn-secondary" onClick={onBack} style={{marginTop:10,width:"100%"}}>← Retour</button>
    </div>
  );
}

// ─── ParentDashboard ──────────────────────────────────────────────────────────
function ParentDashboard({parentData,onLogout}){
  const [selEnfant,setSelEnfant]=useState(null);
  const schoolMatch=parentData.schoolCode?getSchools()[parentData.schoolCode]:null;
  const allStudents=schoolMatch?getStudents(parentData.schoolCode):[];
  const allResults=schoolMatch?getResults(parentData.schoolCode):{};

  const linkedStudents=allStudents.filter(s=>
    parentData.linkedStudentIds?.includes(s.id)||
    s.pere?.tel===parentData.tel||s.mere?.tel===parentData.tel
  );

  const LVLABEL={maternelle:"Maternelle",primaire:"Primaire",college:"Collège",lycee:"Lycée"};
  const LVICON ={maternelle:"🌱",primaire:"📚",college:"🏫",lycee:"🎓"};
  const PINK="linear-gradient(135deg,#F9A8D4,#E879F9)";

  const computeMoy=(s)=>{
    if(!schoolMatch) return null;
    const cl=CLASS_TO_LEVEL[s.classe];
    const MATS=getMatieres(schoolMatch.langue||"francaise",cl||"college");
    const pkeys=cl==="primaire"?["T1","T2","T3"]:["S1","S2"];
    const smoys=pkeys.map(pk=>{
      const mm=MATS.map(mat=>{const n=allResults[s.id]?.[pk]?.[mat.key]||{};return matMoy(n);}).filter(x=>x!==null);
      return mm.length?mm.reduce((a,b)=>a+b,0)/mm.length:null;
    }).filter(x=>x!==null);
    return smoys.length?smoys.reduce((a,b)=>a+b,0)/smoys.length:null;
  };

  if(!selEnfant) return(
    <div style={{minHeight:"100vh",background:c.navy,animation:"cardIn .4s cubic-bezier(.22,1,.36,1) both"}}>
      <div style={{background:c.navyMid,borderBottom:"1px solid rgba(249,168,212,.2)",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:9,background:"rgba(249,168,212,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👨‍👩‍👧</div>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:900}}>Espace <span style={{color:"#F9A8D4"}}>Parents</span></div>
            <div style={{fontSize:11,color:c.muted}}>{parentData.nomComplet}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{padding:"7px 14px",background:"rgba(136,146,176,.1)",border:"1px solid rgba(136,146,176,.2)",borderRadius:8,color:c.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🚪 Déconnexion</button>
      </div>
      <div style={{padding:"24px",maxWidth:860,margin:"0 auto"}}>
        <div style={{background:c.navyMid,border:"1px solid rgba(249,168,212,.15)",borderRadius:13,padding:"16px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:"rgba(249,168,212,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏫</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14}}>{parentData.schoolName}</div>

          </div>
          {schoolMatch&&<span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:"rgba(78,205,196,.12)",color:c.success}}>✓ Liée</span>}
        </div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,marginBottom:14}}>👧👦 Mes enfants</div>
        {linkedStudents.length>0?(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:12}}>
            {linkedStudents.map(s=>{
              const moy=computeMoy(s); const m=mention(moy);
              return(
                <div key={s.id} onClick={()=>setSelEnfant(s)}
                  style={{background:c.navyMid,border:"1px solid rgba(249,168,212,.15)",borderRadius:13,padding:"16px",cursor:"pointer",transition:".2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#F9A8D4";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(249,168,212,.15)";}}>
                  <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:15,color:s.genre==="F"?c.purple:c.success}}>{s.prenom[0]}{s.nom[0]}</div>
                    <div><div style={{fontWeight:700,fontSize:13}}>{s.prenom} {s.nom}</div><div style={{fontSize:11,color:c.muted}}>{LVICON[s.niveau]} {s.classe}</div></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{background:c.navy,borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:900,color:m.color}}>{moy!==null?moy.toFixed(2):"—"}</div><div style={{fontSize:10,color:c.muted,marginTop:1}}>Moy. Ann.</div></div>
                    <div style={{background:c.navy,borderRadius:8,padding:"8px",textAlign:"center"}}><span className={`tag tag-${s.statut}`}>{s.statut}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        ):(
          <div style={{background:c.navyMid,borderRadius:13,padding:"28px",textAlign:"center"}}>
            <div style={{fontSize:38,marginBottom:8}}>🔍</div>
            <div style={{fontWeight:600,marginBottom:4}}>Aucun enfant trouvé dans la base</div>
            <div style={{fontSize:12,color:c.muted,lineHeight:1.6}}>
              Enfants déclarés : {parentData.enfants?.map((e,i)=><span key={i} style={{color:"#F9A8D4",fontWeight:600}}>{e.nom}{i<parentData.enfants.length-1?", ":""}</span>)}
            </div>
            <div style={{fontSize:11,color:c.muted,marginTop:6}}>Ils apparaîtront automatiquement dès qu'ils sont enregistrés avec votre numéro de téléphone.</div>
          </div>
        )}
      </div>
    </div>
  );

  // ENFANT DETAIL — read-only
  const s=selEnfant;
  const cl=CLASS_TO_LEVEL[s.classe];
  const MATS=getMatieres(schoolMatch?.langue||"francaise",cl||"college");
  const periods=(cl==="primaire")?[{key:"T1",label:"1er Trimestre"},{key:"T2",label:"2ème Trimestre"},{key:"T3",label:"3ème Trimestre"}]:[{key:"S1",label:"1er Semestre"},{key:"S2",label:"2ème Semestre"}];
  const mAnn=mention(computeMoy(s));
  const GROUP_COLORS={"islamique":"#C4B5FD","arabe":"#818CF8","histgeo":"#FCA5A5","fr":"#74C0FC"};

  return(
    <div style={{minHeight:"100vh",background:c.navy}}>
      <div style={{background:c.navyMid,borderBottom:"1px solid rgba(249,168,212,.2)",padding:"0 24px",display:"flex",alignItems:"center",gap:10,height:60}}>
        <button onClick={()=>setSelEnfant(null)} style={{padding:"7px 14px",background:"transparent",border:"1.5px solid rgba(136,146,176,.25)",borderRadius:8,color:c.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>← Retour</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:900}}>Suivi de <span style={{color:"#F9A8D4"}}>{s.prenom} {s.nom}</span></div>
        <span style={{marginLeft:"auto",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:"rgba(136,146,176,.1)",color:c.muted}}>👁 Lecture seule</span>
      </div>
      <div style={{padding:"22px 24px",maxWidth:760,margin:"0 auto"}}>
        <div style={{background:c.navyMid,border:"1px solid rgba(249,168,212,.15)",borderRadius:13,padding:"18px",marginBottom:18,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:19,color:s.genre==="F"?c.purple:c.success}}>{s.prenom[0]}{s.nom[0]}</div>
          <div style={{flex:1}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:900}}>{s.prenom} {s.nom}</div>
            <div style={{fontSize:12,color:c.muted,marginTop:3,display:"flex",gap:8,flexWrap:"wrap"}}><span>{LVICON[cl]} {LVLABEL[cl]}</span><span className="tag" style={{background:"rgba(244,197,66,.1)",color:c.gold}}>{s.classe}</span><span className={`tag tag-${s.statut}`}>{s.statut}</span></div>
          </div>
          <div style={{background:c.navy,borderRadius:10,padding:"10px 16px",textAlign:"center"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:mAnn.color}}>{computeMoy(s)!==null?computeMoy(s).toFixed(2):"—"}</div>
            <div style={{fontSize:10,color:c.muted,marginTop:1}}>Moy. Annuelle</div>
          </div>
        </div>
        {periods.map(p=>{
          const semMoys=MATS.map(mat=>{const n=allResults[s.id]?.[p.key]?.[mat.key]||{};return matMoy(n);}).filter(x=>x!==null);
          const semMoy=semMoys.length?semMoys.reduce((a,b)=>a+b,0)/semMoys.length:null;
          const sm=mention(semMoy);
          return(
            <div key={p.key} style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:700}}>{p.label}</div>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:900,color:sm.color}}>{semMoy!==null?semMoy.toFixed(2):"—"}</span>
                <span style={{fontSize:10,fontWeight:700,color:sm.color,textTransform:"uppercase"}}>{sm.label}</span>
              </div>
              <div style={{overflowX:"auto",borderRadius:11,border:"1px solid rgba(136,146,176,.1)"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:380}}>
                  <thead>
                    <tr style={{background:"rgba(10,22,40,.9)"}}>
                      {["Matière","Cours","Éval.","Comp.","Moy."].map((h,i)=>(
                        <th key={h} style={{padding:"8px 10px",fontSize:"10px",fontWeight:700,textTransform:"uppercase",color:i===4?"#F4C542":c.muted,borderBottom:"1px solid rgba(136,146,176,.1)",textAlign:i===0?"left":"center",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MATS.map(mat=>{
                      const n=allResults[s.id]?.[p.key]?.[mat.key]||{};
                      const mm=matMoy(n); const mc=mention(mm);
                      const grpColor=mat.group?GROUP_COLORS[mat.group]||mat.color:mat.color;
                      const NC=({v})=><td style={{padding:"8px 10px",textAlign:"center",fontSize:12,fontWeight:600,color:v===null?c.muted:v>=10?c.success:c.red}}>{v===null?"—":v%1===0?v:v.toFixed(1)}</td>;
                      return(
                        <tr key={mat.key} style={{borderBottom:"1px solid rgba(136,146,176,.06)"}}>
                          <td style={{padding:"8px 10px",direction:mat.rtl?"rtl":"ltr"}}>
                            <span style={{fontSize:13,marginRight:5}}>{mat.icon}</span>
                            <span style={{fontSize:12,fontWeight:600}}>{mat.label}</span>
                          </td>
                          <NC v={n.cours??null}/><NC v={n.eval??null}/><NC v={n.compo??null}/>
                          <td style={{padding:"8px 10px",textAlign:"center",background:`rgba(${hexToRgb(grpColor)},.04)`}}>
                            <span style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:900,color:mc.color}}>{mm!==null?mm.toFixed(1):"—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        <div style={{background:"rgba(244,197,66,.06)",border:"1px solid rgba(244,197,66,.2)",borderRadius:12,padding:"16px 18px"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:700,color:"#F4C542",marginBottom:10}}>🏆 Bilan annuel</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
            {periods.map(p=>{
              const sm2=MATS.map(mat=>{const n=allResults[s.id]?.[p.key]?.[mat.key]||{};return matMoy(n);}).filter(x=>x!==null);
              const smoy=sm2.length?sm2.reduce((a,b)=>a+b,0)/sm2.length:null;
              const mc=mention(smoy);
              return(<div key={p.key} style={{background:c.navy,borderRadius:9,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:11,color:c.muted,marginBottom:3}}>{p.label}</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:900,color:mc.color}}>{smoy!==null?smoy.toFixed(2):"—"}</div>
              </div>);
            })}
            <div style={{background:c.navy,borderRadius:9,padding:"10px",textAlign:"center",border:"1px solid rgba(244,197,66,.2)"}}>
              <div style={{fontSize:11,color:c.muted,marginBottom:3}}>Annuelle</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:900,color:mAnn.color}}>{computeMoy(s)!==null?computeMoy(s).toFixed(2):"—"}</div>
              <div style={{fontSize:9,fontWeight:700,color:mAnn.color,textTransform:"uppercase",marginTop:1}}>{mAnn.label}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Portal selector (home screen) ───────────────────────────────────────────
function Step1({onSuccess,onSuperAdmin,onParent}){
  const [portal,setPortal]=useState(null); // null | "ecole" | "directeur" | "admin" | "parent"
  const [adminPanel,setAdminPanel]=useState(false);
  const [adminRole,setAdminRole]=useState(null); // "enseignant" | "censeur"

  // ── École (register / login) ──
  const [mode,setMode]=useState("register");
  const [name,setName]=useState(""); const [pass,setPass]=useState("");
  const [lc,setLc]=useState(""); const [lp,setLp]=useState(""); const [err,setErr]=useState("");

  // ── Super admin ──
  const [adminCode,setAdminCode]=useState(""); const [adminPass,setAdminPass]=useState("");

  const reg=()=>{if(!name.trim()||!pass.trim()){setErr("Remplissez tous les champs.");return;}if(pass.length<4){setErr("Mot de passe trop court.");return;}onSuccess({name:name.trim(),code:generateCode(name),password:pass});};
  const login=()=>{if(!lc.trim()||!lp.trim()){setErr("Remplissez tous les champs.");return;}const s=getSchools()[lc.trim().toUpperCase()];if(!s){setErr("Code introuvable.");return;}if(s.password!==lp){setErr("Mot de passe incorrect.");return;}onSuccess({...s,role:portal==="directeur"?"directeur":portal==="admin"?"admin":"ecole"},true);};
  const adminLogin=()=>{if(adminCode.trim()!==SUPER_ADMIN_CODE||adminPass!==SUPER_ADMIN_PASS){setErr("Code ou mot de passe super-admin incorrect.");return;}onSuperAdmin();};

  const back=()=>{setPortal(null);setErr("");setAdminPanel(false);setAdminRole(null);};

  // ══ HOME: portal selector ══
  if(!portal) return(
    <div className="card" style={{maxWidth:520}}>
      <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <div style={{width:44,height:44,borderRadius:12,background:"rgba(244,197,66,.15)",border:"1.5px solid rgba(244,197,66,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🏛️</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900}}>École<span style={{color:c.gold}}>Hub</span></div>
      </div>
      <h1 style={{fontSize:20,marginBottom:6}}>Choisissez votre profil</h1>
      <p className="subtitle" style={{marginBottom:24}}>Accédez à votre espace ÉcoleHub</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {[
          {id:"ecole",      icon:"🏫", label:"École",             desc:"Créer ou gérer votre établissement",    color:"#F4C542", bg:"rgba(244,197,66,.1)"},
          {id:"directeur",  icon:"🎩", label:"Directeur",         desc:"Accéder à l'espace direction",          color:"#4ECDC4", bg:"rgba(78,205,196,.1)"},
          {id:"admin",      icon:"⚙️", label:"Administrateur",    desc:"Gestion administrative de l'école",     color:"#74C0FC", bg:"rgba(116,192,252,.1)"},
          {id:"parent",     icon:"👨‍👩‍👧", label:"Parents d'élèves", desc:"Consulter le suivi de vos enfants",    color:"#F9A8D4", bg:"rgba(249,168,212,.1)"},
        ].map(p=>(
          <div key={p.id} onClick={()=>setPortal(p.id)}
            style={{padding:"18px 16px",background:c.navyMid,border:`1.5px solid ${p.bg.replace(".1)",".3)")}`,borderRadius:14,cursor:"pointer",transition:".2s",textAlign:"center"}}
            onMouseEnter={e=>{e.currentTarget.style.background=p.bg;e.currentTarget.style.borderColor=p.color;}}
            onMouseLeave={e=>{e.currentTarget.style.background=c.navyMid;e.currentTarget.style.borderColor=p.bg.replace(".1)",".3)");}}>
            <div style={{fontSize:30,marginBottom:10}}>{p.icon}</div>
            <div style={{fontWeight:700,fontSize:14,color:p.color,marginBottom:4}}>{p.label}</div>
            <div style={{fontSize:11,color:"#8892B0",lineHeight:1.4}}>{p.desc}</div>
          </div>
        ))}
      </div>
      <div style={{borderTop:"1px solid rgba(136,146,176,.1)",paddingTop:14,textAlign:"center"}}>
        <button onClick={()=>{setAdminPanel(true);setPortal("superadmin");}} style={{background:"rgba(124,58,237,.1)",border:"1px solid rgba(167,139,250,.25)",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:12,fontWeight:600,color:c.purple,fontFamily:"'DM Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:6}}>
          👑 Accès Super Admin
        </button>
      </div>
    </div>
  );

  // ══ SUPER ADMIN ══
  if(portal==="superadmin") return(
    <div className="card">
      <div className="logo-mark"><div className="logo-icon" style={{background:"linear-gradient(135deg,#7C3AED,#A78BFA)"}}>👑</div><div className="logo-text">École<span style={{color:c.purple}}>Hub</span> <span style={{fontSize:11,color:c.purple,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Super Admin</span></div></div>
      <h1>Accès réservé</h1><p className="subtitle">Interface de supervision de la plateforme</p>
      <div className="input-wrap"><label>Code Super Admin</label><input type="text" placeholder="SUPERADMIN-XXXX" value={adminCode} onChange={e=>setAdminCode(e.target.value)}/></div>
      <div className="input-wrap"><label>Mot de passe</label><input type="password" placeholder="••••••••" value={adminPass} onChange={e=>setAdminPass(e.target.value)}/></div>
      {err&&<p className="error-msg">{err}</p>}
      <button className="btn-primary" onClick={adminLogin} style={{background:"linear-gradient(135deg,#7C3AED,#A78BFA)",color:c.white,marginTop:0}}>👑 Accéder au panneau</button>
      <button className="btn-secondary" onClick={back} style={{marginTop:10,width:"100%"}}>← Retour</button>
    </div>
  );

  // ══ ÉCOLE (register/login) ══
  if(portal==="ecole") return(
    <div className="card">
      <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {["register","login"].map(m=><button key={m} onClick={()=>{setMode(m);setErr("");}} style={{flex:1,padding:"10px",borderRadius:8,border:"none",cursor:"pointer",background:mode===m?c.gold:"rgba(136,146,176,.1)",color:mode===m?c.navy:c.muted,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,transition:"all .2s"}}>{m==="register"?"Créer un compte":"Se connecter"}</button>)}
      </div>
      {mode==="register"?<>
        <h1>Inscription École 🏫</h1><p className="subtitle">Créez l'espace numérique de votre établissement</p>
        <div className="input-wrap"><label>Nom de l'établissement</label><input type="text" placeholder="Ex: Lycée Victor Hugo" value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="input-wrap"><label>Mot de passe administrateur</label><input type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)}/></div>
        {err&&<p className="error-msg">{err}</p>}
        <button className="btn-primary" onClick={reg}>Créer l'établissement →</button>
      </>:<>
        <h1>Connexion École 🔐</h1><p className="subtitle">Accédez à votre espace établissement</p>
        <div className="input-wrap"><label>Code établissement</label><input type="text" placeholder="Ex: VIC-4821" value={lc} onChange={e=>setLc(e.target.value)}/></div>
        <div className="input-wrap"><label>Mot de passe</label><input type="password" placeholder="••••••••" value={lp} onChange={e=>setLp(e.target.value)}/></div>
        {err&&<p className="error-msg">{err}</p>}
        <button className="btn-primary" onClick={login}>Accéder au tableau de bord →</button>
      </>}
      <button className="btn-secondary" onClick={back} style={{marginTop:12,width:"100%"}}>← Retour</button>
    </div>
  );

  // ══ DIRECTEUR ══
  if(portal==="directeur") return(
    <div className="card">
      {/* Header with teal accent */}
      <div style={{position:"relative",background:"linear-gradient(135deg,rgba(78,205,196,.15),rgba(78,205,196,.05))",border:"1px solid rgba(78,205,196,.25)",borderRadius:14,padding:"22px 20px",marginBottom:24,textAlign:"center"}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(78,205,196,.15)",border:"2px solid rgba(78,205,196,.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 12px"}}>🎩</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:"#4ECDC4"}}>Espace Directeur</div>
        <div style={{fontSize:12,color:c.muted,marginTop:4}}>Accès complet à votre établissement</div>
        <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:12,flexWrap:"wrap"}}>
          {["📊 Résultats","📝 Bulletins","👩‍🎓 Élèves","💬 Messagerie"].map(item=>(
            <span key={item} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:"rgba(78,205,196,.1)",color:"#4ECDC4",border:"1px solid rgba(78,205,196,.2)"}}>{item}</span>
          ))}
        </div>
      </div>

      <div className="logo-mark" style={{marginBottom:4}}>
        <div className="logo-icon" style={{background:"rgba(78,205,196,.15)",fontSize:18}}>🏛️</div>
        <div className="logo-text">École<span>Hub</span></div>
      </div>

      <h1 style={{marginBottom:6}}>Connexion Directeur</h1>
      <p className="subtitle" style={{marginBottom:20}}>Utilisez le code et mot de passe de votre école</p>

      <div className="input-wrap">
        <label style={{display:"flex",alignItems:"center",gap:6}}><span>🏫</span> Code établissement</label>
        <input type="text" placeholder="Ex: ECO-4821" value={lc} onChange={e=>{setLc(e.target.value.toUpperCase());setErr("");}}
          style={{letterSpacing:".05em",fontWeight:600}}/>
      </div>
      <div className="input-wrap">
        <label style={{display:"flex",alignItems:"center",gap:6}}><span>🔑</span> Mot de passe</label>
        <input type="password" placeholder="Mot de passe de l'établissement" value={lp} onChange={e=>{setLp(e.target.value);setErr("");}}/>
      </div>

      {err&&(
        <div style={{background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:9,padding:"10px 14px",marginBottom:12,fontSize:12,color:c.red}}>
          ⚠️ {err}
        </div>
      )}

      <button className="btn-primary" onClick={login}
        style={{background:"linear-gradient(135deg,#4ECDC4,#2BB5AC)",color:"#0A1628",marginTop:0,fontWeight:700,fontSize:14,letterSpacing:".03em"}}>
        🎩 Accéder au tableau de bord →
      </button>
      <button className="btn-secondary" onClick={back} style={{marginTop:10,width:"100%"}}>← Retour</button>
    </div>
  );

  // ══ ADMINISTRATEUR ══ — choix du rôle d'abord
  if(portal==="admin"){

    const ADMIN_ROLES=[
      {id:"enseignant", icon:"👨‍🏫", label:"Enseignant",
       desc:"Accès à vos classes, résultats et bulletins",
       color:"#86EFAC", bg:"rgba(134,239,172,.12)", border:"rgba(134,239,172,.3)"},
      {id:"censeur",    icon:"📋",   label:"Censeur",
       desc:"Surveillance, présences et discipline",
       color:"#74C0FC", bg:"rgba(116,192,252,.12)", border:"rgba(116,192,252,.3)"},
    ];

    // ── Choix du rôle ──
    if(!adminRole) return(
      <div className="card">
        <div className="logo-mark">
          <div className="logo-icon" style={{background:"rgba(116,192,252,.15)",fontSize:18}}>⚙️</div>
          <div className="logo-text">École<span>Hub</span> <span style={{fontSize:11,color:"#74C0FC",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Admin</span></div>
        </div>
        <h1 style={{marginBottom:8}}>Espace Administrateur</h1>
        <p className="subtitle" style={{marginBottom:24}}>Choisissez votre profil pour accéder à votre espace</p>
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:20}}>
          {ADMIN_ROLES.map(r=>(
            <div key={r.id} onClick={()=>setAdminRole(r.id)}
              style={{display:"flex",alignItems:"center",gap:16,padding:"18px 20px",
                background:r.bg,border:`2px solid ${r.border}`,
                borderRadius:14,cursor:"pointer",transition:".2s"}}
              onMouseEnter={e=>e.currentTarget.style.transform="translateX(4px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="none"}>
              <div style={{width:52,height:52,borderRadius:12,background:`rgba(${r.color==="#86EFAC"?"134,239,172":"116,192,252"},.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>
                {r.icon}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:16,color:r.color,marginBottom:4}}>{r.label}</div>
                <div style={{fontSize:12,color:c.muted,lineHeight:1.4}}>{r.desc}</div>
              </div>
              <div style={{fontSize:20,color:r.color,opacity:.6}}>→</div>
            </div>
          ))}
        </div>
        <button className="btn-secondary" onClick={back} style={{width:"100%"}}>← Retour</button>
      </div>
    );

    // ── Connexion selon le rôle choisi ──
    const chosen=ADMIN_ROLES.find(r=>r.id===adminRole);
    const loginAdmin=()=>{
      if(!lc.trim()||!lp.trim()){setErr("Remplissez tous les champs.");return;}
      const s=getSchools()[lc.trim().toUpperCase()];
      if(!s){setErr("Code établissement introuvable.");return;}
      if(s.password!==lp){setErr("Mot de passe incorrect.");return;}
      onSuccess({...s, role:"admin", adminRole:adminRole},true);
    };

    return(
      <div className="card">
        {/* Role badge header */}
        <div style={{background:chosen.bg,border:`1px solid ${chosen.border}`,borderRadius:13,padding:"16px 18px",marginBottom:22,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:46,height:46,borderRadius:11,background:`rgba(${chosen.color==="#86EFAC"?"134,239,172":"116,192,252"},.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
            {chosen.icon}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:chosen.color}}>{chosen.label}</div>
            <div style={{fontSize:11,color:c.muted,marginTop:2}}>{chosen.desc}</div>
          </div>
          <button onClick={()=>{setAdminRole(null);setErr("");}}
            style={{marginLeft:"auto",background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:c.muted,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
            ← Changer
          </button>
        </div>

        <div className="logo-mark" style={{marginBottom:4}}>
          <div className="logo-icon" style={{background:"rgba(116,192,252,.12)",fontSize:18}}>🏛️</div>
          <div className="logo-text">École<span>Hub</span></div>
        </div>
        <h1 style={{marginBottom:6}}>Connexion {chosen.label}</h1>
        <p className="subtitle" style={{marginBottom:20}}>Entrez les identifiants de votre établissement</p>

        <div className="input-wrap">
          <label style={{display:"flex",alignItems:"center",gap:6}}><span>🏫</span> Code établissement</label>
          <input type="text" placeholder="Ex: ECO-4821" value={lc}
            onChange={e=>{setLc(e.target.value.toUpperCase());setErr("");}}
            style={{letterSpacing:".05em",fontWeight:600}}/>
        </div>
        <div className="input-wrap">
          <label style={{display:"flex",alignItems:"center",gap:6}}><span>🔑</span> Mot de passe</label>
          <input type="password" placeholder="Mot de passe de l'établissement" value={lp}
            onChange={e=>{setLp(e.target.value);setErr("");}}/>
        </div>

        {err&&<div style={{background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:9,padding:"10px 14px",marginBottom:12,fontSize:12,color:c.red}}>⚠️ {err}</div>}

        <button className="btn-primary" onClick={loginAdmin}
          style={{background:`linear-gradient(135deg,${chosen.color},${chosen.color==="#86EFAC"?"#4ADE80":"#4A9EE8"})`,color:"#0A1628",marginTop:0,fontWeight:700,fontSize:14}}>
          {chosen.icon} Accéder en tant que {chosen.label} →
        </button>
        <button className="btn-secondary" onClick={back} style={{marginTop:10,width:"100%"}}>← Retour</button>
      </div>
    );
  }

  // ══ PARENTS ══
  if(portal==="parent") return <ParentPortal onBack={back} onParentLogin={onParent}/>;

  return null;
}


// ─── StepLieu — Localisation de l'école ──────────────────────────────────────
function StepLieu({data, onNext, onBack}){
  const [lieu,setLieu]=useState(data.lieu||{
    pays:"",region:"",typeAdmin:"",
    prefecture:"",sousPrefecture:"",
    commune:"",quartierDistrict:""
  });
  const [err,setErr]=useState("");

  const set=(k,v)=>{
    setLieu(p=>{
      const next={...p,[k]:v};
      if(k==="typeAdmin"){next.prefecture="";next.sousPrefecture="";next.commune="";next.quartierDistrict="";}
      if(k==="prefecture"||k==="sousPrefecture"){next.commune="";next.quartierDistrict="";}
      return next;
    });
    setErr("");
  };

  const isPrefe=lieu.typeAdmin==="prefecture";
  const isSousP=lieu.typeAdmin==="sous-prefecture";
  const subdivLabel=isPrefe?"Préfecture":isSousP?"Sous-Préfecture":"";
  const subdivField=isPrefe?"prefecture":"sousPrefecture";
  const communeLabel=isPrefe?"Commune Urbaine":"Commune Rurale";
  const zoneLabel=isPrefe?"Quartier":"District";

  const validate=()=>{
    if(!lieu.pays.trim())             {setErr("Indiquez le pays.");return false;}
    if(!lieu.region.trim())           {setErr("Indiquez la région administrative.");return false;}
    if(!lieu.typeAdmin)               {setErr("Choisissez Préfecture ou Sous-Préfecture.");return false;}
    if(!lieu[subdivField].trim())     {setErr(`Indiquez la ${subdivLabel.toLowerCase()}.`);return false;}
    if(!lieu.commune.trim())          {setErr(`Indiquez la ${communeLabel.toLowerCase()}.`);return false;}
    if(!lieu.quartierDistrict.trim()) {setErr(`Indiquez le ${zoneLabel.toLowerCase()}.`);return false;}
    return true;
  };

  const inp=(val,onChange,ph,type="text")=>(
    <input type={type} placeholder={ph||""} value={val||""}
      onChange={onChange}
      style={{width:"100%",padding:"12px 14px",background:c.navy,
        border:`1.5px solid ${(val||"").trim()?"rgba(244,197,66,.4)":"rgba(136,146,176,.2)"}`,
        borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",
        fontSize:13,outline:"none",transition:"border-color .2s"}}/>
  );

  return(
    <div className="card" style={{maxWidth:500}}>
      <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
      <div className="step-indicator">
        {[0,1,2,3,4,5,6].map(i=>(
          <div key={i} className="step-dot" style={{background:i===1?"#F4C542":i<1?"#4ECDC4":"rgba(136,146,176,.2)"}}/>
        ))}
      </div>
      <h1>📍 Lieu de l'école</h1>
      <p className="subtitle" style={{marginBottom:22}}>Localisation de <strong style={{color:c.white}}>{data.name}</strong></p>

      {/* Pays */}
      <div style={{marginBottom:14}}>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}><span style={{fontSize:14}}>🌍</span>Pays *</label>
        {inp(lieu.pays, e=>set("pays",e.target.value), "Ex: Guinée, France, Maroc…")}
      </div>

      {/* Région */}
      <div style={{marginBottom:14}}>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}><span style={{fontSize:14}}>🗺️</span>Région administrative *</label>
        {inp(lieu.region, e=>set("region",e.target.value), "Ex: Conakry, Kindia, Faranah…")}
      </div>

      {/* Type admin */}
      <div style={{marginBottom:16}}>
        <label style={{marginBottom:10,display:"block"}}>Type d'administration *</label>
        <div style={{display:"flex",gap:10}}>
          {[{id:"prefecture",icon:"🏛️",label:"Préfecture",desc:"→ Commune urbaine & Quartier"},
            {id:"sous-prefecture",icon:"🌾",label:"Sous-Préfecture",desc:"→ Commune rurale & District"}].map(btn=>(
            <div key={btn.id} onClick={()=>set("typeAdmin",btn.id)}
              style={{flex:1,padding:"16px 14px",background:lieu.typeAdmin===btn.id?"rgba(244,197,66,.1)":c.navy,
                border:`2px solid ${lieu.typeAdmin===btn.id?c.gold:"rgba(136,146,176,.15)"}`,
                borderRadius:13,cursor:"pointer",transition:".2s",textAlign:"center"}}>
              <div style={{fontSize:26,marginBottom:6}}>{btn.icon}</div>
              <div style={{fontWeight:700,fontSize:13,color:lieu.typeAdmin===btn.id?c.gold:c.white,marginBottom:3}}>{btn.label}</div>
              <div style={{fontSize:11,color:c.muted,lineHeight:1.4}}>{btn.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Subdivision */}
      {lieu.typeAdmin&&(
        <div style={{marginBottom:14}}>
          <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
            <span style={{fontSize:14}}>{isPrefe?"🏛️":"🌾"}</span>{subdivLabel} *
          </label>
          {inp(lieu[subdivField], e=>set(subdivField,e.target.value), `Nom de la ${subdivLabel.toLowerCase()}`)}
        </div>
      )}

      {/* Commune */}
      {lieu.typeAdmin&&(
        <div style={{marginBottom:14}}>
          <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{fontSize:14}}>🏘️</span>{communeLabel} *
            <span style={{marginLeft:4,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,
              background:isPrefe?"rgba(116,192,252,.12)":"rgba(134,239,172,.12)",
              color:isPrefe?"#74C0FC":"#86EFAC"}}>{isPrefe?"Urbaine":"Rurale"}</span>
          </label>
          {inp(lieu.commune, e=>set("commune",e.target.value), `Nom de la commune ${isPrefe?"urbaine":"rurale"}`)}
        </div>
      )}

      {/* Quartier / District */}
      {lieu.typeAdmin&&lieu.commune&&(
        <div style={{marginBottom:6}}>
          <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{fontSize:14}}>{isPrefe?"🏙️":"🌿"}</span>{zoneLabel} *
            <span style={{marginLeft:4,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,
              background:isPrefe?"rgba(244,197,66,.1)":"rgba(134,239,172,.1)",
              color:isPrefe?c.gold:"#86EFAC"}}>{isPrefe?"Quartier":"District"}</span>
          </label>
          {inp(lieu.quartierDistrict, e=>set("quartierDistrict",e.target.value), `Nom du ${zoneLabel.toLowerCase()}`)}
        </div>
      )}

      {/* Résumé */}
      {lieu.pays&&lieu.typeAdmin&&lieu.commune&&lieu.quartierDistrict&&(
        <div style={{background:"rgba(78,205,196,.08)",border:"1px solid rgba(78,205,196,.2)",borderRadius:10,padding:"10px 14px",marginTop:8,marginBottom:4,fontSize:12,color:c.success,lineHeight:1.7}}>
          📍 <strong>{lieu.pays}</strong> · {lieu.region} · {subdivLabel} {lieu[subdivField]} · {communeLabel} {lieu.commune} · {zoneLabel} {lieu.quartierDistrict}
        </div>
      )}

      {err&&<p className="error-msg" style={{marginTop:8}}>{err}</p>}
      <div className="btn-row" style={{marginTop:18}}>
        <button className="btn-secondary" onClick={onBack} style={{width:100}}>← Retour</button>
        <button className="btn-primary" onClick={()=>{if(validate())onNext({...data,lieu})}} style={{marginTop:0}}>Suivant →</button>
      </div>
    </div>
  );
}


// ─── StepAdmin — Informations administratives ────────────────────────────────
function StepAdmin({data, onNext, onBack}){
  const isPrefe=data.lieu?.typeAdmin==="prefecture";
  const isSousP=data.lieu?.typeAdmin==="sous-prefecture";

  const currentYear=()=>{const now=new Date();const y=now.getFullYear();return now.getMonth()>=8?`${y}-${y+1}`:`${y-1}-${y}`;};

  const [admin,setAdmin]=useState(data.admin||{
    ire:"",dpe:"",dse:"",etablissement:data.name||"",
    niveau:"",classe:"",annee:currentYear()
  });
  const [err,setErr]=useState("");
  const set=(k,v)=>{setAdmin(p=>({...p,[k]:v}));setErr("");};

  const validate=()=>{
    if(!admin.ire.trim())           {setErr("Renseignez l'I.R.E.");return false;}
    if(!admin.dpe.trim())           {setErr("Renseignez la D.P.E.");return false;}
    if(isSousP&&!admin.dse.trim())  {setErr("Renseignez la D.S.E.");return false;}
    if(!admin.etablissement.trim()) {setErr("Renseignez l'établissement.");return false;}
    if(!admin.niveau.trim())        {setErr("Renseignez le niveau.");return false;}
    if(!admin.classe.trim())        {setErr("Renseignez la classe.");return false;}
    if(!admin.annee.trim())         {setErr("Renseignez l'année scolaire.");return false;}
    return true;
  };

  const inp=(lbl,val,k,ph,badge,badgeColor)=>(
    <div style={{marginBottom:14}}>
      <label style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
        {lbl}
        {badge&&<span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,
          background:`rgba(${badgeColor},.15)`,color:`rgb(${badgeColor})`,
          border:`1px solid rgba(${badgeColor},.3)`}}>{badge}</span>}
      </label>
      <input type="text" placeholder={ph||""} value={val||""}
        onChange={e=>set(k,e.target.value)}
        style={{width:"100%",padding:"12px 14px",background:c.navy,
          border:`1.5px solid ${(val||"").trim()?"rgba(244,197,66,.4)":"rgba(136,146,176,.2)"}`,
          borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",
          fontSize:13,outline:"none",transition:"border-color .2s"}}/>
    </div>
  );

  // Live preview of the document header
  const PreviewHeader=()=>(
    <div style={{background:c.navy,border:"1px solid rgba(244,197,66,.15)",borderRadius:12,padding:"14px",marginBottom:18,fontSize:11}}>
      <div style={{fontSize:10,color:c.muted,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>📄 Aperçu en-tête du récit</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,color:c.white,lineHeight:1.7,fontSize:10.5}}>
          <div>I.R.E : <strong>{admin.ire||"…"}</strong></div>
          <div>D.P.E : <strong>{admin.dpe||"…"}</strong></div>
          {isSousP&&<div>D.S.E : <strong>{admin.dse||"…"}</strong></div>}
          <div>Ét. : <strong>{admin.etablissement||"…"}</strong></div>
          <div>Niveau : <strong>{admin.niveau||"…"}</strong></div>
          <div>Classe : <strong>{admin.classe||"…"}</strong></div>
          <div>Année : <strong>{admin.annee||"…"}</strong></div>
        </div>
        <div style={{flex:1,textAlign:"center",lineHeight:1.9}}>
          <div style={{fontWeight:900,fontSize:11,letterSpacing:.5,textTransform:"uppercase",color:"#fff"}}>République de Guinée</div>
          <div style={{fontStyle:"italic",fontWeight:700,fontSize:11,display:"flex",justifyContent:"center",gap:4}}>
            <span style={{color:"#EF4444"}}>Travail</span>
            <span style={{color:"#8892B0"}}>-</span>
            <span style={{color:"#EAB308"}}>Justice</span>
            <span style={{color:"#8892B0"}}>-</span>
            <span style={{color:"#22C55E"}}>Solidarité</span>
          </div>
        </div>
        <div style={{flex:1,textAlign:"right",direction:"rtl",color:c.white,lineHeight:1.7,fontSize:10.5}}>
          <div>م.ج.ت : <strong>{admin.ire||"…"}</strong></div>
          <div>م.ت.م : <strong>{admin.dpe||"…"}</strong></div>
          {isSousP&&<div>م.ت.ن : <strong>{admin.dse||"…"}</strong></div>}
          <div>المؤسسة : <strong>{admin.etablissement||"…"}</strong></div>
          <div>المستوى : <strong>{admin.niveau||"…"}</strong></div>
          <div>الفصل : <strong>{admin.classe||"…"}</strong></div>
          <div>السنة : <strong>{admin.annee||"…"}</strong></div>
        </div>
      </div>
    </div>
  );

  return(
    <div className="card" style={{maxWidth:520}}>
      <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
      <div className="step-indicator">
        {[0,1,2,3,4,5,6].map(i=>(
          <div key={i} className="step-dot" style={{background:i===2?"#F4C542":i<2?"#4ECDC4":"rgba(136,146,176,.2)"}}/>
        ))}
      </div>
      <h1>📋 Informations administratives</h1>
      <p className="subtitle" style={{marginBottom:18}}>Ces données apparaîtront en en-tête du récit d'inscription</p>

      <PreviewHeader/>

      {inp("I.R.E — Inspection Régionale de l'Éducation *", admin.ire, "ire", "Ex: IRE de Conakry", "Obligatoire", "244,197,66")}
      {inp("D.P.E — Direction Préfectorale de l'Éducation *", admin.dpe, "dpe", "Ex: DPE de Dixinn", "Obligatoire", "244,197,66")}

      {isSousP&&inp("D.S.E — Direction Sous-Préfectorale de l'Éducation *", admin.dse, "dse", "Ex: DSE de Wanindara", "Sous-Préfecture", "134,239,172")}
      {isPrefe&&(
        <div style={{background:"rgba(116,192,252,.07)",border:"1px solid rgba(116,192,252,.18)",borderRadius:9,padding:"9px 13px",marginBottom:14,fontSize:12,color:"#74C0FC"}}>
          ℹ️ En Préfecture, la D.S.E n'est pas requise.
        </div>
      )}

      {inp("Nom de l'établissement *", admin.etablissement, "etablissement", data.name||"Nom exact de l'école")}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{marginBottom:14}}>
          <label style={{marginBottom:7,display:"block"}}>Niveau *</label>
          <input type="text" placeholder="Ex: Collège, Lycée…" value={admin.niveau||""}
            onChange={e=>set("niveau",e.target.value)}
            style={{width:"100%",padding:"12px 14px",background:c.navy,border:`1.5px solid ${admin.niveau?.trim()?"rgba(244,197,66,.4)":"rgba(136,146,176,.2)"}`,borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none"}}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{marginBottom:7,display:"block"}}>Classe *</label>
          <input type="text" placeholder="Ex: 7ème A" value={admin.classe||""}
            onChange={e=>set("classe",e.target.value)}
            style={{width:"100%",padding:"12px 14px",background:c.navy,border:`1.5px solid ${admin.classe?.trim()?"rgba(244,197,66,.4)":"rgba(136,146,176,.2)"}`,borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none"}}/>
        </div>
      </div>

      {inp("Année scolaire *", admin.annee, "annee", "Ex: 2024-2025")}

      {err&&<p className="error-msg">{err}</p>}
      <div className="btn-row" style={{marginTop:6}}>
        <button className="btn-secondary" onClick={onBack} style={{width:100}}>← Retour</button>
        <button className="btn-primary" onClick={()=>{if(validate())onNext({...data,admin})}} style={{marginTop:0}}>Suivant →</button>
      </div>
    </div>
  );
}


function Step2({data,onNext,onBack}){
  const [sel,setSel]=useState(data.type||""); const [err,setErr]=useState("");
  const types=[
    {id:"publique",icon:"🏛️",label:"École Publique",   desc:"Établissement d'état, financé par les collectivités"},
    {id:"privee",  icon:"🎖️",label:"École Privée",     desc:"Établissement indépendant, contrat ou hors contrat"},
  ];
  return(<div className="card">
    <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
    <div className="step-indicator">{[0,1,2,3,4,5,6].map(i=><div key={i} className={`step-dot ${i===3?"active":i<3?"done":""}`}/>)}</div>
    <h1>Type d'établissement</h1><p className="subtitle">Statut de <strong style={{color:c.white}}>{data.name}</strong></p>
    <div className="code-badge">🔑 {data.code}</div>
    <div className="choice-grid">{types.map(t=><div key={t.id} className={`choice-card ${sel===t.id?"selected":""}`} onClick={()=>setSel(t.id)}><div className="choice-icon">{t.icon}</div><div><div className="choice-label">{t.label}</div><div className="choice-desc">{t.desc}</div></div><div className="checkmark">{sel===t.id?"✓":""}</div></div>)}</div>
    {err&&<p className="error-msg">{err}</p>}
    <div className="btn-row"><button className="btn-secondary" onClick={onBack} style={{width:100}}>← Retour</button><button className="btn-primary" onClick={()=>{if(!sel){setErr("Choisissez un type.");return;}onNext({...data,type:sel});}}>Suivant →</button></div>
  </div>);
}

function Step3({data,onNext,onBack}){
  const [sel,setSel]=useState(data.langue||""); const [err,setErr]=useState("");
  const langues=[
    {id:"franco-arabe",icon:"🌙",label:"École Franco-Arabe",desc:"Enseignement bilingue français–arabe, programme mixte",color:"rgba(167,139,250,.15)",accent:"#A78BFA"},
    {id:"francaise",   icon:"🇫🇷",label:"École Française",   desc:"Enseignement entièrement en langue française",        color:"rgba(116,192,252,.12)",accent:"#74C0FC"},
  ];
  return(<div className="card">
    <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
    <div className="step-indicator">{[0,1,2,3,4].map(i=><div key={i} className={`step-dot ${i===2?"active":i<2?"done":""}`}/>)}</div>
    <h1>Système d'enseignement</h1>
    <p className="subtitle">Choisissez le système pédagogique de <strong style={{color:"#FFFFFF"}}>{data.name}</strong></p>
    <div className="choice-grid" style={{marginTop:8}}>
      {langues.map(l=>(
        <div key={l.id} className={`choice-card ${sel===l.id?"selected":""}`}
          onClick={()=>setSel(l.id)}
          style={sel===l.id?{borderColor:l.accent,background:l.color}:{}}>
          <div className="choice-icon" style={{fontSize:26}}>{l.icon}</div>
          <div>
            <div className="choice-label" style={sel===l.id?{color:l.accent}:{}}>{l.label}</div>
            <div className="choice-desc">{l.desc}</div>
          </div>
          <div className="checkmark" style={sel===l.id?{background:l.accent,borderColor:l.accent,color:"#0A1628"}:{}}>{sel===l.id?"✓":""}</div>
        </div>
      ))}
    </div>
    {err&&<p className="error-msg">{err}</p>}
    <div className="btn-row">
      <button className="btn-secondary" onClick={onBack} style={{width:100}}>← Retour</button>
      <button className="btn-primary" onClick={()=>{if(!sel){setErr("Choisissez un système d'enseignement.");return;}onNext({...data,langue:sel});}}>Suivant →</button>
    </div>
  </div>);
}

function Step4({data,onNext,onBack}){
  const [sel,setSel]=useState(data.levels||[]); const [err,setErr]=useState("");
  const toggle=id=>{setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);setErr("");};
  const langBadge=data.langue==="franco-arabe"
    ?{label:"Franco-Arabe 🌙",color:"#A78BFA",bg:"rgba(167,139,250,.12)"}
    :{label:"Française 🇫🇷",color:"#74C0FC",bg:"rgba(116,192,252,.1)"};
  return(<div className="card">
    <div className="logo-mark"><div className="logo-icon">🏛️</div><div className="logo-text">École<span>Hub</span></div></div>
    <div className="step-indicator">{[0,1,2,3,4].map(i=><div key={i} className={`step-dot ${i===3?"active":i<3?"done":""}`}/>)}</div>
    <h1>Niveaux d'enseignement</h1>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
      <p className="subtitle" style={{marginBottom:0}}>Sélectionnez un ou plusieurs niveaux</p>
      <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:langBadge.bg,color:langBadge.color,border:`1px solid ${langBadge.color}44`,whiteSpace:"nowrap"}}>{langBadge.label}</span>
    </div>
    <div className="choice-grid">{LEVELS.map(l=><div key={l.id} className={`choice-card ${sel.includes(l.id)?"selected":""}`} onClick={()=>toggle(l.id)}><div className="choice-icon">{l.icon}</div><div><div className="choice-label">{l.label}</div><div className="choice-desc">{l.ages}</div></div><div className="checkmark">{sel.includes(l.id)?"✓":""}</div></div>)}</div>
    {err&&<p className="error-msg">{err}</p>}
    <div className="btn-row"><button className="btn-secondary" onClick={onBack} style={{width:100}}>← Retour</button><button className="btn-primary" onClick={()=>{if(!sel.length){setErr("Choisissez au moins un niveau.");return;}onNext({...data,levels:sel});}}>Suivant →</button></div>
  </div>);
}


// ─── GPS Modal ────────────────────────────────────────────────────────────────
function GpsModal({school, onClose, onSaveCoords}){
  const [phase,setPhase]   = useState("idle");  // idle | locating | found | manual | saved
  const [coords,setCoords] = useState(school.gps||null);
  const [manLat,setManLat] = useState(school.gps?.lat||"");
  const [manLng,setManLng] = useState(school.gps?.lng||"");
  const [err,setErr]       = useState("");
  const [saveOk,setSaveOk] = useState(false);

  // Build Google Maps URL from coords or address
  const mapsUrl=(lat,lng)=>`https://www.google.com/maps?q=${lat},${lng}&z=16&t=m`;
  const mapsEmbedUrl=(lat,lng)=>`https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
  const mapsSearchUrl=()=>{
    const addr=[school.name,school.lieu?.commune,school.lieu?.pays].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
  };

  // Auto-detect GPS
  const detectGps=()=>{
    setPhase("locating"); setErr("");
    if(!navigator.geolocation){
      setErr("Géolocalisation non disponible sur cet appareil."); setPhase("manual"); return;
    }
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const c={lat:pos.coords.latitude.toFixed(6), lng:pos.coords.longitude.toFixed(6), accuracy:Math.round(pos.coords.accuracy)};
        setCoords(c); setManLat(c.lat); setManLng(c.lng); setPhase("found");
      },
      err=>{
        const msg=err.code===1?"Autorisation refusée. Activez la géolocalisation.":err.code===2?"Position introuvable.":"Délai dépassé.";
        setErr(msg); setPhase("manual");
      },
      {enableHighAccuracy:true, timeout:10000, maximumAge:0}
    );
  };

  const saveCoords=()=>{
    const lat=parseFloat(manLat); const lng=parseFloat(manLng);
    if(isNaN(lat)||isNaN(lng)||lat<-90||lat>90||lng<-180||lng>180){
      setErr("Coordonnées invalides."); return;
    }
    const c={lat:lat.toFixed(6),lng:lng.toFixed(6)};
    setCoords(c); setSaveOk(true);
    onSaveCoords(school.code,c);
  };

  const hasCoords = coords?.lat&&coords?.lng;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn .2s ease"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#112240",border:"1px solid rgba(78,205,196,.3)",borderRadius:18,padding:"28px 24px",width:"100%",maxWidth:460,animation:"cardIn .3s cubic-bezier(.22,1,.36,1)"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:11,background:"rgba(78,205,196,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📍</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900}}>Localisation GPS</div>
            <div style={{fontSize:12,color:"#8892B0",marginTop:2}}>{school.name}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:20,color:"#8892B0"}}>✕</button>
        </div>

        {/* School address from lieu */}
        {school.lieu&&(
          <div style={{background:"rgba(10,22,40,.7)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#8892B0",lineHeight:1.6}}>
            📍 {[school.lieu.pays,school.lieu.region,school.lieu.typeAdmin==="prefecture"?"Préf.":"S.Préf.",school.lieu[school.lieu.typeAdmin==="prefecture"?"prefecture":"sousPrefecture"],school.lieu.commune,school.lieu.quartierDistrict].filter(Boolean).join(" · ")}
          </div>
        )}

        {/* Saved coords display */}
        {hasCoords&&(
          <div style={{background:"rgba(78,205,196,.08)",border:"1px solid rgba(78,205,196,.25)",borderRadius:11,padding:"12px 14px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700,color:"#4ECDC4"}}>✓ Coordonnées enregistrées</span>
              {saveOk&&<span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:"rgba(78,205,196,.2)",color:"#4ECDC4"}}>Sauvegardé</span>}
            </div>
            <div style={{fontFamily:"monospace",fontSize:13,color:"#fff",marginBottom:10}}>
              <span style={{color:"#8892B0"}}>Lat : </span>{coords.lat}&nbsp;&nbsp;
              <span style={{color:"#8892B0"}}>Lng : </span>{coords.lng}
              {coords.accuracy&&<span style={{color:"#8892B0",fontSize:11}}>&nbsp;· Précision : ±{coords.accuracy}m</span>}
            </div>
            {/* Google Maps buttons */}
            <div style={{display:"flex",gap:8}}>
              <a href={mapsUrl(coords.lat,coords.lng)} target="_blank" rel="noreferrer"
                style={{flex:1,padding:"9px 12px",background:"rgba(66,133,244,.15)",border:"1px solid rgba(66,133,244,.35)",borderRadius:8,color:"#74A7FF",fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:12,cursor:"pointer",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                🗺️ Ouvrir Google Maps
              </a>
              <button onClick={()=>navigator.clipboard?.writeText(`${coords.lat},${coords.lng}`)}
                style={{padding:"9px 12px",background:"rgba(78,205,196,.1)",border:"1px solid rgba(78,205,196,.25)",borderRadius:8,color:"#4ECDC4",fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12,cursor:"pointer"}}>
                📋 Copier
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {phase==="idle"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            <button onClick={detectGps}
              style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,rgba(78,205,196,.25),rgba(78,205,196,.1))",border:"1.5px solid rgba(78,205,196,.4)",borderRadius:11,color:"#4ECDC4",fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:20}}>🎯</span> Détecter ma position GPS automatiquement
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"rgba(136,146,176,.15)"}}/>
              <span style={{fontSize:11,color:"#8892B0"}}>ou</span>
              <div style={{flex:1,height:1,background:"rgba(136,146,176,.15)"}}/>
            </div>
            <button onClick={()=>setPhase("manual")}
              style={{width:"100%",padding:"11px",background:"transparent",border:"1.5px solid rgba(136,146,176,.2)",borderRadius:11,color:"#8892B0",fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>
              ✏️ Saisir les coordonnées manuellement
            </button>
            <a href={mapsSearchUrl()} target="_blank" rel="noreferrer"
              style={{width:"100%",padding:"11px",background:"rgba(66,133,244,.1)",border:"1px solid rgba(66,133,244,.25)",borderRadius:11,color:"#74A7FF",fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              🔍 Rechercher l'école sur Google Maps
            </a>
          </div>
        )}

        {/* Locating spinner */}
        {phase==="locating"&&(
          <div style={{textAlign:"center",padding:"24px 0",marginBottom:16}}>
            <div style={{width:44,height:44,border:"3px solid rgba(78,205,196,.2)",borderTop:"3px solid #4ECDC4",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 14px"}}/>
            <div style={{color:"#8892B0",fontSize:13}}>Recherche de votre position GPS…</div>
            <div style={{color:"#8892B0",fontSize:11,marginTop:4}}>Veuillez autoriser l'accès à la localisation</div>
          </div>
        )}

        {/* Manual entry OR found coords editing */}
        {(phase==="manual"||phase==="found")&&(
          <div style={{marginBottom:16}}>
            {phase==="found"&&(
              <div style={{background:"rgba(78,205,196,.08)",border:"1px solid rgba(78,205,196,.2)",borderRadius:9,padding:"9px 13px",marginBottom:12,fontSize:12,color:"#4ECDC4"}}>
                ✓ Position détectée ! Vérifiez et confirmez.
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div>
                <label style={{fontSize:11,color:"#8892B0",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6,display:"block"}}>Latitude</label>
                <input type="number" step="any" placeholder="Ex: 9.5371" value={manLat} onChange={e=>setManLat(e.target.value)}
                  style={{width:"100%",padding:"11px 12px",background:"#0A1628",border:"1.5px solid rgba(78,205,196,.3)",borderRadius:9,color:"#fff",fontFamily:"monospace",fontSize:13,outline:"none"}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:"#8892B0",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6,display:"block"}}>Longitude</label>
                <input type="number" step="any" placeholder="Ex: -13.6773" value={manLng} onChange={e=>setManLng(e.target.value)}
                  style={{width:"100%",padding:"11px 12px",background:"#0A1628",border:"1.5px solid rgba(78,205,196,.3)",borderRadius:9,color:"#fff",fontFamily:"monospace",fontSize:13,outline:"none"}}/>
              </div>
            </div>
            {manLat&&manLng&&!isNaN(parseFloat(manLat))&&!isNaN(parseFloat(manLng))&&(
              <a href={mapsUrl(manLat,manLng)} target="_blank" rel="noreferrer"
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px",background:"rgba(66,133,244,.1)",border:"1px solid rgba(66,133,244,.25)",borderRadius:9,color:"#74A7FF",fontSize:12,fontWeight:600,textDecoration:"none",marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>
                🗺️ Vérifier sur Google Maps avant d'enregistrer
              </a>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setPhase("idle");setErr("");}}
                style={{padding:"10px 16px",background:"transparent",border:"1.5px solid rgba(136,146,176,.2)",borderRadius:9,color:"#8892B0",fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                ← Retour
              </button>
              <button onClick={saveCoords}
                style={{flex:1,padding:"11px",background:"rgba(78,205,196,.2)",border:"1.5px solid rgba(78,205,196,.4)",borderRadius:9,color:"#4ECDC4",fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                💾 Enregistrer les coordonnées
              </button>
            </div>
          </div>
        )}

        {err&&<div style={{background:"rgba(255,107,107,.08)",border:"1px solid rgba(255,107,107,.2)",borderRadius:9,padding:"10px 13px",marginBottom:12,fontSize:12,color:"#FF6B6B"}}>{err}</div>}

        <button onClick={onClose}
          style={{width:"100%",padding:"12px",background:"rgba(136,146,176,.1)",color:"#8892B0",border:"1.5px solid rgba(136,146,176,.2)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>
          Fermer
        </button>
      </div>
    </div>
  );
}

// ─── SUPER ADMIN DASHBOARD ────────────────────────────────────────────────────
function SuperAdminDashboard({onLogout}){
  const [search,setSearch]=useState("");
  const [editTarget,setEditTarget]=useState(null);
  const [dirForm,setDirForm]=useState({nom:"",prenom:"",tel:"",email:""});
  const [saveMsg,setSaveMsg]=useState("");
  const [showCreds,setShowCreds]=useState(false);
  const [tick,setTick]=useState(0);
  const [visiblePasswords,setVisiblePasswords]=useState(new Set());
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [deleteConfirmText,setDeleteConfirmText]=useState("");
  const [gpsTarget,setGpsTarget]=useState(null);

  const togglePassword=(code)=>setVisiblePasswords(prev=>{
    const next=new Set(prev); next.has(code)?next.delete(code):next.add(code); return next;
  });

  const handleDeleteSchool=()=>{
    if(!deleteTarget) return;
    const db=getSchools(); delete db[deleteTarget.code];
    localStorage.setItem(SCHOOLS_DB_KEY,JSON.stringify(db));
    const sdb=JSON.parse(localStorage.getItem(STUDENTS_DB_KEY)||"{}"); delete sdb[deleteTarget.code];
    localStorage.setItem(STUDENTS_DB_KEY,JSON.stringify(sdb));
    const ddir=getDirectors(); delete ddir[deleteTarget.code]; saveDirectors(ddir);
    setDeleteTarget(null); setDeleteConfirmText(""); setTick(t=>t+1);
  };

  // Force re-read from storage
  const allSchools=useMemo(()=>{
    const db=getSchools();
    return Object.values(db).map(s=>({
      ...s,
      eleves:getStudents(s.code).length,
      directeur:getDirectorFor(s.code)
    }));
  },[tick]);

  const filtered=allSchools.filter(s=>{
    const q=search.toLowerCase();
    return !q||s.name?.toLowerCase().includes(q)||s.code?.toLowerCase().includes(q)||(s.directeur?.nom||"").toLowerCase().includes(q);
  });

  const totalEleves=allSchools.reduce((a,s)=>a+s.eleves,0);
  const totalPublic=allSchools.filter(s=>s.type==="publique").length;
  const totalPrivee=allSchools.filter(s=>s.type==="privee").length;

  const openEdit=(school)=>{
    setEditTarget(school);
    setDirForm({...{nom:"",prenom:"",tel:"",email:""},...school.directeur});
    setSaveMsg("");
  };
  const saveDir=()=>{
    setDirectorFor(editTarget.code,dirForm);
    setSaveMsg("✅ Directeur mis à jour avec succès.");
    setTick(t=>t+1);
    setTimeout(()=>setSaveMsg(""),3000);
  };

  const lvLabels={maternelle:"Mat.",primaire:"Prim.",college:"Coll.",lycee:"Lycée"};

  return(
    <div style={{minHeight:"100vh",background:c.navy,animation:"cardIn .4s cubic-bezier(.22,1,.36,1) both"}}>
      {/* Top bar */}
      <div style={{background:c.navyMid,borderBottom:"1px solid rgba(167,139,250,.2)",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👑</div>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:900,color:c.white}}>Super Admin <span style={{color:c.purple}}>ÉcoleHub</span></div>
            <div style={{fontSize:11,color:c.muted}}>Panneau de supervision · Accès propriétaire</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setShowCreds(v=>!v)} style={{padding:"8px 16px",background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.3)",borderRadius:8,color:c.purple,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}>
            🔑 Mes identifiants
          </button>
          <button onClick={onLogout} style={{padding:"8px 16px",background:"rgba(136,146,176,.1)",border:"1px solid rgba(136,146,176,.2)",borderRadius:8,color:c.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🚪 Déconnexion</button>
        </div>
      </div>

      <div style={{padding:"28px 32px",maxWidth:1300,margin:"0 auto"}}>

        {/* Credentials reveal panel */}
        {showCreds&&(
          <div style={{background:"rgba(124,58,237,.08)",border:"1px solid rgba(167,139,250,.3)",borderRadius:14,padding:"20px 24px",marginBottom:24,animation:"fadeIn .2s ease"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:c.purple,marginBottom:12}}>🔑 Vos identifiants Super Admin</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {[["Code d'accès",SUPER_ADMIN_CODE],["Mot de passe",SUPER_ADMIN_PASS]].map(([lbl,val])=>(
                <div key={lbl} style={{background:c.navy,borderRadius:10,padding:"12px 16px"}}>
                  <div style={{fontSize:10,color:c.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>{lbl}</div>
                  <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:c.white,letterSpacing:".06em"}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:c.muted,marginTop:10}}>⚠️ Gardez ces identifiants confidentiels. Ne les partagez avec personne.</div>
          </div>
        )}

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}>
          {[
            {val:allSchools.length,lbl:"Écoles inscrites",icon:"🏫",color:c.gold},
            {val:totalEleves,lbl:"Total élèves",icon:"👩‍🎓",color:c.success},
            {val:totalPublic,lbl:"Écoles publiques",icon:"🏛️",color:"#74C0FC"},
            {val:totalPrivee,lbl:"Écoles privées",icon:"🎖️",color:c.orange},
          ].map((s,i)=>(
            <div key={i} style={{background:c.navyMid,border:`1px solid rgba(${s.color==="rgba(244,197,66,1)"?"244,197,66":s.color===c.success?"78,205,196":"136,146,176"},.15)`,borderRadius:14,padding:"18px 16px"}}>
              <div style={{fontSize:24,marginBottom:6}}>{s.icon}</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:900,color:s.color}}>{s.val}</div>
              <div style={{fontSize:11,color:c.muted,marginTop:2,textTransform:"uppercase",letterSpacing:".06em"}}>{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* Header + Search */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900}}>Toutes les écoles</div>
          <input className="search-input" style={{maxWidth:320}} placeholder="🔍 Rechercher une école, un code…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {/* Schools table */}
        <div style={{overflowX:"auto",borderRadius:14,border:"1px solid rgba(167,139,250,.15)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead>
              <tr style={{background:"rgba(10,22,40,.9)"}}>
                {["N°","École","Code d'accès","Mot de passe","Type","Niveaux","Élèves","Directeur","Actions"].map((h,i)=>(
                  <th key={i} style={{padding:"10px 14px",fontSize:"10px",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:c.muted,borderBottom:"2px solid rgba(167,139,250,.15)",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:"50px",color:c.muted,fontSize:13}}>Aucune école inscrite</td></tr>}
              {filtered.map((s,i)=>(
                <tr key={s.code} style={{transition:".15s",borderBottom:"1px solid rgba(136,146,176,.07)"}}>
                  <td style={{padding:"13px 14px",color:c.muted,fontSize:12}}>{i+1}</td>
                  <td style={{padding:"13px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:34,height:34,borderRadius:9,background:s.type==="privee"?"rgba(244,197,66,.15)":"rgba(78,205,196,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{s.type==="privee"?"🎖️":"🏛️"}</div>
                      <div style={{fontWeight:700,fontSize:13,color:c.white}}>{s.name}</div>
                    </div>
                  </td>
                  <td style={{padding:"13px 14px"}}>
                    <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:c.gold,background:"rgba(244,197,66,.08)",padding:"3px 10px",borderRadius:6,letterSpacing:".05em"}}>{s.code}</span>
                  </td>
                  <td style={{padding:"13px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:"monospace",fontSize:12,background:"rgba(136,146,176,.08)",padding:"4px 10px",borderRadius:6,color:visiblePasswords.has(s.code)?c.white:c.muted,letterSpacing:visiblePasswords.has(s.code)?".05em":0,minWidth:90,display:"inline-block"}}>
                        {visiblePasswords.has(s.code)?s.password:'•'.repeat(Math.min(s.password?.length||0,8))}
                      </span>
                      <button onClick={()=>togglePassword(s.code)}
                        title={visiblePasswords.has(s.code)?"Masquer":"Afficher le mot de passe"}
                        style={{background:visiblePasswords.has(s.code)?"rgba(167,139,250,.2)":"rgba(136,146,176,.1)",border:`1px solid ${visiblePasswords.has(s.code)?"rgba(167,139,250,.5)":"rgba(136,146,176,.2)"}`,borderRadius:7,padding:"5px 8px",cursor:"pointer",fontSize:14,color:visiblePasswords.has(s.code)?c.purple:c.muted,transition:".15s",lineHeight:1}}>
                        {visiblePasswords.has(s.code)?"🙈":"👁️"}
                      </button>
                    </div>
                  </td>
                  <td style={{padding:"13px 14px"}}><div style={{display:"flex",flexDirection:"column",gap:4}}><span className={`tag tag-${s.type==="publique"?"public":"private"}`}>{s.type==="publique"?"Publique":"Privée"}</span>{s.langue&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,background:s.langue==="franco-arabe"?"rgba(167,139,250,.14)":"rgba(116,192,252,.12)",color:s.langue==="franco-arabe"?"#A78BFA":"#74C0FC",display:"inline-block"}}>{s.langue==="franco-arabe"?"🌙 F-Arabe":"🇫🇷 Française"}</span>}</div></td>
                  <td style={{padding:"13px 14px"}}>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {(s.levels||[]).map(lv=><span key={lv} style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:"rgba(244,197,66,.1)",color:c.gold,fontWeight:600}}>{lvLabels[lv]}</span>)}
                    </div>
                  </td>
                  <td style={{padding:"13px 14px"}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:c.success}}>{s.eleves}</div>
                  </td>
                  <td style={{padding:"13px 14px"}}>
                    {s.directeur?.nom?
                      <div><div style={{fontWeight:600,fontSize:13}}>{s.directeur.prenom} {s.directeur.nom}</div><div style={{fontSize:11,color:c.muted}}>{s.directeur.tel||s.directeur.email||"—"}</div></div>:
                      <span style={{fontSize:12,color:c.muted,fontStyle:"italic"}}>Non renseigné</span>}
                  </td>
                  <td style={{padding:"13px 14px"}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <button onClick={()=>openEdit(s)} style={{padding:"7px 12px",background:"rgba(167,139,250,.12)",border:"1px solid rgba(167,139,250,.3)",borderRadius:8,color:c.purple,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",transition:".15s"}}>✏️ Directeur</button>
                      <button onClick={()=>setGpsTarget(s)} style={{padding:"7px 12px",background:"rgba(78,205,196,.12)",border:"1px solid rgba(78,205,196,.3)",borderRadius:8,color:"#4ECDC4",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",transition:".15s"}}>📍 GPS</button>
                      <button onClick={()=>{setDeleteTarget(s);setDeleteConfirmText("");}} style={{padding:"7px 12px",background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.3)",borderRadius:8,color:c.red,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",transition:".15s"}}>🗑 Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:11,color:c.muted,marginTop:8,textAlign:"right"}}>{filtered.length} école{filtered.length!==1?"s":""} · {totalEleves} élèves au total</div>
      </div>

      {/* Delete School Confirmation Modal */}
      {deleteTarget&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .2s ease"}}
          onClick={e=>e.target===e.currentTarget&&(setDeleteTarget(null),setDeleteConfirmText(""))}>
          <div style={{background:c.navyMid,border:"1px solid rgba(255,107,107,.35)",borderRadius:18,padding:"32px 30px",width:"100%",maxWidth:440,animation:"cardIn .3s cubic-bezier(.22,1,.36,1)"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:46,height:46,borderRadius:12,background:"rgba(255,107,107,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🗑️</div>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900}}>Supprimer l'école</div>
                <div style={{fontSize:12,color:c.muted,marginTop:2}}>Cette action est irréversible</div>
              </div>
            </div>
            {/* School recap */}
            <div style={{background:c.navy,borderRadius:12,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:10,background:deleteTarget.type==="privee"?"rgba(244,197,66,.15)":"rgba(78,205,196,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                {deleteTarget.type==="privee"?"🎖️":"🏛️"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:c.white}}>{deleteTarget.name}</div>
                <div style={{fontSize:11,color:c.muted,marginTop:3,display:"flex",gap:10}}>
                  <span style={{fontFamily:"monospace",color:c.gold}}>{deleteTarget.code}</span>
                  <span>· {deleteTarget.eleves} élève{deleteTarget.eleves!==1?"s":""}</span>
                </div>
              </div>
              <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:"rgba(255,107,107,.14)",color:c.red,textTransform:"uppercase"}}>Suppression</span>
            </div>
            {/* Warning */}
            <div style={{background:"rgba(255,107,107,.07)",border:"1px solid rgba(255,107,107,.2)",borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:12,color:"rgba(255,107,107,.9)",lineHeight:1.6}}>
              ⚠️ Toutes les données de <strong>{deleteTarget.name}</strong> seront définitivement supprimées : informations de l'école, liste des élèves, notes et filiation.
            </div>
            {/* Confirm by typing name */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:c.muted,marginBottom:8}}>
                Pour confirmer, tapez le nom de l'école : <strong style={{color:c.white}}>{deleteTarget.name}</strong>
              </div>
              <input type="text" placeholder={deleteTarget.name} value={deleteConfirmText}
                onChange={e=>setDeleteConfirmText(e.target.value)}
                style={{width:"100%",padding:"12px 14px",background:c.navy,border:`1.5px solid ${deleteConfirmText===deleteTarget.name?"rgba(255,107,107,.6)":"rgba(136,146,176,.2)"}`,borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none",transition:"border-color .2s"}}/>
            </div>
            {/* Buttons */}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setDeleteTarget(null);setDeleteConfirmText("");}}
                style={{flex:1,padding:"12px",background:"transparent",color:c.muted,border:"1.5px solid rgba(136,146,176,.25)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                Annuler
              </button>
              <button onClick={handleDeleteSchool}
                disabled={deleteConfirmText!==deleteTarget.name}
                style={{flex:1,padding:"12px",background:deleteConfirmText===deleteTarget.name?"rgba(255,107,107,.2)":"rgba(136,146,176,.08)",color:deleteConfirmText===deleteTarget.name?c.red:c.muted,border:`1.5px solid ${deleteConfirmText===deleteTarget.name?"rgba(255,107,107,.5)":"rgba(136,146,176,.2)"}`,borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:deleteConfirmText===deleteTarget.name?"pointer":"not-allowed",transition:".2s"}}>
                🗑 Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GPS Modal */}
      {gpsTarget&&(
        <GpsModal school={gpsTarget} onClose={()=>setGpsTarget(null)}
          onSaveCoords={(code,coords)=>{
            const db=getSchools(); if(db[code]){db[code].gps=coords; localStorage.setItem(SCHOOLS_DB_KEY,JSON.stringify(db));} setTick(t=>t+1); setGpsTarget(null);
          }}/>
      )}

      {/* Director Edit Drawer */}
      {editTarget&&(
        <div className="drawer-overlay" onClick={e=>e.target===e.currentTarget&&setEditTarget(null)}>
          <div className="drawer" style={{borderLeft:"1px solid rgba(167,139,250,.3)"}}>
            <div className="drawer-header">
              <div className="drawer-title" style={{color:c.purple}}>✏️ Modifier le directeur</div>
              <button className="btn-icon" onClick={()=>setEditTarget(null)} style={{fontSize:20}}>✕</button>
            </div>

            {/* School recap */}
            <div style={{background:c.navy,borderRadius:11,padding:"14px 16px",marginBottom:22,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:10,background:editTarget.type==="privee"?"rgba(244,197,66,.15)":"rgba(78,205,196,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{editTarget.type==="privee"?"🎖️":"🏛️"}</div>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{editTarget.name}</div>
                <div style={{fontSize:11,color:c.muted,marginTop:2,display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontFamily:"monospace",color:c.gold}}>{editTarget.code}</span>
                  <span>· {editTarget.eleves} élèves</span>
                </div>
              </div>
            </div>

            <div className="drawer-section" style={{color:c.purple}}>👤 Informations du directeur</div>
            <div className="form-grid">
              <div><label>Prénom</label><input type="text" placeholder="Jean" value={dirForm.prenom} onChange={e=>setDirForm(p=>({...p,prenom:e.target.value}))}/></div>
              <div><label>Nom</label><input type="text" placeholder="Dupont" value={dirForm.nom} onChange={e=>setDirForm(p=>({...p,nom:e.target.value}))}/></div>
              <div><label>Téléphone</label><input type="text" placeholder="06 xx xx xx xx" value={dirForm.tel} onChange={e=>setDirForm(p=>({...p,tel:e.target.value}))}/></div>
              <div><label>Email</label><input type="email" placeholder="directeur@ecole.fr" value={dirForm.email} onChange={e=>setDirForm(p=>({...p,email:e.target.value}))}/></div>
            </div>

            {saveMsg&&<div style={{background:"rgba(78,205,196,.1)",border:"1px solid rgba(78,205,196,.3)",borderRadius:9,padding:"10px 14px",marginTop:14,fontSize:13,color:c.success}}>{saveMsg}</div>}

            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button className="btn-secondary" onClick={()=>setEditTarget(null)} style={{width:100}}>Annuler</button>
              <button className="btn-primary" onClick={saveDir} style={{marginTop:0,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",color:c.white}}>💾 Enregistrer le directeur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── School modules ───────────────────────────────────────────────────────────
function StudentDrawer({schoolData,student,onClose,onSave}){
  const isEdit=!!student;
  const avail=LEVELS.filter(l=>schoolData.levels.includes(l.id));
  const blank={prenom:"",nom:"",niveau:avail[0]?.id||"",classe:"",dateNaissance:"",genre:"M",statut:"actif",
    noteCours:"",noteEval:"",noteCompo:"",paiement:"impayé",montant:"",
    pere:{prenom:"",nom:"",fonction:"",tel:"",gmail:""},
    mere:{prenom:"",nom:"",profession:"",tel:""}};
  const [f,setF]=useState(student?{...student,
    noteCours:student.noteCours??"",noteEval:student.noteEval??"",
    noteCompo:student.noteCompo??"",montant:student.montant??""}:blank);
  const [err,setErr]=useState("");
  const set=(k,v)=>setF(p=>({...p,[k]:v,...(k==="niveau"?{classe:""}:{})}));
  const setPere=(k,v)=>setF(p=>({...p,pere:{...p.pere,[k]:v}}));
  const setMere=(k,v)=>setF(p=>({...p,mere:{...p.mere,[k]:v}}));
  const classes=LEVELS.find(l=>l.id===f.niveau)?.classes||[];
  const isPrivee=schoolData.type==="privee";
  const pn=v=>v===""||v===null||v===undefined?null:parseFloat(v);
  const save=()=>{
    if(!f.prenom.trim()||!f.nom.trim()||!f.niveau||!f.classe){
      setErr("Prénom, nom, niveau et classe sont requis.");return;
    }
    onSave({...f,id:f.id||genId(),noteCours:pn(f.noteCours),noteEval:pn(f.noteEval),noteCompo:pn(f.noteCompo),montant:pn(f.montant)||0});
  };

  return(
    <div className="drawer-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-title">{isEdit?"Modifier l'élève":"Ajouter un élève"}</div>
          <button className="btn-icon" onClick={onClose} style={{fontSize:20}}>✕</button>
        </div>

        <div className="drawer-section" style={{color:c.gold}}>👤 Élève</div>
        <div className="form-grid">
          <div><label>Prénom *</label><input type="text" placeholder="Amara" value={f.prenom} onChange={e=>set("prenom",e.target.value)}/></div>
          <div><label>Nom *</label><input type="text" placeholder="Diallo" value={f.nom} onChange={e=>set("nom",e.target.value)}/></div>
          <div><label>Niveau *</label>
            <select value={f.niveau} onChange={e=>set("niveau",e.target.value)}>
              {avail.map(l=><option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
            </select>
          </div>
          <div><label>Classe *</label>
            <select value={f.classe} onChange={e=>set("classe",e.target.value)}>
              <option value="">-- Choisir --</option>
              {classes.map(cl=><option key={cl} value={cl}>{cl}</option>)}
            </select>
          </div>
          <div><label>Genre</label>
            <select value={f.genre} onChange={e=>set("genre",e.target.value)}>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </div>
          <div><label>Date de naissance</label>
            <input type="date" value={f.dateNaissance} onChange={e=>set("dateNaissance",e.target.value)}/>
          </div>
          <div><label>Statut</label>
            <select value={f.statut} onChange={e=>set("statut",e.target.value)}>
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
            </select>
          </div>
        </div>

        <div className="drawer-section" style={{color:c.success}}>📊 Notes</div>
        <div className="form-grid">
          <div><label>Note cours /20</label><input type="number" placeholder="Ex: 14" value={f.noteCours} onChange={e=>set("noteCours",e.target.value)}/></div>
          <div><label>Note éval. /20</label><input type="number" placeholder="Ex: 15" value={f.noteEval} onChange={e=>set("noteEval",e.target.value)}/></div>
          <div><label>Note compo /20</label><input type="number" placeholder="Ex: 13" value={f.noteCompo} onChange={e=>set("noteCompo",e.target.value)}/></div>
        </div>

        {isPrivee&&(
          <>
            <div className="drawer-section" style={{color:c.orange}}>💰 Paiement</div>
            <div className="form-grid">
              <div><label>Statut paiement</label>
                <select value={f.paiement} onChange={e=>set("paiement",e.target.value)}>
                  <option value="payé">Payé</option>
                  <option value="partiel">Partiel</option>
                  <option value="impayé">Impayé</option>
                </select>
              </div>
              <div><label>Montant (FCFA)</label><input type="number" placeholder="Ex: 50000" value={f.montant} onChange={e=>set("montant",e.target.value)}/></div>
            </div>
          </>
        )}

        <div className="drawer-section" style={{color:"#74C0FC"}}>👨 Père / Tuteur</div>
        <div className="form-grid">
          <div><label>Prénom</label><input type="text" placeholder="Mohamed" value={f.pere.prenom} onChange={e=>setPere("prenom",e.target.value)}/></div>
          <div><label>Nom</label><input type="text" placeholder="Diallo" value={f.pere.nom} onChange={e=>setPere("nom",e.target.value)}/></div>
          <div><label>Fonction</label><input type="text" placeholder="Ingénieur" value={f.pere.fonction} onChange={e=>setPere("fonction",e.target.value)}/></div>
          <div><label>Téléphone</label><input type="text" placeholder="06 xx xx xx xx" value={f.pere.tel} onChange={e=>setPere("tel",e.target.value)}/></div>
          <div className="span2">
            <label style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:15}}>📧</span> Adresse Gmail du père
            </label>
            <input type="email" placeholder="exemple@gmail.com" value={f.pere.gmail||""} onChange={e=>setPere("gmail",e.target.value)}
              style={{marginTop:4}}/>
          </div>
        </div>

        <div className="drawer-section" style={{color:"#F9A8D4"}}>👩 Mère / Tutrice</div>
        <div className="form-grid">
          <div><label>Prénom</label><input type="text" placeholder="Fatoumata" value={f.mere.prenom} onChange={e=>setMere("prenom",e.target.value)}/></div>
          <div><label>Nom</label><input type="text" placeholder="Diallo" value={f.mere.nom} onChange={e=>setMere("nom",e.target.value)}/></div>
          <div><label>Profession</label><input type="text" placeholder="Médecin" value={f.mere.profession} onChange={e=>setMere("profession",e.target.value)}/></div>
          <div><label>Téléphone</label><input type="text" placeholder="06 xx xx xx xx" value={f.mere.tel} onChange={e=>setMere("tel",e.target.value)}/></div>
        </div>

        {err&&<p className="error-msg" style={{marginTop:10}}>{err}</p>}
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button className="btn-secondary" onClick={onClose} style={{width:100}}>Annuler</button>
          <button className="btn-primary" onClick={save} style={{marginTop:0}}>
            {isEdit?"💾 Enregistrer":"➕ Ajouter l'élève"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ALL_CLASSES_ORDERED=["PS","MS","GS","CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","Terminale"];
const CLASS_TO_LEVEL={"PS":"maternelle","MS":"maternelle","GS":"maternelle","CP":"primaire","CE1":"primaire","CE2":"primaire","CM1":"primaire","CM2":"primaire","6ème":"college","5ème":"college","4ème":"college","3ème":"college","2nde":"lycee","1ère":"lycee","Terminale":"lycee"};

// ─── A4PreviewDoc ─────────────────────────────────────────────────────────────
function A4PreviewDoc({student,schoolData,admin,isSousP,director,lvL,dateInscription,recit,langueLabel,typeLabel}){
  return(
    <div id="a4-preview-content" style={{background:"#fff",color:"#111",width:"210mm",minHeight:"297mm",
      margin:"0 auto",padding:"18mm 18mm 16mm",
      fontFamily:"'Times New Roman',Times,serif",fontSize:"11pt",lineHeight:1.85,
      boxShadow:"0 4px 32px rgba(0,0,0,.18)",borderRadius:4}}>

      {/* EN-TETE OFFICIEL 3 COLONNES */}
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,paddingBottom:10,marginBottom:10,borderBottom:"2px solid #1a1a6e"}}>
        <div style={{fontSize:"8pt",lineHeight:1.9,color:"#222"}}>
          {admin.ire&&<div><strong>I.R.E :</strong> {admin.ire}</div>}
          {admin.dpe&&<div><strong>D.P.E :</strong> {admin.dpe}</div>}
          {isSousP&&admin.dse&&<div><strong>D.S.E :</strong> {admin.dse}</div>}
          {admin.etablissement&&<div><strong>Et. :</strong> {admin.etablissement}</div>}
          {admin.niveau&&<div><strong>Niveau :</strong> {admin.niveau}</div>}
          {admin.classe&&<div><strong>Classe :</strong> {admin.classe}</div>}
          {admin.annee&&<div><strong>Annee :</strong> {admin.annee}</div>}
        </div>
        <div style={{textAlign:"center",minWidth:160}}>
          <div style={{fontSize:"11pt",fontWeight:900,letterSpacing:1,fontFamily:"Georgia,serif",color:"#1a1a6e",textTransform:"uppercase"}}>Republique de Guinee</div>
          <div style={{fontSize:"9.5pt",fontWeight:700,fontStyle:"italic",marginTop:4}}>
            <span style={{color:"#DC2626"}}>Travail</span>
            <span style={{color:"#666"}}> — </span>
            <span style={{color:"#B45309"}}>Justice</span>
            <span style={{color:"#666"}}> — </span>
            <span style={{color:"#16A34A"}}>Solidarite</span>
          </div>
          <div style={{marginTop:8,fontSize:"8.5pt",color:"#333",lineHeight:1.6}}>
            <div style={{fontWeight:700}}>{schoolData.name}</div>
            <div style={{fontSize:"20pt",margin:"4px 0 2px"}}>🏛️</div>
            <div style={{fontSize:"7.5pt",color:"#666"}}>Annee scolaire {admin.annee||"—"}</div>
          </div>
        </div>
        <div style={{fontSize:"8pt",lineHeight:1.9,color:"#222",direction:"rtl",textAlign:"right"}}>
          {admin.ire&&<div><strong>م.ج.ت :</strong> {admin.ire}</div>}
          {admin.dpe&&<div><strong>م.ت.م :</strong> {admin.dpe}</div>}
          {isSousP&&admin.dse&&<div><strong>م.ت.ع :</strong> {admin.dse}</div>}
          {admin.etablissement&&<div>{admin.etablissement}</div>}
          {admin.annee&&<div>{admin.annee}</div>}
        </div>
      </div>

      {/* TITRE */}
      <div style={{textAlign:"center",margin:"14px 0 12px"}}>
        <div style={{display:"inline-block",borderTop:"1.5pt double #1a1a6e",borderBottom:"1.5pt double #1a1a6e",padding:"5pt 20pt",fontSize:"13pt",fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#1a1a6e",fontFamily:"Georgia,serif"}}>
          Recit d'Inscription
        </div>
      </div>
      <div style={{textAlign:"right",fontSize:"8pt",color:"#777",marginBottom:12,fontStyle:"italic"}}>
        N° Ref : {student.id} &nbsp;|&nbsp; Date : {dateInscription}
      </div>

      {/* TABLEAU INFOS */}
      <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16,fontSize:"9pt",border:"0.5pt solid #ccc"}}>
        <tbody>
          {[
            ["Nom et Prenom",`${student.nom} ${student.prenom}`,"Classe",`${student.classe} — ${lvL[student.niveau]||""}`],
            ["Date de naissance",student.dateNaissance||"—","Genre",student.genre==="F"?"Feminin":"Masculin"],
            ["Pere / Tuteur",`${student.pere?.prenom||""} ${student.pere?.nom||""}`.trim()||"—","Fonction",student.pere?.fonction||"—"],
            ["Mere / Tutrice",`${student.mere?.prenom||""} ${student.mere?.nom||""}`.trim()||"—","Profession",student.mere?.profession||"—"],
            ["Tel. pere",student.pere?.tel||"—","Tel. mere",student.mere?.tel||"—"],
            ["Type",typeLabel,"Systeme",langueLabel],
          ].map((row,i)=>(
            <tr key={i} style={{borderBottom:"0.5pt solid #ddd"}}>
              <td style={{padding:"4pt 7pt",background:"#f0f0f8",fontWeight:700,color:"#1a1a6e",width:"22%",fontSize:"8.5pt",borderRight:"0.5pt solid #ccc"}}>{row[0]}</td>
              <td style={{padding:"4pt 7pt",width:"28%",borderRight:"1pt solid #ccc"}}>{row[1]}</td>
              <td style={{padding:"4pt 7pt",background:"#f0f0f8",fontWeight:700,color:"#1a1a6e",width:"22%",fontSize:"8.5pt",borderRight:"0.5pt solid #ccc"}}>{row[2]}</td>
              <td style={{padding:"4pt 7pt",width:"28%"}}>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* CORPS */}
      <div style={{marginBottom:20}}>
        {recit.split("\n\n").filter(p=>p.trim()).map((p,i)=>{
          // Mettre les noms propres en MAJUSCULES GRAS
          const names=[
            student.nom, student.prenom,
            `${student.nom} ${student.prenom}`,
            `${student.prenom} ${student.nom}`,
            student.pere?.nom, student.pere?.prenom,
            `${student.pere?.prenom||""} ${student.pere?.nom||""}`.trim(),
            student.mere?.nom, student.mere?.prenom,
            `${student.mere?.prenom||""} ${student.mere?.nom||""}`.trim(),
            schoolData.name,
            director?.nom, director?.prenom,
            `${director?.prenom||""} ${director?.nom||""}`.trim(),
          ].filter(Boolean).filter(n=>n.length>2)
           .sort((a,b)=>b.length-a.length); // longest first

          let txt=p.trim();
          names.forEach(name=>{
            const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
            txt=txt.replace(new RegExp("\\b"+escaped+"\\b","gi"), match=>match.toUpperCase());
          });

          // Render: find UPPERCASE sequences and bold them
          const parts=txt.split(/([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ\s]{2,})/g);
          return(
            <p key={i} style={{marginBottom:"1.1em",textIndent:"1.5em",textAlign:"justify",lineHeight:1.9}}>
              {parts.map((part,j)=>
                /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ\s]{2,}$/.test(part)
                  ?<strong key={j}>{part}</strong>
                  :<span key={j}>{part}</span>
              )}
            </p>
          );
        })}
      </div>

      {/* SIGNATURES */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:40,marginTop:32,paddingTop:16,borderTop:"0.5pt solid #ccc"}}>
        <div style={{textAlign:"center"}}>
          <div style={{height:44}}></div>
          <div style={{borderTop:"1pt solid #444",paddingTop:6}}>
            <div style={{fontSize:"9pt",color:"#555",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Le Parent / Tuteur</div>
            <div style={{fontWeight:700,fontSize:"10pt",marginTop:4}}>{student.pere?.prenom||""} {student.pere?.nom||""}</div>
          </div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{height:44}}></div>
          <div style={{borderTop:"1pt solid #444",paddingTop:6}}>
            <div style={{fontSize:"9pt",color:"#555",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Le Directeur(trice)</div>
            <div style={{fontWeight:700,fontSize:"10pt",marginTop:4}}>{director.prenom||""} {director.nom||""}</div>
          </div>
        </div>
      </div>

      {/* PIED DE PAGE */}
      <div style={{marginTop:24,textAlign:"center",fontSize:"7.5pt",color:"#aaa",borderTop:"0.5pt solid #eee",paddingTop:6}}>
        EcoleHub SaaS &nbsp;&bull;&nbsp; {schoolData.name} &nbsp;&bull;&nbsp; {schoolData.code} &nbsp;&bull;&nbsp; {dateInscription}
      </div>
    </div>
  );
}


function RecitModal({student,schoolData,onClose}){
  const [recit,setRecit]=useState("");
  const [loading,setLoading]=useState(true);
  const [err2,setErr2]=useState("");
  const [showA4,setShowA4]=useState(false);
  const lvL={maternelle:"Maternelle",primaire:"Primaire",college:"Collège",lycee:"Lycée"};
  const age=student.dateNaissance?Math.floor((Date.now()-new Date(student.dateNaissance))/(365.25*24*3600*1000)):null;
  const dateInscription=new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
  const director=getDirectorFor(schoolData.code)||{};
  const admin=schoolData.admin||{};
  const isSousP=schoolData.lieu?.typeAdmin==="sous-prefecture";
  const langueLabel=schoolData.langue==="franco-arabe"?"Franco-Arabe":"Française";
  const typeLabel=schoolData.type==="publique"?"Publique":"Privée";
  const lieu=schoolData.lieu||{};

  const generate=async()=>{
    setLoading(true);setErr2("");setRecit("");setShowA4(false);
    const lieu=schoolData.lieu||{};
    const prompt=`Tu es le secrétaire général d'une école officielle de la République de Guinée. Rédige un récit d'inscription administratif formel et solennel en 4 paragraphes bien développés (minimum 4 phrases chacun).

INFOS OFFICIELLES:
- I.R.E: ${admin.ire||"—"} | D.P.E: ${admin.dpe||"—"}${isSousP?` | D.S.E: ${admin.dse||"—"}`:""}
- Etablissement: ${admin.etablissement||schoolData.name} (${typeLabel}, Systeme ${langueLabel})
- Classe: ${student.classe} | Annee: ${admin.annee||"—"} | Lieu: ${lieu.commune||lieu.prefecture||""}

IDENTITE ELEVE:
- ${student.nom} ${student.prenom}, ${student.genre==="F"?"Feminin":"Masculin"}${age?`, ${age} ans`:""}${student.dateNaissance?`, ne(e) le ${student.dateNaissance}`:""}

FILIATION:
- Pere: ${student.pere?.prenom||""} ${student.pere?.nom||""}, ${student.pere?.fonction||"—"}, Tel: ${student.pere?.tel||"—"}
- Mere: ${student.mere?.prenom||""} ${student.mere?.nom||""}, ${student.mere?.profession||"—"}, Tel: ${student.mere?.tel||"—"}

Direction: ${director.prenom||""} ${director.nom||""} | Date: ${dateInscription}

STRUCTURE:
Par.1: Accueil solennel - date, nom complet, classe, etablissement, references IRE/DPE.
Par.2: Identite et filiation complete - parents, professions, coordonnees.
Par.3: Engagements - reglement scolaire, responsabilites parents et eleve.
Par.4: Conclusion - encouragements officiels, voeux de reussite, signature du directeur.

Style: francais administratif formel. Chaque paragraphe au moins 4 phrases.`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})
      });
      const data=await res.json();
      const raw=data.content?.find(b=>b.type==="text")?.text||"";
      if(!raw)throw new Error();
      // Nettoyer le texte : enlever markdown (*, **, #, _, ---)
      const cleaned=raw
        .replace(/\*{1,3}([^*]+)\*{1,3}/g,"$1")  // **gras** -> texte
        .replace(/_{1,2}([^_]+)_{1,2}/g,"$1")       // _italique_ -> texte
        .replace(/^#{1,6}\s*/gm,"")                 // # titres -> rien
        .replace(/^[-*]{3,}$/gm,"")                  // --- ou *** -> rien
        .replace(/^[•\-\*]\s+/gm,"")              // puces -> rien
        .replace(/\n{3,}/g,"\n\n")                // triple sauts -> double
        .trim();
      setRecit(cleaned);
    }catch{setErr2("Erreur de génération. Vérifiez votre connexion.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{generate();},[]);

  // ── Build HTML document ────────────────────────────────────────────────────
  const buildDoc=(autoprintStr="")=>{
    const paragraphs=recit.split("\n\n").filter(p=>p.trim())
      .map(p=>`<p style="text-indent:2em;margin-bottom:13pt;text-align:justify;line-height:1.8;">${p.trim()}</p>`)
      .join("");
    const lvLabel={maternelle:"Maternelle",primaire:"Primaire",college:"Collège",lycee:"Lycée"};
    const dirName=director?(director.prenom+" "+director.nom).trim():"";
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Recit_${student.nom}_${student.prenom}</title>
<style>
  @page{size:A4 portrait;margin:2cm 1.8cm;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Times New Roman',Times,serif;font-size:11.5pt;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  strong{font-weight:bold;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2pt solid #1a1a6e;padding-bottom:10pt;margin-bottom:14pt;gap:6pt;}
  .col{flex:1;font-size:8.5pt;line-height:1.8;}
  .col-c{flex:1.2;text-align:center;padding:0 6pt;}
  .col-r{flex:1;font-size:8.5pt;line-height:1.8;text-align:right;direction:rtl;}
  .rep{font-size:11.5pt;font-weight:900;letter-spacing:1pt;text-transform:uppercase;color:#1a1a6e;}
  .devise{font-style:italic;font-weight:700;font-size:10pt;margin-top:3pt;}
  .t-rouge{color:#DC2626;}
  .t-jaune{color:#B45309;}
  .t-vert{color:#16A34A;}
  .title-wrap{text-align:center;margin:16pt 0 12pt;}
  .title{display:inline-block;border-top:1.5pt double #1a1a6e;border-bottom:1.5pt double #1a1a6e;padding:5pt 18pt;font-size:13pt;font-weight:bold;color:#1a1a6e;letter-spacing:2pt;text-transform:uppercase;}
  .ref{text-align:right;font-size:8pt;color:#666;margin-bottom:12pt;font-style:italic;}
  table{width:100%;border-collapse:collapse;margin-bottom:14pt;font-size:9pt;}
  td{padding:3.5pt 7pt;border:0.5pt solid #ccc;vertical-align:top;}
  .lbl{background:#f0f0f8;font-weight:bold;color:#1a1a6e;width:24%;}
  .body-text{margin-bottom:14pt;}
  .sigs{display:flex;justify-content:space-between;margin-top:28pt;}
  .sig{text-align:center;width:42%;}
  .sig-line{border-top:1pt solid #444;margin-top:32pt;margin-bottom:5pt;}
  .sig-lbl{font-size:8pt;font-weight:bold;color:#1a1a6e;text-transform:uppercase;letter-spacing:.5pt;}
  .sig-name{font-size:8pt;color:#444;margin-top:2pt;}
  .footer{position:fixed;bottom:.6cm;left:0;right:0;text-align:center;font-size:7.5pt;color:#aaa;border-top:.5pt solid #ddd;padding-top:4pt;}
  @media print{html,body{width:210mm;height:297mm;}}
</style>
</head>
<body>
${autoprintStr}
<!-- Official Letterhead -->
<div class="header">
  <div class="col">
    ${admin.ire?`<div><strong>I.R.E :</strong> ${admin.ire}</div>`:""}
    ${admin.dpe?`<div><strong>D.P.E :</strong> ${admin.dpe}</div>`:""}
    ${isSousP&&admin.dse?`<div><strong>D.S.E :</strong> ${admin.dse}</div>`:""}
    ${admin.etablissement?`<div><strong>Ét. :</strong> ${admin.etablissement}</div>`:""}
    ${admin.niveau?`<div><strong>Niveau :</strong> ${admin.niveau}</div>`:""}
    ${admin.classe?`<div><strong>Classe :</strong> ${admin.classe}</div>`:""}
    ${admin.annee?`<div><strong>Année :</strong> ${admin.annee}</div>`:""}
  </div>
  <div class="col-c">
    <div class="rep">République de Guinée</div>
    <div class="devise">
      <span class="t-rouge"><strong><em>Travail</em></strong></span>
      &nbsp;-&nbsp;
      <span class="t-jaune"><strong><em>Justice</em></strong></span>
      &nbsp;-&nbsp;
      <span class="t-vert"><strong><em>Solidarité</em></strong></span>
    </div>
  </div>
  <div class="col-r">
    ${admin.ire?`<div><strong>م.ج.ت :</strong> ${admin.ire}</div>`:""}
    ${admin.dpe?`<div><strong>م.ت.م :</strong> ${admin.dpe}</div>`:""}
    ${isSousP&&admin.dse?`<div><strong>م.ت.ع :</strong> ${admin.dse}</div>`:""}
    ${admin.etablissement?`<div><strong>المؤسسة :</strong> ${admin.etablissement}</div>`:""}
    ${admin.annee?`<div><strong>السنة :</strong> ${admin.annee}</div>`:""}
  </div>
</div>

<div class="title-wrap"><div class="title">RÉCIT D'INSCRIPTION</div></div>
<div class="ref">N° Réf : ${student.id} &nbsp;|&nbsp; Date : ${dateInscription}</div>

<table>
  <tr><td class="lbl">Nom & Prénom</td><td><strong>${student.nom} ${student.prenom}</strong></td>
      <td class="lbl">Classe</td><td>${student.classe} — ${lvLabel[student.niveau]||""}</td></tr>
  <tr><td class="lbl">Né(e) le</td><td>${student.dateNaissance||"—"}</td>
      <td class="lbl">Genre</td><td>${student.genre==="F"?"Féminin":"Masculin"}</td></tr>
  <tr><td class="lbl">Père / Tuteur</td><td>${student.pere?.prenom||""} ${student.pere?.nom||""}</td>
      <td class="lbl">Fonction</td><td>${student.pere?.fonction||"—"}</td></tr>
  <tr><td class="lbl">Mère / Tutrice</td><td>${student.mere?.prenom||""} ${student.mere?.nom||""}</td>
      <td class="lbl">Profession</td><td>${student.mere?.profession||"—"}</td></tr>
  <tr><td class="lbl">Téléphone père</td><td>${student.pere?.tel||"—"}</td>
      <td class="lbl">Téléphone mère</td><td>${student.mere?.tel||"—"}</td></tr>
</table>

<div class="body-text">${paragraphs}</div>

<div class="sigs">
  <div class="sig">
    <div class="sig-line"></div>
    <div class="sig-lbl">Le Directeur / La Directrice</div>
    <div class="sig-name">${dirName||schoolData.name}</div>
  </div>
  <div class="sig">
    <div class="sig-line"></div>
    <div class="sig-lbl">Signature du Parent / Tuteur</div>
    <div class="sig-name">${student.pere?.prenom||""} ${student.pere?.nom||""}</div>
  </div>
</div>

<div class="footer">
  ${schoolData.name} · Année scolaire ${admin.annee||"—"} · Document généré le ${dateInscription}
</div>
</body>
</html>`;
  };

  // ── 🖼️ TÉLÉCHARGER EN IMAGE ──────────────────────────────────────────────────
  const handleDownloadImage=async()=>{
    if(!window.html2canvas){
      await new Promise((resolve,reject)=>{
        const s=document.createElement("script");
        s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload=resolve;s.onerror=reject;
        document.head.appendChild(s);
      });
    }
    const el=document.getElementById("a4-preview-content");
    if(!el){alert("Veuillez d'abord ouvrir l'aperçu A4.");return;}
    try{
      const canvas=await window.html2canvas(el,{
        scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false,
        width:el.offsetWidth,height:el.offsetHeight,
      });
      const imgData=canvas.toDataURL("image/png");
      const a=document.createElement("a");
      a.href=imgData;
      a.download=`Recit_${student.nom}_${student.prenom}.png`;
      document.body.appendChild(a);a.click();
      setTimeout(()=>document.body.removeChild(a),500);
    }catch(err){
      alert("Erreur capture image : "+err.message);
    }
  };

  const handleWhatsApp=()=>{
    const tel=(student.pere?.tel||"").replace(/[\s\-\.\(\)]/g,"");
    if(!tel){alert("Numéro du père non renseigné.");return;}
    const msg=`Bonjour ${student.pere?.prenom||""},\n\nRécit d'inscription de ${student.prenom} ${student.nom} en ${student.classe}.\n\n${recit.slice(0,400)}...\n\nCordialement,\n${schoolData.name}`;
    const a=document.createElement("a");a.href=`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;a.target="_blank";a.rel="noreferrer";document.body.appendChild(a);a.click();setTimeout(()=>document.body.removeChild(a),500);
  };
  const handleGmail=()=>{
    const gmail=student.pere?.gmail||"";
    if(!gmail){alert("Gmail du père non renseigné.");return;}
    const a=document.createElement("a");
    a.href=`mailto:${gmail}?subject=${encodeURIComponent(`Récit d'inscription — ${student.prenom} ${student.nom}`)}&body=${encodeURIComponent(`Bonjour,\n\n${recit}\n\nCordialement,\n${schoolData.name}`)}`;
    a.style.display="none";document.body.appendChild(a);a.click();setTimeout(()=>document.body.removeChild(a),500);
  };
  const handlePrint=()=>{
    const htmlContent=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Récit</title><style>body{font-family:Georgia,serif;font-size:11.5pt;line-height:1.8;margin:20mm 18mm;color:#111}</style></head><body>${recit.split("\n\n").map(p=>`<p style="text-indent:1.5em;text-align:justify;margin-bottom:1em">${p.trim()}</p>`).join("")}<script>window.onload=function(){window.print();}<\/script></body></html>`;
    const dataUrl="data:text/html;charset=utf-8,"+encodeURIComponent(htmlContent);
    const win=window.open(dataUrl,"_blank");
    if(!win){const iframe=document.createElement("iframe");iframe.style.cssText="position:fixed;left:-9999px;top:0;width:0;height:0;border:none;";document.body.appendChild(iframe);iframe.contentDocument.open();iframe.contentDocument.write(htmlContent);iframe.contentDocument.close();setTimeout(()=>{iframe.contentWindow.print();setTimeout(()=>document.body.removeChild(iframe),2000);},500);}
  };
  const handleDownload=async()=>{
    // Bouton loading state
    const btnEl=document.getElementById("btn-dl-recit");
    if(btnEl){btnEl.textContent="⏳ Génération…";btnEl.disabled=true;}
    try{
      // Charger jsPDF depuis CDN si pas encore chargé
      if(!window.jspdf){
        await new Promise((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          s.onload=res; s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
      const PW=210; const ML=15; const MR=15; const TW=PW-ML-MR;
      let y=18;

      // ── EN-TÊTE 3 COLONNES ──
      pdf.setFontSize(7.5); pdf.setFont("helvetica","normal");

      // Colonne gauche (FR)
      const leftLines=[];
      if(admin.ire)              leftLines.push(`I.R.E : ${admin.ire}`);
      if(admin.dpe)              leftLines.push(`D.P.E : ${admin.dpe}`);
      if(isSousP&&admin.dse)    leftLines.push(`D.S.E : ${admin.dse}`);
      if(admin.etablissement)   leftLines.push(`Ét. : ${admin.etablissement}`);
      if(admin.niveau)          leftLines.push(`Niveau : ${admin.niveau}`);
      if(admin.classe)          leftLines.push(`Classe : ${admin.classe}`);
      if(admin.annee)           leftLines.push(`Année : ${admin.annee}`);
      leftLines.forEach((line,i)=>{ pdf.text(line,ML,y+i*4); });

      // Colonne centrale (République)
      const cx=PW/2;
      pdf.setFontSize(10); pdf.setFont("helvetica","bold");
      pdf.text("REPUBLIQUE DE GUINEE",cx,y,{align:"center"});
      // Devise colorée
      pdf.setFontSize(8.5); pdf.setFont("helvetica","bolditalic");
      const dy=y+6;
      const tw=pdf.getTextWidth("Travail");
      const ti1=pdf.getTextWidth(" - ");
      const tj=pdf.getTextWidth("Justice");
      const ti2=pdf.getTextWidth(" - ");
      const ts=pdf.getTextWidth("Solidarite");
      const totalW=tw+ti1+tj+ti2+ts;
      let dx=cx-totalW/2;
      pdf.setTextColor(220,38,38);  pdf.text("Travail",dx,dy);   dx+=tw;
      pdf.setTextColor(80,80,80);   pdf.text(" - ",dx,dy);        dx+=ti1;
      pdf.setTextColor(180,83,9);   pdf.text("Justice",dx,dy);   dx+=tj;
      pdf.setTextColor(80,80,80);   pdf.text(" - ",dx,dy);        dx+=ti2;
      pdf.setTextColor(22,163,74);  pdf.text("Solidarite",dx,dy);
      pdf.setTextColor(0,0,0);

      // Colonne droite
      const rightLines=[];
      if(admin.ire)             rightLines.push(`I.R.E : ${admin.ire}`);
      if(admin.dpe)             rightLines.push(`D.P.E : ${admin.dpe}`);
      if(isSousP&&admin.dse)   rightLines.push(`D.S.E : ${admin.dse}`);
      if(admin.etablissement)  rightLines.push(`${admin.etablissement}`);
      if(admin.annee)          rightLines.push(`${admin.annee}`);
      pdf.setFontSize(7.5); pdf.setFont("helvetica","normal");
      rightLines.forEach((line,i)=>{ pdf.text(line,PW-MR,y+i*4,{align:"right"}); });

      y+=Math.max(leftLines.length,rightLines.length)*4+4;

      // Ligne séparatrice
      pdf.setDrawColor(26,26,110); pdf.setLineWidth(0.6);
      pdf.line(ML,y,PW-MR,y); y+=8;

      // ── TITRE ──
      pdf.setFontSize(13); pdf.setFont("helvetica","bold"); pdf.setTextColor(26,26,110);
      const titleText="RECIT D'INSCRIPTION";
      const titleW=pdf.getTextWidth(titleText);
      pdf.setLineWidth(0.4);
      pdf.line(cx-titleW/2-4,y-4,cx+titleW/2+4,y-4);
      pdf.text(titleText,cx,y,{align:"center"});
      pdf.line(cx-titleW/2-4,y+2,cx+titleW/2+4,y+2);
      y+=10; pdf.setTextColor(0,0,0);

      // Référence
      pdf.setFontSize(8); pdf.setFont("helvetica","italic"); pdf.setTextColor(100,100,100);
      pdf.text(`Réf. : ${student.id}   |   Date : ${dateInscription}`,PW-MR,y,{align:"right"});
      y+=8; pdf.setTextColor(0,0,0);

      // ── TABLEAU INFOS ÉLÈVE ──
      pdf.setFontSize(8.5); pdf.setFont("helvetica","normal");
      const rows=[
        ["Nom et Prénom",`${student.nom} ${student.prenom}`,"Date de naissance",student.dateNaissance||"—"],
        ["Niveau",lvL[student.niveau]||"","Classe",student.classe||"—"],
        ["Père / Tuteur",`${student.pere?.prenom||""} ${student.pere?.nom||""} — ${student.pere?.fonction||"—"}`,"Tél. père",student.pere?.tel||"—"],
        ["Mère / Tutrice",`${student.mere?.prenom||""} ${student.mere?.nom||""} — ${student.mere?.profession||"—"}`,"Tél. mère",student.mere?.tel||"—"],
      ];
      const col=[0,50,100,150]; const rowH=7;
      rows.forEach(row=>{
        pdf.setFillColor(240,240,248); pdf.rect(ML,y-4,col[1],rowH,"F");
        pdf.setFillColor(240,240,248); pdf.rect(ML+col[2],y-4,col[3]-col[2],rowH,"F");
        pdf.setDrawColor(200,200,210); pdf.setLineWidth(0.2);
        pdf.rect(ML,y-4,TW,rowH);
        pdf.line(ML+col[1],y-4,ML+col[1],y+rowH-4);
        pdf.line(ML+col[2],y-4,ML+col[2],y+rowH-4);
        pdf.line(ML+col[3],y-4,ML+col[3],y+rowH-4);
        pdf.setFont("helvetica","bold"); pdf.setTextColor(26,26,110);
        pdf.text(row[0],ML+1,y);
        pdf.setFont("helvetica","normal"); pdf.setTextColor(0,0,0);
        pdf.text(row[1]||"—",ML+col[1]+1,y,{maxWidth:col[2]-col[1]-2});
        pdf.setFont("helvetica","bold"); pdf.setTextColor(26,26,110);
        pdf.text(row[2],ML+col[2]+1,y);
        pdf.setFont("helvetica","normal"); pdf.setTextColor(0,0,0);
        pdf.text(row[3]||"—",ML+col[3]+1,y,{maxWidth:TW-col[3]});
        y+=rowH;
      });
      y+=6;

      // ── CORPS DU RÉCIT ──
      pdf.setFontSize(11); pdf.setFont("times","normal"); pdf.setTextColor(17,17,17);
      const allParas=recit.split("\n\n").filter(p=>p.trim());
      allParas.forEach(para=>{
        const lines=pdf.splitTextToSize(para.trim(),TW-6);
        if(lines.length>0){
          pdf.text(lines[0],ML+8,y); y+=6;
          if(lines.length>1){
            lines.slice(1).forEach(line=>{pdf.text(line,ML,y);y+=5.5;});
          }
        }
        y+=4;
        if(y>258){pdf.addPage();y=18;}
      });
      y+=6;

      // ── SIGNATURES ──
      if(y>245){pdf.addPage();y=20;}
      pdf.setFontSize(9); pdf.setFont("helvetica","normal");
      const sigY=y+28;
      pdf.setDrawColor(50,50,50); pdf.setLineWidth(0.3);
      // Signature parent
      pdf.line(ML,sigY,ML+65,sigY);
      pdf.setFont("helvetica","bold"); pdf.setTextColor(26,26,110);
      pdf.text("LE PARENT / TUTEUR",ML+32,sigY+5,{align:"center"});
      pdf.setFont("helvetica","normal"); pdf.setTextColor(60,60,60);
      pdf.text(`${student.pere?.prenom||""} ${student.pere?.nom||""}`.trim(),ML+32,sigY+9,{align:"center"});
      // Signature directeur
      pdf.line(PW-MR-65,sigY,PW-MR,sigY);
      pdf.setFont("helvetica","bold"); pdf.setTextColor(26,26,110);
      pdf.text("LE DIRECTEUR(TRICE)",PW-MR-32,sigY+5,{align:"center"});
      pdf.setFont("helvetica","normal"); pdf.setTextColor(60,60,60);
      const dirName=director?`${director.prenom||""} ${director.nom||""}`.trim():"";
      pdf.text(dirName||"—",PW-MR-32,sigY+9,{align:"center"});

      // ── PIED DE PAGE ──
      pdf.setFontSize(7.5); pdf.setTextColor(170,170,170); pdf.setFont("helvetica","normal");
      const footY=290;
      pdf.setDrawColor(220,220,220); pdf.setLineWidth(0.2);
      pdf.line(ML,footY-3,PW-MR,footY-3);
      pdf.text(`EcoleHub SaaS  ·  ${schoolData.name}  ·  ${schoolData.code}  ·  ${dateInscription}`,cx,footY,{align:"center"});

      // ── SAUVEGARDER ──
      pdf.save(`Recit_${student.nom}_${student.prenom}_${student.id}.pdf`);

    }catch(err){
      console.error("jsPDF error:",err);
      handlePrint(); // fallback: impression
    }finally{
      if(btnEl){btnEl.textContent="📥 Télécharger";btnEl.disabled=false;}
    }
  };



  if(showA4) return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:300,overflowY:"auto",padding:"20px 0",animation:"fadeIn .2s ease"}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(10,22,40,.97)",borderBottom:"1px solid rgba(244,197,66,.2)",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={()=>setShowA4(false)} style={{padding:"8px 16px",background:"transparent",border:"1.5px solid rgba(136,146,176,.3)",borderRadius:8,color:c.muted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>← Retour</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:900,color:"#fff",flex:1}}>📄 Aperçu A4 — {student.prenom} {student.nom}</div>
        <button onClick={handleDownload} style={{padding:"10px 16px",background:"rgba(78,205,196,.9)",color:"#0A1628",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>📥 Télécharger</button>
        <button onClick={handleDownloadImage} style={{padding:"10px 16px",background:"rgba(167,139,250,.9)",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}>🖼️ Image</button>
        <button onClick={handlePrint} style={{padding:"10px 16px",background:c.gold,color:c.navy,border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🖨️ Imprimer</button>
        <button onClick={handleWhatsApp} style={{padding:"10px 16px",background:"#25D366",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>📱 WhatsApp</button>
        {student.pere?.gmail&&<button onClick={handleGmail} style={{padding:"10px 16px",background:"#EA4335",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>📧 Gmail</button>}
        <button onClick={onClose} style={{padding:"8px 16px",background:"rgba(255,107,107,.12)",border:"1px solid rgba(255,107,107,.25)",borderRadius:8,color:"#FF6B6B",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>✕</button>
      </div>
      <div style={{padding:"24px 16px"}}>
        <A4PreviewDoc student={student} schoolData={schoolData} admin={admin} isSousP={isSousP} director={director} lvL={lvL} dateInscription={dateInscription} recit={recit} langueLabel={langueLabel} typeLabel={typeLabel}/>
      </div>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .2s ease"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.25)",borderRadius:18,padding:"28px 26px",width:"100%",maxWidth:540,maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexShrink:0}}>
          <div style={{width:42,height:42,borderRadius:10,background:"rgba(244,197,66,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📄</div>
          <div style={{flex:1}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900}}>Récit d'inscription</div><div style={{fontSize:12,color:c.muted}}>Généré par IA · {dateInscription}</div></div>
          <button onClick={onClose} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:20,color:c.muted}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",marginBottom:14}}>
          {loading&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px",gap:12}}><div style={{width:36,height:36,border:`3px solid rgba(244,197,66,.2)`,borderTop:`3px solid ${c.gold}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{color:c.muted,fontSize:13}}>Génération en cours…</div></div>}
          {err2&&<div style={{background:"rgba(255,107,107,.08)",border:"1px solid rgba(255,107,107,.2)",borderRadius:10,padding:"14px",color:c.red,fontSize:13}}>⚠️ {err2}<button onClick={generate} style={{display:"block",marginTop:10,background:"rgba(255,107,107,.15)",border:"1px solid rgba(255,107,107,.3)",borderRadius:8,padding:"7px 14px",color:c.red,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🔄 Réessayer</button></div>}
          {recit&&<div style={{background:c.navy,borderRadius:12,padding:"18px",fontSize:13.5,lineHeight:1.9,color:"rgba(255,255,255,.88)"}}>
              {recit.split("\n\n").filter(p=>p.trim()).map((p,i)=>{
                const parts=p.trim().split(/([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ\s]{2,})/g);
                return(
                  <p key={i} style={{marginBottom:14,textIndent:"1.2em"}}>
                    {parts.map((part,j)=>
                      /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ\s]{2,}$/.test(part)
                        ?<strong key={j} style={{color:"#fff",fontWeight:900}}>{part}</strong>
                        :<span key={j}>{part}</span>
                    )}
                  </p>
                );
              })}
            </div>}
        </div>
        <div style={{display:"flex",gap:10,flexShrink:0,flexWrap:"wrap"}}>
          {recit&&<>
            <button onClick={generate} style={{padding:"10px 14px",background:"transparent",color:c.muted,border:"1.5px solid rgba(136,146,176,.25)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12,cursor:"pointer"}}>🔄 Regénérer</button>
            <button onClick={()=>navigator.clipboard?.writeText(recit)} style={{padding:"10px 14px",background:"rgba(244,197,66,.1)",color:c.gold,border:"1.5px solid rgba(244,197,66,.3)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12,cursor:"pointer"}}>📋 Copier</button>
            <button onClick={()=>setShowA4(true)} style={{flex:1,padding:"10px 14px",background:"rgba(78,205,196,.15)",color:c.success,border:"1.5px solid rgba(78,205,196,.3)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
              📄 Aperçu A4 & Impression
            </button>
          </>}
          <button onClick={onClose} style={{padding:"10px 18px",background:c.gold,color:c.navy,border:"none",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>✓ Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── EditableCell ─────────────────────────────────────────────────────────────

function matMoy(notes){
  if(!notes) return null;
  const v=[notes.cours,notes.eval,notes.compo].filter(x=>x!==null&&x!==undefined&&x!=="");
  if(!v.length) return null;
  return v.reduce((a,b)=>a+parseFloat(b),0)/v.length;
}

function EditableCell({value,onSave,borderLeft}){
  const [editing,setEditing]=useState(false);
  const [v,setV]=useState(value!=null?String(value):"");
  const commit=()=>{setEditing(false);const n=v===""?null:parseFloat(v);if(!isNaN(n)||v==="")onSave(isNaN(n)?null:n);};
  if(editing) return(
    <td style={{padding:"4px 8px",borderLeft:borderLeft?"1px solid rgba(136,146,176,.12)":undefined}}>
      <input type="number" autoFocus value={v} min={0} max={20} step={0.25}
        onChange={e=>setV(e.target.value)} onBlur={commit}
        onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setEditing(false);setV(value!=null?String(value):"");}}}
        style={{width:52,padding:"4px 6px",background:c.navy,border:"1.5px solid "+c.gold,borderRadius:6,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:12,outline:"none",textAlign:"center"}}/>
    </td>
  );
  const m=mention(value);
  return(
    <td onClick={()=>{setEditing(true);setV(value!=null?String(value):"");}}
      style={{padding:"8px 10px",textAlign:"center",cursor:"pointer",fontSize:12,fontWeight:600,color:value===null?c.muted:m.color,borderLeft:borderLeft?"1px solid rgba(136,146,176,.12)":undefined}}
      title="Cliquer pour modifier">
      {value===null?"—":value%1===0?value:value.toFixed(2)}
    </td>
  );
}

// ─── CollegeResultsView ───────────────────────────────────────────────────────
function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

// ─── Main ResultsModule (router) ────────────────────────────────────────────

function CollegeResultsView({schoolData, selectedClasse, langue}){
  const students=useMemo(()=>
    getStudents(schoolData.code)
      .filter(s=>s.statut==="actif"&&s.classe===selectedClasse)
      .sort((a,b)=>a.nom.localeCompare(b.nom,"fr",{sensitivity:"base"}))
  ,[selectedClasse]);

  const [results,setResultsState]=useState(()=>getResults(schoolData.code));
  const [view,setView]=useState("saisie");
  const MATIERES=getMatieres(langue||"francaise",CLASS_TO_LEVEL[selectedClasse]||"college");

  const updateNote=(sid,sem,matKey,field,val)=>{
    const upd={...results};
    if(!upd[sid]) upd[sid]={};
    if(!upd[sid][sem]) upd[sid][sem]={};
    if(!upd[sid][sem][matKey]) upd[sid][sem][matKey]={};
    upd[sid][sem][matKey][field]=val===""||val===null?null:parseFloat(val);
    setResultsState(upd);
    saveResults(schoolData.code,upd);
  };
  const getN=(sid,sem,mk)=>results[sid]?.[sem]?.[mk]||{};
  const matSemMoy=(sid,sem,mk)=>matMoy(getN(sid,sem,mk));
  const semMoyGen=(sid,sem)=>{
    const moys=MATIERES.map(m=>matSemMoy(sid,sem,m.key)).filter(v=>v!==null);
    return moys.length?moys.reduce((a,b)=>a+b,0)/moys.length:null;
  };
  const annMoy=(sid)=>{
    const s1=semMoyGen(sid,"S1"),s2=semMoyGen(sid,"S2");
    return s1!==null&&s2!==null?(s1+s2)/2:s1!==null?s1:s2;
  };

  const anns=students.map(s=>annMoy(s.id)).filter(v=>v!==null);
  const statMoy=anns.length?anns.reduce((a,b)=>a+b,0)/anns.length:null;
  const statMax=anns.length?Math.max(...anns):null;
  const statMin=anns.length?Math.min(...anns):null;
  const ranked=[...students].map(s=>({s,ann:annMoy(s.id)})).filter(r=>r.ann!==null).sort((a,b)=>b.ann-a.ann);

  const SEMS=[
    {key:"S1",label:"1er Semestre",  color:"#74C0FC",bg:"rgba(116,192,252,.07)",border:"rgba(116,192,252,.25)"},
    {key:"S2",label:"2ème Semestre", color:"#86EFAC",bg:"rgba(134,239,172,.07)",border:"rgba(134,239,172,.25)"},
  ];

  if(!students.length) return(
    <div className="empty-state"><div className="big">📊</div><div style={{fontWeight:600}}>Aucun élève actif dans cette classe</div></div>
  );

  return(
    <div>
      {/* Vue selector */}
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:14}}>
        {["saisie","classement"].map(v=>(
          <button key={v} onClick={()=>setView(v)}
            style={{padding:"8px 16px",borderRadius:9,
              border:`1.5px solid ${view===v?"rgba(244,197,66,.4)":"rgba(136,146,176,.2)"}`,
              background:view===v?"rgba(244,197,66,.1)":"transparent",
              color:view===v?c.gold:c.muted,
              fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12,cursor:"pointer"}}>
            {v==="saisie"?"✏️ Saisie des notes":"🏆 Classement"}
          </button>
        ))}
      </div>

      {/* Stats */}
      {statMoy!==null&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {[
            {label:"Moy. annuelle classe",val:statMoy.toFixed(2),color:mention(statMoy).color},
            {label:"Meilleure moyenne",   val:statMax.toFixed(2),color:"#4ECDC4"},
            {label:"Plus basse",          val:statMin.toFixed(2),color:"#FF6B6B"},
            {label:"Admis (≥10)",         val:`${anns.filter(v=>v>=10).length}/${anns.length}`,color:"#86EFAC"},
          ].map((st,i)=>(
            <div key={i} style={{background:c.navyMid,border:"1px solid rgba(136,146,176,.1)",borderRadius:11,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:st.color}}>{st.val}</div>
              <div style={{fontSize:10,color:c.muted,marginTop:2,textTransform:"uppercase",letterSpacing:".05em"}}>{st.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TABLEAU SAISIE ──
          Structure :
          Élève | ←────── 1er Semestre ─────────────────────→ | ←────── 2ème Semestre ──────────────────→ | Moy.Ann.
                | Mat1   Mat2   Mat3  ...  Moy.S1             | Mat1   Mat2   Mat3  ...  Moy.S2            |
                | C E X M  C E X M  C E X M  ...              | C E X M  C E X M  ...                     |
      */}
      {view==="saisie"&&(
        <div style={{overflowX:"auto",borderRadius:14,border:"1px solid rgba(244,197,66,.15)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:Math.max(800,MATIERES.length*2*110+280)}}>
            <thead>
              {/* Ligne 1 : Élève | S1 (colspan) | S2 (colspan) | Moy.Ann. */}
              <tr style={{background:"rgba(10,22,40,.98)"}}>
                <th rowSpan={3} style={{
                  padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:c.gold,
                  textTransform:"uppercase",letterSpacing:".07em",
                  borderRight:"2px solid rgba(244,197,66,.15)",
                  position:"sticky",left:0,background:"rgba(10,22,40,.98)",zIndex:3,
                  minWidth:160,verticalAlign:"middle"}}>
                  Élève
                </th>
                {SEMS.map((sem,si)=>(
                  <th key={sem.key}
                    colSpan={MATIERES.length*4+1}
                    style={{
                      padding:"10px 12px",textAlign:"center",fontSize:12,fontWeight:900,
                      color:sem.color,
                      borderBottom:"1px solid "+sem.border,
                      borderLeft:si===0?"none":"2px solid "+sem.border,
                      letterSpacing:".06em",textTransform:"uppercase",
                      background:`rgba(${si===0?"116,192,252":"134,239,172"},.05)`}}>
                    {sem.label}
                  </th>
                ))}
                {/* Moy. Annuelle */}
                <th rowSpan={3} style={{
                  padding:"10px 12px",textAlign:"center",fontSize:12,fontWeight:900,
                  color:"#F4C542",textTransform:"uppercase",letterSpacing:".06em",
                  borderLeft:"2px solid rgba(244,197,66,.35)",
                  background:"rgba(244,197,66,.06)",
                  verticalAlign:"middle",minWidth:90}}>
                  Moy.<br/>Ann.
                </th>
              </tr>

              {/* Ligne 2 : Pour chaque semestre : Mat1 Mat2 ... Moy.S */}
              <tr style={{background:"rgba(10,22,40,.92)"}}>
                {SEMS.map((sem,si)=>[
                  ...MATIERES.map(mat=>(
                    <th key={sem.key+mat.key} colSpan={4} style={{
                      padding:"7px 6px",textAlign:"center",fontSize:10,fontWeight:700,
                      color:mat.color||sem.color,
                      borderBottom:"1px solid rgba(136,146,176,.12)",
                      borderLeft:"1px solid rgba(136,146,176,.1)",
                      whiteSpace:"nowrap",letterSpacing:".03em",
                      direction:mat.rtl?"rtl":"ltr"}}>
                      {mat.icon} {mat.label}
                    </th>
                  )),
                  <th key={sem.key+"moy"} style={{
                    padding:"7px 8px",textAlign:"center",fontSize:10,fontWeight:900,
                    color:sem.color,
                    borderBottom:"1px solid "+sem.border,
                    borderLeft:"1px solid rgba(136,146,176,.15)",
                    whiteSpace:"nowrap",
                    background:`rgba(${si===0?"116,192,252":"134,239,172"},.06)`}}>
                    Moy. {sem.key}
                  </th>,
                ])}
              </tr>

              {/* Ligne 3 : Cours / Éval. / Comp. / Moy. pour chaque matière de chaque semestre */}
              <tr style={{background:"rgba(10,22,40,.85)"}}>
                {SEMS.map((sem)=>[
                  ...MATIERES.map(mat=>(
                    ["Cours","Éval.","Comp.","Moy."].map((lbl,ci)=>(
                      <th key={sem.key+mat.key+lbl} style={{
                        padding:"4px 4px",textAlign:"center",fontSize:8,fontWeight:600,
                        color:`${sem.color}99`,
                        borderBottom:"2px solid rgba(244,197,66,.15)",
                        borderLeft:ci===0?"1px solid rgba(136,146,176,.1)":undefined,
                        letterSpacing:".03em",whiteSpace:"nowrap"}}>
                        {lbl}
                      </th>
                    ))
                  )),
                  <th key={sem.key+"moylbl"} style={{
                    padding:"4px 4px",textAlign:"center",fontSize:8,fontWeight:600,
                    color:`${sem.color}99`,
                    borderBottom:"2px solid rgba(244,197,66,.15)",
                    borderLeft:"1px solid rgba(136,146,176,.15)",
                    whiteSpace:"nowrap"}}>/20</th>,
                ])}
              </tr>
            </thead>

            <tbody>
              {students.map((s,si)=>{
                const s1moy=semMoyGen(s.id,"S1");
                const s2moy=semMoyGen(s.id,"S2");
                const ann=annMoy(s.id);
                const meAnn=mention(ann);
                return(
                  <tr key={s.id} style={{borderBottom:"1px solid rgba(136,146,176,.07)",background:si%2===0?"transparent":"rgba(10,22,40,.2)"}}>
                    {/* Nom élève */}
                    <td style={{padding:"9px 14px",position:"sticky",left:0,
                      background:si%2===0?c.navyMid:"rgba(17,34,64,.95)",zIndex:1,
                      borderRight:"2px solid rgba(244,197,66,.1)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:28,height:28,borderRadius:"50%",
                          background:s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:11,fontWeight:700,
                          color:s.genre==="F"?c.purple:c.success,flexShrink:0}}>
                          {s.prenom[0]}{s.nom[0]}
                        </div>
                        <div>
                          <div style={{fontWeight:600,fontSize:12}}>{s.nom} {s.prenom}</div>
                          <div style={{fontSize:9,color:c.muted}}>{s.id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Notes par semestre */}
                    {SEMS.map((sem,si2)=>{
                      const semMoyVal=sem.key==="S1"?s1moy:s2moy;
                      const meSem=mention(semMoyVal);
                      return[
                        ...MATIERES.map(mat=>{
                          const n=getN(s.id,sem.key,mat.key);
                          const mm=matSemMoy(s.id,sem.key,mat.key);
                          const meMat=mention(mm);
                          return[
                            <EditableCell key={sem.key+mat.key+"c"} value={n.cours??null} borderLeft={true}
                              onSave={v=>updateNote(s.id,sem.key,mat.key,"cours",v)}/>,
                            <EditableCell key={sem.key+mat.key+"e"} value={n.eval??null}
                              onSave={v=>updateNote(s.id,sem.key,mat.key,"eval",v)}/>,
                            <EditableCell key={sem.key+mat.key+"x"} value={n.compo??null}
                              onSave={v=>updateNote(s.id,sem.key,mat.key,"compo",v)}/>,
                            <td key={sem.key+mat.key+"m"} style={{
                              padding:"7px 5px",textAlign:"center",fontSize:11,fontWeight:700,
                              color:mm!==null?meMat.color:c.muted,
                              background:mm!==null?sem.bg:"transparent"}}>
                              {mm!==null?mm.toFixed(1):"—"}
                            </td>,
                          ];
                        }),
                        /* Moy. du semestre */
                        <td key={sem.key+"moy"} style={{
                          padding:"9px 8px",textAlign:"center",
                          fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:900,
                          color:semMoyVal!==null?meSem.color:c.muted,
                          background:semMoyVal!==null?sem.bg:"transparent",
                          borderLeft:`1px solid ${sem.border}`}}>
                          {semMoyVal!==null?semMoyVal.toFixed(2):"—"}
                        </td>,
                      ];
                    })}

                    {/* Moy. Annuelle */}
                    <td style={{
                      padding:"9px 10px",textAlign:"center",
                      fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:900,
                      color:ann!==null?meAnn.color:c.muted,
                      background:ann!==null?`rgba(${meAnn.rgb},.1)`:"rgba(244,197,66,.04)",
                      borderLeft:"2px solid rgba(244,197,66,.35)"}}>
                      <div>{ann!==null?ann.toFixed(2):"—"}</div>
                      <div style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",fontWeight:700,
                        color:ann!==null?meAnn.color:c.muted,opacity:.8}}>
                        {ann!==null?meAnn.label:""}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer moyennes de la classe */}
            <tfoot>
              <tr style={{background:"rgba(10,22,40,.97)",borderTop:"2px solid rgba(244,197,66,.3)"}}>
                <td style={{padding:"10px 14px",fontWeight:900,fontSize:11,color:c.gold,
                  textTransform:"uppercase",letterSpacing:".06em",
                  position:"sticky",left:0,background:"rgba(10,22,40,.97)",zIndex:1,
                  borderRight:"2px solid rgba(244,197,66,.1)"}}>
                  Moy. classe
                </td>
                {SEMS.map((sem)=>[
                  ...MATIERES.map(mat=>{
                    const vals=students.map(s=>matSemMoy(s.id,sem.key,mat.key)).filter(v=>v!==null);
                    const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                    const me=mention(avg);
                    return[
                      <td key={sem.key+mat.key+"fc"} style={{borderLeft:"1px solid rgba(136,146,176,.1)"}}></td>,
                      <td key={sem.key+mat.key+"fe"}></td>,
                      <td key={sem.key+mat.key+"fx"}></td>,
                      <td key={sem.key+mat.key+"fm"} style={{padding:"8px 5px",textAlign:"center",fontSize:11,fontWeight:700,
                        color:avg!==null?me.color:c.muted}}>
                        {avg!==null?avg.toFixed(1):"—"}
                      </td>,
                    ];
                  }),
                  (()=>{
                    const vals=students.map(s=>semMoyGen(s.id,sem.key)).filter(v=>v!==null);
                    const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                    const me=mention(avg);
                    return(
                      <td key={sem.key+"fmoy"} style={{padding:"10px 8px",textAlign:"center",
                        fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:900,
                        color:avg!==null?me.color:c.muted,
                        borderLeft:`1px solid ${sem.border}`}}>
                        {avg!==null?avg.toFixed(2):"—"}
                      </td>
                    );
                  })(),
                ])}
                {(()=>{
                  const vals=students.map(s=>annMoy(s.id)).filter(v=>v!==null);
                  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                  const me=mention(avg);
                  return(
                    <td style={{padding:"10px 10px",textAlign:"center",
                      fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,
                      color:avg!==null?me.color:c.muted,
                      background:"rgba(244,197,66,.06)",
                      borderLeft:"2px solid rgba(244,197,66,.35)"}}>
                      {avg!==null?avg.toFixed(2):"—"}
                    </td>
                  );
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Classement */}
      {view==="classement"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {ranked.length===0&&<div className="empty-state"><div className="big">🏆</div><div style={{fontWeight:600}}>Aucune note saisie</div></div>}
          {ranked.map((row,ri)=>{
            const me=mention(row.ann);const medals=["🥇","🥈","🥉"];
            const s1=semMoyGen(row.s.id,"S1"),s2=semMoyGen(row.s.id,"S2");
            return(
              <div key={row.s.id} style={{background:c.navyMid,
                border:`1px solid ${ri<3?"rgba(244,197,66,.3)":"rgba(136,146,176,.1)"}`,
                borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:ri<3?28:18,fontWeight:900,
                  color:ri===0?"#FFD700":ri===1?"#C0C0C0":ri===2?"#CD7F32":c.muted,minWidth:44,textAlign:"center"}}>
                  {ri<3?medals[ri]:`#${ri+1}`}
                </div>
                <div style={{width:38,height:38,borderRadius:"50%",
                  background:row.s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:700,fontSize:15,color:row.s.genre==="F"?c.purple:c.success,flexShrink:0}}>
                  {row.s.prenom[0]}{row.s.nom[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{row.s.prenom} {row.s.nom}</div>
                  <div style={{fontSize:11,color:c.muted,marginTop:3,display:"flex",gap:20}}>
                    <span>Moy. S1 : <strong style={{color:s1!==null?mention(s1).color:c.muted}}>{s1!==null?s1.toFixed(2):"—"}</strong></span>
                    <span>Moy. S2 : <strong style={{color:s2!==null?mention(s2).color:c.muted}}>{s2!==null?s2.toFixed(2):"—"}</strong></span>
                  </div>
                </div>
                <div style={{textAlign:"center",background:`rgba(${me.rgb},.1)`,borderRadius:10,padding:"8px 14px"}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:900,color:me.color}}>{row.ann.toFixed(2)}</div>
                  <div style={{fontSize:10,fontWeight:700,color:me.color,marginTop:2}}>{me.label}</div>
                  <div style={{fontSize:9,color:c.muted}}>Moy. Ann.</div>
                </div>
              </div>
            );
          })}
          {students.filter(s=>annMoy(s.id)===null).length>0&&(
            <div style={{marginTop:8,padding:"10px 14px",background:"rgba(136,146,176,.05)",borderRadius:10,fontSize:12,color:c.muted}}>
              Sans note : {students.filter(s=>annMoy(s.id)===null).map(s=>`${s.prenom} ${s.nom}`).join(", ")}
            </div>
          )}
        </div>
      )}
      <div style={{fontSize:11,color:c.muted,marginTop:10,textAlign:"right"}}>
        {students.length} élève{students.length!==1?"s":""} · {MATIERES.length} matière{MATIERES.length!==1?"s":""} · Sauvegarde automatique
      </div>
    </div>
  );
}

function PrimaireResultsView({schoolData, selectedClasse}){
  const students=useMemo(()=>
    getStudents(schoolData.code)
      .filter(s=>s.statut==="actif"&&s.classe===selectedClasse)
      .sort((a,b)=>a.nom.localeCompare(b.nom,"fr",{sensitivity:"base"}))
  ,[selectedClasse]);
  const [results,setResultsState]=useState(()=>getResults(schoolData.code));
  const [view,setView]=useState("saisie");

  const PERIODS=[
    {key:"T1",label:"1er Trimestre",  color:"#74C0FC",bg:"rgba(116,192,252,.07)",border:"rgba(116,192,252,.25)"},
    {key:"T2",label:"2ème Trimestre", color:"#86EFAC",bg:"rgba(134,239,172,.07)",border:"rgba(134,239,172,.25)"},
    {key:"T3",label:"3ème Trimestre", color:"#F9A8D4",bg:"rgba(249,168,212,.07)",border:"rgba(249,168,212,.25)"},
  ];

  const getMoy=(sid,pk)=>{const n=results[sid]?.[`${pk.toLowerCase()}_gen`];return n?.moy!=null?parseFloat(n.moy):null;};
  const updateMoy=(sid,pk,val)=>{
    const upd={...results};
    if(!upd[sid]) upd[sid]={};
    const key=`${pk.toLowerCase()}_gen`;
    if(!upd[sid][key]) upd[sid][key]={};
    upd[sid][key].moy=val===""||val===null?null:parseFloat(val);
    setResultsState(upd);
    saveResults(schoolData.code,upd);
  };
  const getAnn=(sid)=>{
    const vals=PERIODS.map(p=>getMoy(sid,p.key)).filter(v=>v!==null);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  };

  const anns=students.map(s=>getAnn(s.id)).filter(v=>v!==null);
  const statMoy=anns.length?anns.reduce((a,b)=>a+b,0)/anns.length:null;
  const ranked=[...students].map(s=>({s,ann:getAnn(s.id)})).filter(r=>r.ann!==null).sort((a,b)=>b.ann-a.ann);

  if(!students.length) return(
    <div className="empty-state"><div className="big">📊</div><div style={{fontWeight:600}}>Aucun élève actif dans cette classe</div></div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:14}}>
        {["saisie","classement"].map(v=>(
          <button key={v} onClick={()=>setView(v)}
            style={{padding:"8px 16px",borderRadius:9,
              border:`1.5px solid ${view===v?"rgba(244,197,66,.4)":"rgba(136,146,176,.2)"}`,
              background:view===v?"rgba(244,197,66,.1)":"transparent",
              color:view===v?c.gold:c.muted,
              fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12,cursor:"pointer"}}>
            {v==="saisie"?"✏️ Saisie des notes":"🏆 Classement"}
          </button>
        ))}
      </div>

      {statMoy!==null&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {[
            {label:"Moy. annuelle classe",val:statMoy.toFixed(2),color:mention(statMoy).color},
            {label:"Admis (≥10)",val:`${anns.filter(v=>v>=10).length}/${anns.length}`,color:"#86EFAC"},
            {label:"Élèves notés",val:`${anns.length}/${students.length}`,color:"#74C0FC"},
          ].map((st,i)=>(
            <div key={i} style={{background:c.navyMid,border:"1px solid rgba(136,146,176,.1)",borderRadius:11,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:st.color}}>{st.val}</div>
              <div style={{fontSize:10,color:c.muted,marginTop:2,textTransform:"uppercase",letterSpacing:".05em"}}>{st.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TABLEAU SAISIE ──
          Structure :
          Élève | ← 1er Trimestre → | ← 2ème Trimestre → | ← 3ème Trimestre → | Moy.Ann. | Mention
                | Moyenne /20        | Moyenne /20         | Moyenne /20         |          |
      */}
      {view==="saisie"&&(
        <div style={{overflowX:"auto",borderRadius:14,border:"1px solid rgba(244,197,66,.15)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:560}}>
            <thead>
              {/* Ligne 1 : Élève | T1 | T2 | T3 | Moy.Ann. | Mention */}
              <tr style={{background:"rgba(10,22,40,.98)"}}>
                <th rowSpan={2} style={{
                  padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:c.gold,
                  textTransform:"uppercase",letterSpacing:".07em",
                  borderRight:"2px solid rgba(244,197,66,.15)",
                  position:"sticky",left:0,background:"rgba(10,22,40,.98)",zIndex:3,
                  minWidth:160,verticalAlign:"middle"}}>
                  Élève
                </th>
                {PERIODS.map((p,pi)=>(
                  <th key={p.key} style={{
                    padding:"10px 16px",textAlign:"center",fontSize:12,fontWeight:900,
                    color:p.color,
                    borderBottom:"1px solid "+p.border,
                    borderLeft:pi===0?"none":"2px solid "+p.border,
                    letterSpacing:".06em",textTransform:"uppercase",
                    background:p.bg,minWidth:130}}>
                    {p.label}
                  </th>
                ))}
                <th rowSpan={2} style={{
                  padding:"10px 12px",textAlign:"center",fontSize:12,fontWeight:900,
                  color:"#F4C542",textTransform:"uppercase",letterSpacing:".06em",
                  borderLeft:"2px solid rgba(244,197,66,.35)",
                  background:"rgba(244,197,66,.06)",
                  verticalAlign:"middle",minWidth:100}}>
                  Moy.<br/>Annuelle
                </th>
                <th rowSpan={2} style={{
                  padding:"10px 12px",textAlign:"center",fontSize:11,fontWeight:700,
                  color:"#F4C542",textTransform:"uppercase",letterSpacing:".06em",
                  verticalAlign:"middle",minWidth:90}}>
                  Mention
                </th>
              </tr>
              {/* Ligne 2 : sous-titre /20 pour chaque trimestre */}
              <tr style={{background:"rgba(10,22,40,.88)"}}>
                {PERIODS.map((p,pi)=>(
                  <th key={p.key+"sub"} style={{
                    padding:"5px 16px",textAlign:"center",fontSize:9,fontWeight:600,
                    color:`${p.color}99`,
                    borderBottom:"2px solid rgba(244,197,66,.15)",
                    borderLeft:pi===0?"none":"2px solid "+p.border,
                    letterSpacing:".04em"}}>
                    Moyenne /20
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {students.map((s,si)=>{
                const ann=getAnn(s.id);
                const meAnn=mention(ann);
                return(
                  <tr key={s.id} style={{borderBottom:"1px solid rgba(136,146,176,.07)",background:si%2===0?"transparent":"rgba(10,22,40,.2)"}}>
                    {/* Nom */}
                    <td style={{padding:"10px 14px",position:"sticky",left:0,
                      background:si%2===0?c.navyMid:"rgba(17,34,64,.95)",zIndex:1,
                      borderRight:"2px solid rgba(244,197,66,.1)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:30,height:30,borderRadius:"50%",
                          background:s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:11,fontWeight:700,
                          color:s.genre==="F"?c.purple:c.success,flexShrink:0}}>
                          {s.prenom[0]}{s.nom[0]}
                        </div>
                        <div style={{fontWeight:600,fontSize:13}}>{s.nom} {s.prenom}</div>
                      </div>
                    </td>
                    {/* Moyenne par trimestre */}
                    {PERIODS.map((p,pi)=>{
                      const moy=getMoy(s.id,p.key);
                      const mm=mention(moy);
                      return(
                        <td key={p.key} style={{
                          padding:"10px 14px",textAlign:"center",
                          borderLeft:pi===0?"none":"2px solid "+p.border,
                          background:moy!==null?p.bg:"transparent"}}>
                          <input type="number" min={0} max={20} step={0.25}
                            value={moy!==null?moy:""}
                            onChange={e=>updateMoy(s.id,p.key,e.target.value)}
                            style={{
                              width:68,padding:"7px 8px",
                              background:"transparent",
                              border:`1.5px solid ${moy!==null?mm.color+"66":"rgba(136,146,176,.25)"}`,
                              borderRadius:8,
                              color:moy!==null?mm.color:c.white,
                              fontFamily:"'DM Sans',sans-serif",
                              fontSize:16,fontWeight:700,
                              textAlign:"center",outline:"none"}}
                            placeholder="—"/>
                        </td>
                      );
                    })}
                    {/* Moy. Annuelle */}
                    <td style={{
                      padding:"10px 12px",textAlign:"center",
                      background:ann!==null?`rgba(${meAnn.rgb},.1)`:"rgba(244,197,66,.04)",
                      borderLeft:"2px solid rgba(244,197,66,.3)"}}>
                      <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,
                        color:ann!==null?meAnn.color:c.muted}}>
                        {ann!==null?ann.toFixed(2):"—"}
                      </div>
                    </td>
                    {/* Mention */}
                    <td style={{padding:"10px 12px",textAlign:"center",
                      fontSize:12,fontWeight:700,color:ann!==null?meAnn.color:c.muted}}>
                      {ann!==null?meAnn.label:"—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer */}
            <tfoot>
              <tr style={{background:"rgba(10,22,40,.97)",borderTop:"2px solid rgba(244,197,66,.3)"}}>
                <td style={{padding:"10px 14px",fontWeight:900,fontSize:11,color:c.gold,
                  textTransform:"uppercase",letterSpacing:".06em",
                  position:"sticky",left:0,background:"rgba(10,22,40,.97)",zIndex:1,
                  borderRight:"2px solid rgba(244,197,66,.1)"}}>
                  Moy. classe
                </td>
                {PERIODS.map((p,pi)=>{
                  const vals=students.map(s=>getMoy(s.id,p.key)).filter(v=>v!==null);
                  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                  const me=mention(avg);
                  return(
                    <td key={p.key} style={{padding:"10px 14px",textAlign:"center",
                      fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,
                      color:avg!==null?me.color:c.muted,
                      borderLeft:pi===0?"none":"2px solid "+p.border}}>
                      {avg!==null?avg.toFixed(2):"—"}
                    </td>
                  );
                })}
                {(()=>{
                  const vals=students.map(s=>getAnn(s.id)).filter(v=>v!==null);
                  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                  const me=mention(avg);
                  return[
                    <td key="gann" style={{padding:"10px 12px",textAlign:"center",
                      fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,
                      color:avg!==null?me.color:c.muted,background:"rgba(244,197,66,.06)",
                      borderLeft:"2px solid rgba(244,197,66,.3)"}}>
                      {avg!==null?avg.toFixed(2):"—"}
                    </td>,
                    <td key="gme" style={{padding:"10px 12px",textAlign:"center",
                      fontSize:12,fontWeight:900,color:avg!==null?me.color:c.muted}}>
                      {avg!==null?me.label:"—"}
                    </td>,
                  ];
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Classement */}
      {view==="classement"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {ranked.length===0&&<div className="empty-state"><div className="big">🏆</div><div style={{fontWeight:600}}>Aucune note saisie</div></div>}
          {ranked.map((row,ri)=>{
            const me=mention(row.ann);const medals=["🥇","🥈","🥉"];
            return(
              <div key={row.s.id} style={{background:c.navyMid,
                border:`1px solid ${ri<3?"rgba(244,197,66,.3)":"rgba(136,146,176,.1)"}`,
                borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:ri<3?28:18,fontWeight:900,
                  color:ri===0?"#FFD700":ri===1?"#C0C0C0":ri===2?"#CD7F32":c.muted,minWidth:44,textAlign:"center"}}>
                  {ri<3?medals[ri]:`#${ri+1}`}
                </div>
                <div style={{width:38,height:38,borderRadius:"50%",
                  background:row.s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:700,fontSize:15,color:row.s.genre==="F"?c.purple:c.success,flexShrink:0}}>
                  {row.s.prenom[0]}{row.s.nom[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{row.s.prenom} {row.s.nom}</div>
                  <div style={{fontSize:11,color:c.muted,marginTop:3,display:"flex",gap:16,flexWrap:"wrap"}}>
                    {PERIODS.map(p=>{const v=getMoy(row.s.id,p.key);return(<span key={p.key}>{p.key} : <strong style={{color:v!==null?mention(v).color:c.muted}}>{v!==null?v.toFixed(2):"—"}</strong></span>);})}
                  </div>
                </div>
                <div style={{textAlign:"center",background:`rgba(${me.rgb},.1)`,borderRadius:10,padding:"8px 14px"}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:900,color:me.color}}>{row.ann.toFixed(2)}</div>
                  <div style={{fontSize:10,fontWeight:700,color:me.color,marginTop:2}}>{me.label}</div>
                  <div style={{fontSize:9,color:c.muted}}>Moy. Ann.</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{fontSize:11,color:c.muted,marginTop:10,textAlign:"right"}}>
        {students.length} élève{students.length!==1?"s":""} · Sauvegarde automatique
      </div>
    </div>
  );
}

function ResultsModule({schoolData}){
  const avail=LEVELS.filter(l=>schoolData.levels.includes(l.id));
  const [selLevel,setSelLevel]=useState(avail[0]?.id||"");
  const [selClasse,setSelClasse]=useState("");
  const classes=LEVELS.find(l=>l.id===selLevel)?.classes||[];
  const isPrimaire=selLevel==="primaire"||selLevel==="maternelle";
  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {avail.map(l=>(
            <button key={l.id} onClick={()=>{setSelLevel(l.id);setSelClasse("");}}
              style={{padding:"8px 16px",borderRadius:9,
                border:`1.5px solid ${selLevel===l.id?"rgba(244,197,66,.5)":"rgba(136,146,176,.2)"}`,
                background:selLevel===l.id?"rgba(244,197,66,.12)":"transparent",
                color:selLevel===l.id?c.gold:c.muted,
                fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>
        <select className="filter-sel" value={selClasse} onChange={e=>setSelClasse(e.target.value)} style={{minWidth:140}}>
          <option value="">-- Choisir une classe --</option>
          {classes.map(cl=><option key={cl} value={cl}>{cl}</option>)}
        </select>
      </div>
      {!selClasse&&<div className="empty-state"><div className="big">📊</div><div style={{fontWeight:600,marginBottom:6}}>Sélectionnez une classe</div><div style={{fontSize:12}}>Choisissez un niveau puis une classe pour saisir les notes</div></div>}
      {selClasse&&!isPrimaire&&<CollegeResultsView schoolData={schoolData} selectedClasse={selClasse} langue={schoolData.langue||"francaise"}/>}
      {selClasse&&isPrimaire&&<PrimaireResultsView schoolData={schoolData} selectedClasse={selClasse}/>}
    </div>
  );
}


function BulletinModule({schoolData}){
  const avail=LEVELS.filter(l=>schoolData.levels.includes(l.id));
  const [selLevel,setSelLevel]=useState(avail[0]?.id||"");
  const [selClasse,setSelClasse]=useState("");
  const [selStudent,setSelStudent]=useState(null);
  const classes=LEVELS.find(l=>l.id===selLevel)?.classes||[];
  const students=getStudents(schoolData.code).filter(s=>s.classe===selClasse);
  const isPrimaire=selLevel==="primaire"||selLevel==="maternelle";

  if(selStudent){
    const allNotes=getResults(schoolData.code)[selStudent.id]||{};
    const MATIERES=getMatieres(schoolData.langue||"francaise",CLASS_TO_LEVEL[selClasse]||"college");
    const director=getDirectorFor(schoolData.code);
    const moy=calcMoyenne(selStudent);
    const me=mention(moy);

    // Compute per-matière notes for S1 and S2
    const matRows=MATIERES.map(mat=>{
      const n1=allNotes[`s1_${mat.key}`]||{};
      const n2=allNotes[`s2_${mat.key}`]||{};
      const vals1=[n1.cours,n1.eval,n1.compo].filter(v=>v!=null&&v!=="");
      const vals2=[n2.cours,n2.eval,n2.compo].filter(v=>v!=null&&v!=="");
      const moy1=vals1.length===3?vals1.reduce((a,b)=>a+parseFloat(b),0)/3:null;
      const moy2=vals2.length===3?vals2.reduce((a,b)=>a+parseFloat(b),0)/3:null;
      const moyAnn=(moy1!==null&&moy2!==null)?(moy1+moy2)/2:moy1!==null?moy1:moy2;
      return{mat,n1,n2,moy1,moy2,moyAnn};
    });

    // Primaire — 3 trimestres
    const triRows=isPrimaire?["T1","T2","T3"].map(t=>{
      const n=allNotes[`${t.toLowerCase()}_gen`]||{};
      return{period:t,moy:n.moy!=null?parseFloat(n.moy):null};
    }):null;
    const moyAnnPrim=triRows?((()=>{const v=triRows.filter(r=>r.moy!==null);return v.length?v.reduce((a,r)=>a+r.moy,0)/v.length:null;})())():null;

    const cell=(val,bold=false)=>(
      <td style={{padding:"7px 8px",textAlign:"center",fontSize:12,
        fontWeight:bold?700:400,
        color:val!=null?mention(val).color:c.muted}}>
        {val!=null?(typeof val==="number"?val.toFixed(2):val):"—"}
      </td>
    );

    return(
      <div>
        <button className="btn-secondary" onClick={()=>setSelStudent(null)} style={{marginBottom:16,padding:"8px 16px"}}>← Retour</button>
        <div style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.2)",borderRadius:16,padding:"24px",maxWidth:700}}>

          {/* ── EN-TÊTE OFFICIEL ── */}
          <div style={{display:"flex",justifyContent:"space-between",borderBottom:"2px solid rgba(244,197,66,.25)",paddingBottom:14,marginBottom:16,gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:11,lineHeight:1.8,color:c.muted}}>
              {schoolData.admin?.ire&&<div><strong>I.R.E :</strong> {schoolData.admin.ire}</div>}
              {schoolData.admin?.dpe&&<div><strong>D.P.E :</strong> {schoolData.admin.dpe}</div>}
              {schoolData.admin?.dse&&<div><strong>D.S.E :</strong> {schoolData.admin.dse}</div>}
              {schoolData.admin?.etablissement&&<div><strong>Ét. :</strong> {schoolData.admin.etablissement}</div>}
            </div>
            <div style={{textAlign:"center",flex:1}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:900,letterSpacing:1}}>RÉPUBLIQUE DE GUINÉE</div>
              <div style={{fontSize:11,fontStyle:"italic",fontWeight:700,marginTop:3}}>
                <span style={{color:"#DC2626"}}>Travail</span> — <span style={{color:"#B45309"}}>Justice</span> — <span style={{color:"#16A34A"}}>Solidarité</span>
              </div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:c.gold,marginTop:8}}>{schoolData.name}</div>
              <div style={{fontSize:11,color:c.muted}}>Année scolaire {schoolData.admin?.annee||"—"}</div>
            </div>
            <div style={{fontSize:11,lineHeight:1.8,color:c.muted,textAlign:"right",direction:"rtl"}}>
              {schoolData.admin?.ire&&<div><strong>م.ج.ت :</strong> {schoolData.admin.ire}</div>}
              {schoolData.admin?.dpe&&<div><strong>م.ت.م :</strong> {schoolData.admin.dpe}</div>}
              {schoolData.admin?.annee&&<div><strong>السنة :</strong> {schoolData.admin.annee}</div>}
            </div>
          </div>

          {/* ── TITRE ── */}
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{display:"inline-block",border:"1.5px solid rgba(244,197,66,.4)",borderRadius:8,padding:"6px 24px",fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:c.gold}}>
              BULLETIN SCOLAIRE
            </div>
          </div>

          {/* ── INFOS ÉLÈVE ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16,background:c.navy,borderRadius:10,padding:"12px 14px",fontSize:12}}>
            <div><span style={{color:c.muted}}>Nom & Prénom : </span><strong>{selStudent.nom} {selStudent.prenom}</strong></div>
            <div><span style={{color:c.muted}}>Classe : </span><strong>{selStudent.classe}</strong></div>
            <div><span style={{color:c.muted}}>Genre : </span><strong>{selStudent.genre==="F"?"Féminin":"Masculin"}</strong></div>
            <div><span style={{color:c.muted}}>N° Matricule : </span><strong>{selStudent.id}</strong></div>
          </div>

          {/* ── TABLEAU COLLÈGE/LYCÉE ── */}
          {!isPrimaire&&(
            <div style={{overflowX:"auto",marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:560,fontSize:11}}>
                <thead>
                  {/* Ligne groupes semestres */}
                  <tr style={{background:"rgba(10,22,40,.95)"}}>
                    <th rowSpan={2} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,textTransform:"uppercase",color:c.gold,borderBottom:"2px solid rgba(244,197,66,.3)",letterSpacing:".05em",minWidth:110}}>Matière</th>
                    <th colSpan={4} style={{padding:"8px 10px",textAlign:"center",fontWeight:700,fontSize:10,textTransform:"uppercase",color:"#74C0FC",borderBottom:"1px solid rgba(116,192,252,.3)",borderLeft:"1px solid rgba(116,192,252,.2)",letterSpacing:".05em"}}>1ER SEMESTRE</th>
                    <th colSpan={4} style={{padding:"8px 10px",textAlign:"center",fontWeight:700,fontSize:10,textTransform:"uppercase",color:"#86EFAC",borderBottom:"1px solid rgba(134,239,172,.3)",borderLeft:"1px solid rgba(134,239,172,.2)",letterSpacing:".05em"}}>2ÈME SEMESTRE</th>
                    <th rowSpan={2} style={{padding:"8px 10px",textAlign:"center",fontWeight:700,fontSize:10,textTransform:"uppercase",color:c.gold,borderBottom:"2px solid rgba(244,197,66,.3)",borderLeft:"1px solid rgba(244,197,66,.2)",letterSpacing:".05em"}}>Moy. Ann.</th>
                    <th rowSpan={2} style={{padding:"8px 10px",textAlign:"center",fontWeight:700,fontSize:10,textTransform:"uppercase",color:c.gold,borderBottom:"2px solid rgba(244,197,66,.3)",letterSpacing:".05em"}}>Mention</th>
                  </tr>
                  <tr style={{background:"rgba(10,22,40,.85)"}}>
                    {["Cours","Éval.","Comp.","Moy."].map((h,i)=>(
                      <th key={"s1"+h} style={{padding:"6px 6px",textAlign:"center",fontSize:9,fontWeight:600,color:"rgba(116,192,252,.8)",borderBottom:"1px solid rgba(116,192,252,.15)",borderLeft:i===0?"1px solid rgba(116,192,252,.2)":undefined,letterSpacing:".03em"}}>{h}</th>
                    ))}
                    {["Cours","Éval.","Comp.","Moy."].map((h,i)=>(
                      <th key={"s2"+h} style={{padding:"6px 6px",textAlign:"center",fontSize:9,fontWeight:600,color:"rgba(134,239,172,.8)",borderBottom:"1px solid rgba(134,239,172,.15)",borderLeft:i===0?"1px solid rgba(134,239,172,.2)":undefined,letterSpacing:".03em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matRows.map(({mat,n1,n2,moy1,moy2,moyAnn},ri)=>{
                    const me2=mention(moyAnn);
                    return(
                      <tr key={mat.key} style={{borderBottom:"1px solid rgba(136,146,176,.07)",background:ri%2===0?"transparent":"rgba(10,22,40,.25)"}}>
                        <td style={{padding:"7px 10px",fontWeight:600,fontSize:11,direction:mat.rtl?"rtl":"ltr",color:mat.color||"#fff"}}>
                        <span style={{marginRight:4}}>{mat.icon}</span>{mat.label}
                      </td>
                        {/* S1 */}
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:11,color:n1.cours!=null?"rgba(116,192,252,.9)":c.muted,borderLeft:"1px solid rgba(116,192,252,.1)"}}>{n1.cours!=null?n1.cours:"—"}</td>
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:11,color:n1.eval!=null?"rgba(116,192,252,.9)":c.muted}}>{n1.eval!=null?n1.eval:"—"}</td>
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:11,color:n1.compo!=null?"rgba(116,192,252,.9)":c.muted}}>{n1.compo!=null?n1.compo:"—"}</td>
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:12,fontWeight:700,color:moy1!=null?mention(moy1).color:c.muted}}>{moy1!=null?moy1.toFixed(2):"—"}</td>
                        {/* S2 */}
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:11,color:n2.cours!=null?"rgba(134,239,172,.9)":c.muted,borderLeft:"1px solid rgba(134,239,172,.1)"}}>{n2.cours!=null?n2.cours:"—"}</td>
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:11,color:n2.eval!=null?"rgba(134,239,172,.9)":c.muted}}>{n2.eval!=null?n2.eval:"—"}</td>
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:11,color:n2.compo!=null?"rgba(134,239,172,.9)":c.muted}}>{n2.compo!=null?n2.compo:"—"}</td>
                        <td style={{padding:"7px 6px",textAlign:"center",fontSize:12,fontWeight:700,color:moy2!=null?mention(moy2).color:c.muted}}>{moy2!=null?moy2.toFixed(2):"—"}</td>
                        {/* Annuelle */}
                        <td style={{padding:"7px 8px",textAlign:"center",fontSize:13,fontWeight:900,color:moyAnn!=null?me2.color:c.muted,borderLeft:"1px solid rgba(244,197,66,.1)"}}>{moyAnn!=null?moyAnn.toFixed(2):"—"}</td>
                        <td style={{padding:"7px 8px",textAlign:"center",fontSize:10,fontWeight:700,color:moyAnn!=null?me2.color:c.muted}}>{moyAnn!=null?me2.label:"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Ligne TOTAL */}
                <tfoot>
                  <tr style={{background:"rgba(244,197,66,.05)",borderTop:"2px solid rgba(244,197,66,.2)"}}>
                    <td style={{padding:"10px 10px",fontWeight:900,fontSize:12,color:c.gold}}>MOYENNE GÉNÉRALE</td>
                    <td colSpan={4} style={{borderLeft:"1px solid rgba(116,192,252,.1)"}}></td>
                    <td colSpan={4} style={{borderLeft:"1px solid rgba(134,239,172,.1)"}}></td>
                    <td style={{padding:"10px 8px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:moy!=null?me.color:c.muted,borderLeft:"1px solid rgba(244,197,66,.2)"}}>{moy!=null?moy.toFixed(2):"—"}</td>
                    <td style={{padding:"10px 8px",textAlign:"center",fontSize:12,fontWeight:900,color:moy!=null?me.color:c.muted}}>{moy!=null?me.label:"—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── TABLEAU PRIMAIRE ── */}
          {isPrimaire&&(
            <div style={{marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"rgba(10,22,40,.95)"}}>
                    {["Trimestre","Moyenne /20","Mention"].map(h=>(
                      <th key={h} style={{padding:"9px 12px",textAlign:h==="Trimestre"?"left":"center",fontSize:10,fontWeight:700,textTransform:"uppercase",color:c.gold,borderBottom:"2px solid rgba(244,197,66,.2)",letterSpacing:".05em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {triRows.map((r,ri)=>{
                    const mm=mention(r.moy);
                    return(
                      <tr key={r.period} style={{borderBottom:"1px solid rgba(136,146,176,.07)",background:ri%2===0?"transparent":"rgba(10,22,40,.25)"}}>
                        <td style={{padding:"10px 12px",fontWeight:700}}>{{T1:"1er Trimestre",T2:"2ème Trimestre",T3:"3ème Trimestre"}[r.period]}</td>
                        <td style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:r.moy!=null?mm.color:c.muted}}>{r.moy!=null?r.moy:"—"}</td>
                        <td style={{padding:"10px 12px",textAlign:"center",fontSize:11,fontWeight:700,color:r.moy!=null?mm.color:c.muted}}>{r.moy!=null?mm.label:"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:"rgba(244,197,66,.05)",borderTop:"2px solid rgba(244,197,66,.2)"}}>
                    <td style={{padding:"10px 12px",fontWeight:900,fontSize:12,color:c.gold}}>MOYENNE ANNUELLE</td>
                    <td style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:moyAnnPrim!=null?mention(moyAnnPrim).color:c.muted}}>{moyAnnPrim!=null?moyAnnPrim.toFixed(2):"—"}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",fontSize:12,fontWeight:900,color:moyAnnPrim!=null?mention(moyAnnPrim).color:c.muted}}>{moyAnnPrim!=null?mention(moyAnnPrim).label:"—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── APPRÉCIATION + SIGNATURES ── */}
          <div style={{background:c.navy,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontSize:11,color:c.muted,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>Appréciation générale</div>
            <div style={{fontSize:13,color:moy!=null?me.color:c.muted,fontWeight:600,fontStyle:"italic"}}>
              {moy===null?"Notes non encore saisies.":moy>=16?"Excellent travail ! Continuez ainsi.":moy>=14?"Bon travail, encouragez-vous !":moy>=12?"Travail satisfaisant, peut mieux faire.":moy>=10?"Résultats passables, des efforts sont nécessaires.":"Résultats insuffisants, un soutien s'impose."}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:14,borderTop:"1px solid rgba(136,146,176,.1)"}}>
            <div style={{textAlign:"center",width:"42%"}}>
              <div style={{height:44,borderBottom:"1px solid rgba(136,146,176,.3)",marginBottom:6}}></div>
              <div style={{fontSize:11,color:c.muted,fontWeight:600}}>Le Directeur / La Directrice</div>
              {director&&<div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>{director.prenom} {director.nom}</div>}
            </div>
            <div style={{textAlign:"center",width:"42%"}}>
              <div style={{height:44,borderBottom:"1px solid rgba(136,146,176,.3)",marginBottom:6}}></div>
              <div style={{fontSize:11,color:c.muted,fontWeight:600}}>Signature Parent / Tuteur</div>
              {selStudent.pere&&<div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>{selStudent.pere.prenom} {selStudent.pere.nom}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <select className="filter-sel" value={selLevel} onChange={e=>{setSelLevel(e.target.value);setSelClasse("");}}>
          {avail.map(l=><option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
        </select>
        <select className="filter-sel" value={selClasse} onChange={e=>setSelClasse(e.target.value)}>
          <option value="">-- Choisir une classe --</option>
          {classes.map(cl=><option key={cl} value={cl}>{cl}</option>)}
        </select>
      </div>
      {!selClasse&&<div className="empty-state"><div className="big">📝</div><div style={{fontWeight:600}}>Sélectionnez une classe</div></div>}
      {selClasse&&students.length===0&&<div className="empty-state"><div className="big">📝</div><div style={{fontWeight:600}}>Aucun élève dans cette classe</div></div>}
      {selClasse&&students.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {students.map(s=>{
            const moy=calcMoyenne(s); const me=mention(moy);
            return(
              <div key={s.id} onClick={()=>setSelStudent(s)}
                style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.1)",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:".15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(244,197,66,.35)"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(244,197,66,.1)"}>
                <div style={{width:38,height:38,borderRadius:"50%",background:s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:15,color:s.genre==="F"?c.purple:c.success,flexShrink:0}}>{s.prenom[0]}{s.nom[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{s.prenom} {s.nom}</div>
                  <div style={{fontSize:11,color:c.muted}}>{s.id} · {s.classe}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:moy!=null?me.color:c.muted}}>{moy!=null?moy.toFixed(1):"—"}</div>
                  <div style={{fontSize:10,color:moy!=null?me.color:c.muted,fontWeight:700}}>{moy!=null?me.label:""}</div>
                </div>
                <span style={{fontSize:14,color:c.gold}}>📄 →</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function MessagerieModule({schoolData}){
  const [messages,setMessages]=useState(()=>getMessages(schoolData.code));
  const [view,setView]=useState("list");const [selMsg,setSelMsg]=useState(null);const [search,setSearch]=useState("");
  const [form,setForm]=useState({to:"",sujet:"",corps:""});const [reply,setReply]=useState("");
  const persist=(list)=>{setMessages(list);saveMessages(schoolData.code,list);};
  const send=()=>{if(!form.sujet.trim()||!form.corps.trim())return;const msg={id:genMsgId(),to:form.to||"Parents",sujet:form.sujet,corps:form.corps,date:new Date().toLocaleDateString("fr-FR"),statut:"envoyé",priorite:"normale",reponses:[]};persist([msg,...messages]);setForm({to:"",sujet:"",corps:""});setView("list");};
  const sendReply=()=>{if(!reply.trim()||!selMsg)return;const updated=messages.map(m=>m.id===selMsg.id?{...m,statut:"répondu",reponses:[...m.reponses||[],{corps:reply,date:new Date().toLocaleDateString("fr-FR"),auteur:"Direction"}]}:m);persist(updated);setSelMsg(updated.find(m=>m.id===selMsg.id));setReply("");};
  const filtered=messages.filter(m=>{const q=search.toLowerCase();return!q||m.sujet.toLowerCase().includes(q)||m.to.toLowerCase().includes(q);});
  if(view==="compose") return(
    <div style={{maxWidth:540}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><button className="btn-secondary" onClick={()=>setView("list")} style={{padding:"8px 16px"}}>← Retour</button><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900}}>✉️ Nouveau message</div></div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div><label>Destinataire</label><input type="text" placeholder="Parents, Classe…" value={form.to} onChange={e=>setForm(p=>({...p,to:e.target.value}))}/></div>
        <div><label>Sujet</label><input type="text" placeholder="Objet du message" value={form.sujet} onChange={e=>setForm(p=>({...p,sujet:e.target.value}))}/></div>
        <div><label>Message</label><textarea rows={5} placeholder="Contenu…" value={form.corps} onChange={e=>setForm(p=>({...p,corps:e.target.value}))} style={{width:"100%",padding:"12px 14px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none",resize:"vertical"}}/></div>
        <div style={{display:"flex",gap:10}}><button className="btn-secondary" onClick={()=>setView("list")} style={{width:120}}>Annuler</button><button className="btn-primary" onClick={send} style={{marginTop:0}}>📤 Envoyer</button></div>
      </div>
    </div>
  );
  if(view==="thread"&&selMsg) return(
    <div style={{maxWidth:600}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><button className="btn-secondary" onClick={()=>{setView("list");setSelMsg(null);}} style={{padding:"8px 16px"}}>← Retour</button><div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:900,flex:1}}>{selMsg.sujet}</div></div>
      <div style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.12)",borderRadius:12,padding:"16px",marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:12,color:c.muted}}><span>À : {selMsg.to}</span><span>{selMsg.date}</span></div><div style={{fontSize:14,lineHeight:1.7}}>{selMsg.corps}</div></div>
      {(selMsg.reponses||[]).map((r,i)=><div key={i} style={{background:"rgba(78,205,196,.06)",border:"1px solid rgba(78,205,196,.15)",borderRadius:12,padding:"14px",marginBottom:10}}><div style={{fontSize:11,color:c.muted,marginBottom:6}}>{r.auteur} · {r.date}</div><div style={{fontSize:13,lineHeight:1.7}}>{r.corps}</div></div>)}
      <div style={{marginTop:16}}><textarea rows={3} placeholder="Réponse…" value={reply} onChange={e=>setReply(e.target.value)} style={{width:"100%",padding:"12px 14px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none",resize:"vertical",marginBottom:10}}/><button className="btn-primary" onClick={sendReply} style={{marginTop:0}}>📤 Répondre</button></div>
    </div>
  );
  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
        <input className="search-input" placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180}}/>
        <button className="btn-primary" style={{width:"auto",padding:"10px 20px",marginTop:0,fontSize:13}} onClick={()=>setView("compose")}>✉️ Nouveau</button>
      </div>
      {filtered.length===0&&<div className="empty-state"><div className="big">💬</div><div style={{fontWeight:600}}>Aucun message</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(m=>(
          <div key={m.id} style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.15)",borderRadius:12,padding:"14px 18px",cursor:"pointer"}} onClick={()=>{setSelMsg(m);setView("thread");}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{m.sujet}</div><div style={{fontSize:12,color:c.muted}}>À : {m.to} · {m.date}</div></div><span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:"rgba(136,146,176,.1)",color:c.muted}}>{m.statut}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SmsNotifPanel ────────────────────────────────────────────────────────────
function SmsNotifPanel({schoolData}){
  const [notifs,setNotifs]=useState(()=>getSmsNotifs(schoolData.name));
  useEffect(()=>{const t=setInterval(()=>setNotifs(getSmsNotifs(schoolData.name)),3000);return()=>clearInterval(t);},[]);
  if(!notifs.length) return null;
  return(
    <div style={{background:"rgba(78,205,196,.06)",border:"1px solid rgba(78,205,196,.2)",borderRadius:12,padding:"14px 16px",marginBottom:20}}>
      <div style={{fontWeight:700,fontSize:13,color:c.success,marginBottom:10}}>📱 Codes SMS générés ({notifs.length})</div>
      {notifs.map((n,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<notifs.length-1?"1px solid rgba(78,205,196,.1)":"none",fontSize:12}}>
          <span style={{flex:1,color:c.muted}}>{n.studentName} ({n.classe})</span>
          <span style={{fontFamily:"monospace",color:c.success,fontWeight:700,fontSize:14}}>{n.smsCode}</span>
          <a href={`sms:${n.tel}?body=Bonjour, votre code ÉcoleHub: ${n.smsCode}`} style={{padding:"4px 10px",background:"rgba(78,205,196,.12)",border:"1px solid rgba(78,205,196,.3)",borderRadius:7,color:c.success,fontSize:11,fontWeight:700,textDecoration:"none"}}>📱 SMS</a>
        </div>
      ))}
      <button onClick={()=>{markSmsNotifsRead(schoolData.name);setNotifs([]);}} style={{marginTop:10,padding:"6px 14px",background:"transparent",border:"1px solid rgba(78,205,196,.3)",borderRadius:8,color:c.muted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>✓ Marquer comme lu</button>
    </div>
  );
}

// ─── SmsCodeModal ─────────────────────────────────────────────────────────────
function SmsCodeModal({accounts,onClose}){
  if(!accounts||!accounts.length) return null;
  const acc=accounts[0];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:c.navyMid,border:"1px solid rgba(78,205,196,.3)",borderRadius:"18px 18px 0 0",padding:"28px 24px",width:"100%",maxWidth:480,animation:"cardIn .3s cubic-bezier(.22,1,.36,1)"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,marginBottom:4}}>📱 Code SMS parent</div>
        <div style={{fontSize:12,color:c.muted,marginBottom:16}}>Envoyez ce code au parent pour activer son compte</div>
        <div style={{background:c.navy,borderRadius:12,padding:"16px",marginBottom:16,textAlign:"center"}}>
          <div style={{fontSize:11,color:c.muted,marginBottom:4}}>Code d'accès</div>
          <div style={{fontFamily:"monospace",fontSize:32,fontWeight:900,color:c.success,letterSpacing:4}}>{acc.smsCode}</div>
          <div style={{fontSize:12,color:c.muted,marginTop:8}}>{acc.studentName} · {acc.tel}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <a href={`sms:${acc.tel}?body=Bonjour! Votre code ÉcoleHub pour ${acc.studentName}: ${acc.smsCode}`} style={{flex:1,padding:"12px",background:"rgba(78,205,196,.15)",border:"1.5px solid rgba(78,205,196,.3)",borderRadius:10,color:c.success,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>📱 Envoyer SMS</a>
          <button onClick={onClose} style={{flex:1,padding:"12px",background:c.gold,color:c.navy,border:"none",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>✓ Fermer</button>
        </div>
      </div>
    </div>
  );
}


function AbandonModal({student,onConfirm,onCancel}){
  const [motif,setMotif]=useState("");const [date,setDate]=useState(new Date().toISOString().slice(0,10));const [err,setErr]=useState("");
  const MOTIFS=["Déménagement / changement d'école","Difficultés financières","Problème de santé","Décision familiale","Voyage à l'étranger","Autre motif"];
  const confirm=()=>{if(!motif){setErr("Sélectionnez un motif.");return;}onConfirm({motif,date});};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .2s ease"}} onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{background:c.navyMid,border:"1px solid rgba(255,107,107,.3)",borderRadius:18,padding:"28px 26px",width:"100%",maxWidth:430}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:900,marginBottom:14}}>🚪 Abandon scolaire</div>
        <div style={{background:c.navy,borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13}}>{student.prenom} {student.nom} · {student.classe}</div>
        <div style={{marginBottom:12}}><label>Motif *</label><select value={motif} onChange={e=>{setMotif(e.target.value);setErr("");}}>
          <option value="">-- Sélectionner --</option>{MOTIFS.map(m=><option key={m} value={m}>{m}</option>)}
        </select></div>
        <div style={{marginBottom:12}}><label>Date d'abandon</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        {err&&<p style={{color:c.red,fontSize:12,marginBottom:10,fontWeight:500}}>{err}</p>}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={onCancel} style={{flex:1,padding:"12px",background:"transparent",color:c.muted,border:"1.5px solid rgba(136,146,176,.25)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>Annuler</button>
          <button onClick={confirm} style={{flex:1,padding:"12px",background:"rgba(255,107,107,.15)",color:c.red,border:"1.5px solid rgba(255,107,107,.4)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>🚪 Confirmer</button>
        </div>
      </div>
    </div>
  );
}

function PromotionModal({student,schoolData,onConfirm,onCancel}){
  const [newClasse,setNewClasse]=useState("");const [err,setErr]=useState("");
  const currentIdx=ALL_CLASSES_ORDERED.indexOf(student.classe);
  const superior=ALL_CLASSES_ORDERED.slice(currentIdx+1).filter(cl=>schoolData.levels.includes(CLASS_TO_LEVEL[cl]));
  const lvLabel={maternelle:"Maternelle",primaire:"Primaire",college:"Collège",lycee:"Lycée"};
  const lvIcon={maternelle:"🌱",primaire:"📚",college:"🏫",lycee:"🎓"};
  const confirm=()=>{if(!newClasse){setErr("Choisissez la nouvelle classe.");return;}onConfirm({newClasse,newNiveau:CLASS_TO_LEVEL[newClasse]});};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .2s ease"}} onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{background:c.navyMid,border:"1px solid rgba(78,205,196,.3)",borderRadius:18,padding:"28px 26px",width:"100%",maxWidth:440,animation:"cardIn .3s cubic-bezier(.22,1,.36,1)"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:900,marginBottom:14}}>🎓 Promotion de classe</div>
        <div style={{background:c.navy,borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,display:"flex",alignItems:"center",gap:10}}>
          <span style={{flex:1}}>{student.prenom} {student.nom}</span>
          <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"rgba(136,146,176,.12)",color:c.muted}}>{student.classe}</span>
          <span style={{color:c.gold,fontSize:16}}>→</span>
          <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:newClasse?"rgba(78,205,196,.15)":"rgba(244,197,66,.1)",color:newClasse?c.success:c.gold}}>{newClasse||"?"}</span>
        </div>
        {superior.length===0?<div style={{background:"rgba(244,197,66,.08)",border:"1px solid rgba(244,197,66,.2)",borderRadius:9,padding:"12px",fontSize:12,color:c.gold,textAlign:"center",marginBottom:14}}>🏆 Déjà dans la classe la plus haute.</div>:(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {superior.map(cl=>{const lv=CLASS_TO_LEVEL[cl];const isSel=newClasse===cl;return(
              <div key={cl} onClick={()=>{setNewClasse(cl);setErr("");}}
                style={{padding:"10px",borderRadius:10,border:`2px solid ${isSel?"rgba(78,205,196,.7)":"rgba(136,146,176,.15)"}`,background:isSel?"rgba(78,205,196,.1)":"rgba(10,22,40,.5)",cursor:"pointer",transition:".2s",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{lvIcon[lv]}</div>
                <div style={{fontSize:13,fontWeight:700,color:isSel?c.success:c.white}}>{cl}</div>
                <div style={{fontSize:10,color:c.muted}}>{lvLabel[lv]}</div>
              </div>
            );})}
          </div>
        )}
        {err&&<p style={{color:c.red,fontSize:12,marginBottom:10,fontWeight:500}}>{err}</p>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"12px",background:"transparent",color:c.muted,border:"1.5px solid rgba(136,146,176,.25)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>Annuler</button>
          {superior.length>0&&<button onClick={confirm} style={{flex:1,padding:"12px",background:"rgba(78,205,196,.15)",color:c.success,border:"1.5px solid rgba(78,205,196,.4)",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>🎓 Confirmer</button>}
        </div>
      </div>
    </div>
  );
}

function FilTable({rows,onEdit,onDelete,onPromote}){
  const lvIcons={maternelle:"🌱",primaire:"📚",college:"🏫",lycee:"🎓"};
  const lvLabels={maternelle:"Maternelle",primaire:"Primaire",college:"Collège",lycee:"Lycée"};
  if(rows.length===0) return(<div className="empty-state"><div className="big">🎒</div><div style={{fontWeight:600,marginBottom:4}}>Aucun élève trouvé</div><div style={{fontSize:12}}>Modifiez les filtres ou ajoutez un élève</div></div>);
  return(
    <div className="fil-wrap">
      <table className="fil-table">
        <thead>
          <tr className="gh">
            <th colSpan={5} className="th-eleve" style={{borderRight:"1px solid rgba(136,146,176,.12)"}}>👤 ÉLÈVE</th>
            <th colSpan={3} className="th-pere"  style={{borderRight:"1px solid rgba(136,146,176,.12)"}}>👨 PÈRE / TUTEUR</th>
            <th colSpan={3} className="th-mere"  style={{borderRight:"1px solid rgba(136,146,176,.12)"}}>👩 MÈRE / TUTRICE</th>
            <th colSpan={2} className="th-note">📊 NOTE</th>
            <th></th>
          </tr>
          <tr style={{background:c.navyMid}}>
            {["Nom & Prénom","Niveau","Classe","Naissance","Statut"].map((h,i)=>(
              <th key={h} style={{padding:"9px 14px",fontSize:"10px",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:c.muted,borderBottom:"2px solid rgba(244,197,66,.2)",whiteSpace:"nowrap",borderRight:i===4?"1px solid rgba(136,146,176,.12)":undefined}}>{h}</th>
            ))}
            {["Nom & Prénom","Fonction","Téléphone"].map((h,i)=>(
              <th key={"p"+h} style={{padding:"9px 14px",fontSize:"10px",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"#74C0FC",borderBottom:"2px solid rgba(116,192,252,.2)",whiteSpace:"nowrap",borderLeft:i===0?"1px solid rgba(136,146,176,.12)":undefined,borderRight:i===2?"1px solid rgba(136,146,176,.12)":undefined}}>{h}</th>
            ))}
            {["Nom & Prénom","Profession","Téléphone"].map((h,i)=>(
              <th key={"m"+h} style={{padding:"9px 14px",fontSize:"10px",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"#F9A8D4",borderBottom:"2px solid rgba(249,168,212,.2)",whiteSpace:"nowrap",borderLeft:i===0?"1px solid rgba(136,146,176,.12)":undefined,borderRight:i===2?"1px solid rgba(136,146,176,.12)":undefined}}>{h}</th>
            ))}
            <th style={{padding:"9px 14px",fontSize:"10px",fontWeight:700,textTransform:"uppercase",color:c.success,borderBottom:"2px solid rgba(78,205,196,.2)",borderLeft:"1px solid rgba(136,146,176,.12)",whiteSpace:"nowrap"}}>Moyenne</th>
            <th style={{padding:"9px 14px",fontSize:"10px",fontWeight:700,textTransform:"uppercase",color:c.success,borderBottom:"2px solid rgba(78,205,196,.2)",whiteSpace:"nowrap"}}>Mention</th>
            <th style={{padding:"9px 14px",borderBottom:"2px solid rgba(136,146,176,.1)"}}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s=>{
            const moy=calcMoyenne(s);const me=mention(moy);
            return(
              <tr key={s.id} style={{borderBottom:"1px solid rgba(136,146,176,.07)"}}>
                <td style={{padding:"11px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:s.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:s.genre==="F"?c.purple:c.success,flexShrink:0}}>{s.prenom[0]}{s.nom[0]}</div>
                    <div><div style={{fontWeight:600,fontSize:13}}>{s.nom} {s.prenom}</div><div style={{fontSize:10,color:c.muted}}>{s.id}</div></div>
                  </div>
                </td>
                <td style={{padding:"11px 14px"}}><span style={{fontSize:14}}>{lvIcons[s.niveau]}</span> <span style={{fontSize:11,color:c.muted}}>{lvLabels[s.niveau]}</span></td>
                <td style={{padding:"11px 14px"}}><span className="tag" style={{background:"rgba(244,197,66,.1)",color:c.gold}}>{s.classe}</span></td>
                <td style={{padding:"11px 14px",color:c.muted,fontSize:12}}>{s.dateNaissance||"–"}</td>
                <td style={{padding:"11px 14px",borderRight:"1px solid rgba(136,146,176,.08)"}}><span className={`tag tag-${s.statut}`}>{s.statut}</span></td>
                <td style={{padding:"11px 14px",borderLeft:"1px solid rgba(136,146,176,.08)"}}><div style={{fontWeight:600,color:"#74C0FC",fontSize:13}}>{s.pere?.prenom} {s.pere?.nom}</div></td>
                <td style={{padding:"11px 14px",color:c.muted,fontSize:12}}>{s.pere?.fonction||"–"}</td>
                <td style={{padding:"11px 14px",color:c.muted,fontSize:12,borderRight:"1px solid rgba(136,146,176,.08)"}}>{s.pere?.tel||"–"}</td>
                <td style={{padding:"11px 14px",borderLeft:"1px solid rgba(136,146,176,.08)"}}><div style={{fontWeight:600,color:"#F9A8D4",fontSize:13}}>{s.mere?.prenom} {s.mere?.nom}</div></td>
                <td style={{padding:"11px 14px",color:c.muted,fontSize:12}}>{s.mere?.profession||"–"}</td>
                <td style={{padding:"11px 14px",color:c.muted,fontSize:12,borderRight:"1px solid rgba(136,146,176,.08)"}}>{s.mere?.tel||"–"}</td>
                <td style={{padding:"11px 14px",textAlign:"center",borderLeft:"1px solid rgba(136,146,176,.08)"}}><span style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:900,color:me.color}}>{moy!=null?moy.toFixed(1):"–"}</span></td>
                <td style={{padding:"11px 14px"}}><span style={{fontSize:11,fontWeight:700,color:me.color}}>{moy!=null?me.label:"–"}</span></td>
                <td style={{padding:"11px 8px"}}>
                  <div style={{display:"flex",gap:4,flexWrap:"nowrap"}}>
                    <button className="btn-icon" onClick={()=>onEdit(s)} title="Modifier">✏️</button>
                    <button onClick={()=>onRecit&&onRecit(s)} title="Récit d'inscription" style={{background:"rgba(244,197,66,.1)",border:"1px solid rgba(244,197,66,.25)",borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:c.gold,fontFamily:"'DM Sans',sans-serif"}}>📄</button>
                    <button onClick={()=>onPromote&&onPromote(s)} title="Promouvoir" style={{background:"rgba(78,205,196,.1)",border:"1px solid rgba(78,205,196,.25)",borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:c.success,fontFamily:"'DM Sans',sans-serif"}}>🎓</button>
                    <button onClick={()=>onDelete(s)} title="Abandon" style={{background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:c.red,fontFamily:"'DM Sans',sans-serif"}}>🚪</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── StudentsModule ────────────────────────────────────────────────────────────
function StudentsModule({schoolData}){
  const [students,setStudents]=useState(()=>getStudents(schoolData.code));
  const [search,setSearch]=useState("");
  const [fLv,setFLv]=useState("all");const [fCl,setFCl]=useState("all");const [fSt,setFSt]=useState("all");
  const [drawer,setDrawer]=useState(null);const [sel,setSel]=useState(null);
  const [abandonTarget,setAbandonTarget]=useState(null);const [promoteTarget,setPromoteTarget]=useState(null);
  const [smsResult,setSmsResult]=useState(null);
  const [recitTarget,setRecitTarget]=useState(null);

  const avail=LEVELS.filter(l=>schoolData.levels.includes(l.id));
  const clsForLv=fLv!=="all"?(LEVELS.find(l=>l.id===fLv)?.classes||[]):[];
  const filtered=useMemo(()=>students.filter(s=>{
    const q=search.toLowerCase();
    return(!q||[s.prenom,s.nom,s.classe,s.id||"",s.pere?.nom||"",s.mere?.nom||""].some(v=>v.toLowerCase().includes(q)))
      &&(fLv==="all"||s.niveau===fLv)&&(fCl==="all"||s.classe===fCl)&&(fSt==="all"||s.statut===fSt);
  }),[students,search,fLv,fCl,fSt]);

  const persist=list=>{setStudents(list);saveStudents(schoolData.code,list);};

  const handleSave=s=>{
    const exists=students.find(x=>x.id===s.id);
    const updated=exists?students.map(x=>x.id===s.id?s:x):[...students,s];
    persist(updated);
    if(!exists){
      // Nouvel élève : générer code SMS + ouvrir récit automatiquement
      const accounts=upsertParentForStudent(s,schoolData);
      if(accounts&&accounts.length) setSmsResult(accounts);
      setRecitTarget(s); // 📄 Ouvre automatiquement le récit d'inscription
    }
    setDrawer(null);setSel(null);
  };
  const confirmAbandon=()=>{persist(students.filter(x=>x.id!==abandonTarget.id));setAbandonTarget(null);};
  const confirmPromotion=({newClasse,newNiveau})=>{persist(students.map(x=>x.id===promoteTarget.id?{...x,classe:newClasse,niveau:newNiveau}:x));setPromoteTarget(null);};

  const avg=()=>{const v=students.filter(s=>calcMoyenne(s)!==null);if(!v.length)return null;return v.reduce((a,s)=>a+calcMoyenne(s),0)/v.length;};
  const avgVal=avg();

  return(
    <div>
      <SmsNotifPanel schoolData={schoolData}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
        <div className="stat-tile"><div className="stat-val">{students.length}</div><div className="stat-lbl">Total élèves</div></div>
        <div className="stat-tile"><div className="stat-val" style={{color:c.success}}>{students.filter(s=>s.statut==="actif").length}</div><div className="stat-lbl">Actifs</div></div>
        <div className="stat-tile"><div className="stat-val" style={{color:c.red}}>{students.filter(s=>s.statut==="inactif").length}</div><div className="stat-lbl">Inactifs</div></div>
        <div className="stat-tile"><div className="stat-val" style={{color:"#74C0FC"}}>{avgVal!=null?avgVal.toFixed(1):"–"}</div><div className="stat-lbl">Moy. classe</div></div>
      </div>
      <div className="section-hd">
        <div className="section-title">Tableau de filiation</div>
        <button className="btn-primary" style={{width:"auto",padding:"9px 18px",marginTop:0,fontSize:13}} onClick={()=>{setSel(null);setDrawer("form");}}>➕ Ajouter un élève</button>
      </div>
      <div className="filter-bar">
        <input className="search-input" placeholder="🔍 Nom, classe, ID, parent…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="filter-sel" value={fLv} onChange={e=>{setFLv(e.target.value);setFCl("all");}}>
          <option value="all">Tous niveaux</option>
          {avail.map(l=><option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
        </select>
        {fLv!=="all"&&<select className="filter-sel" value={fCl} onChange={e=>setFCl(e.target.value)}>
          <option value="all">Toutes classes</option>
          {clsForLv.map(cl=><option key={cl} value={cl}>{cl}</option>)}
        </select>}
        <select className="filter-sel" value={fSt} onChange={e=>setFSt(e.target.value)}>
          <option value="all">Tous statuts</option>
          <option value="actif">Actif</option><option value="inactif">Inactif</option>
        </select>
      </div>
      <FilTable rows={filtered}
        onEdit={s=>{setSel(s);setDrawer("form");}}
        onDelete={s=>setAbandonTarget(s)}
        onPromote={s=>setPromoteTarget(s)}
        onRecit={s=>setRecitTarget(s)}/>
      <div style={{fontSize:11,color:c.muted,marginTop:8,textAlign:"right"}}>
        {filtered.length} élève{filtered.length!==1?"s":""} affiché{filtered.length!==1?"s":""}
      </div>

      {drawer==="form"&&<StudentDrawer schoolData={schoolData} student={sel}
        onClose={()=>{setDrawer(null);setSel(null);}} onSave={handleSave}/>}
      {abandonTarget&&<AbandonModal student={abandonTarget} onConfirm={confirmAbandon} onCancel={()=>setAbandonTarget(null)}/>}
      {promoteTarget&&<PromotionModal student={promoteTarget} schoolData={schoolData} onConfirm={confirmPromotion} onCancel={()=>setPromoteTarget(null)}/>}
      {smsResult&&<SmsCodeModal accounts={smsResult} onClose={()=>setSmsResult(null)}/>}
      {recitTarget&&<RecitModal student={recitTarget} schoolData={schoolData} onClose={()=>setRecitTarget(null)}/>}
    </div>
  );
}

// ─── Storage helpers for enseignants ─────────────────────────────────────────
const ENSEIGNANTS_DB_KEY="enseignants_db";
function getEnseignants(sc){try{const a=JSON.parse(localStorage.getItem(ENSEIGNANTS_DB_KEY)||"{}");return a[sc]||[];}catch{return[];}}
function saveEnseignants(sc,list){const a=JSON.parse(localStorage.getItem(ENSEIGNANTS_DB_KEY)||"{}");a[sc]=list;localStorage.setItem(ENSEIGNANTS_DB_KEY,JSON.stringify(a));}
function genEnsId(){return"ENS-"+Math.floor(10000+Math.random()*90000);}
const PRESENCES_ENS_KEY="presences_ens_db";
function getPresences(sc){try{const a=JSON.parse(localStorage.getItem(PRESENCES_ENS_KEY)||"{}");return a[sc]||{};}catch{return{};}}
function savePresences(sc,data){const a=JSON.parse(localStorage.getItem(PRESENCES_ENS_KEY)||"{}");a[sc]=data;localStorage.setItem(PRESENCES_ENS_KEY,JSON.stringify(a));}
const MATIERES_LABELS=[
  {label:"Biologie",     icon:"🌿"}, {label:"Chimie",          icon:"⚗️"},
  {label:"Physique",     icon:"⚡"}, {label:"Mathématiques",   icon:"📐"},
  {label:"Français",     icon:"📖"}, {label:"Histoire",        icon:"📜"},
  {label:"Géographie",   icon:"🌍"}, {label:"ECM",             icon:"⚖️"},
  {label:"التربية الإسلامية",icon:"📿"}, {label:"اللغة العربية",icon:"✍️"},
  {label:"الإنشاء والتعبير",icon:"📝"}, {label:"التاريخ",      icon:"📜"},
  {label:"الجغرافيا",   icon:"🌍"}, {label:"Éducation physique",icon:"🏃"},
  {label:"Informatique", icon:"💻"}, {label:"Arts plastiques", icon:"🎨"},
  {label:"Musique",      icon:"🎵"},
];

const getMatIcon=(label)=>{const m=MATIERES_LABELS.find(x=>x.label===label);return m?m.icon:"📚";};
// ─── EnseignantsModule ────────────────────────────────────────────────────────
function EnseignantsModule({schoolData}){
  const [view,setView]=useState("list");
  const [enseignants,setEnseignants]=useState(()=>getEnseignants(schoolData.code));
  const [presences,setPresences]=useState(()=>getPresences(schoolData.code));
  const [selected,setSelected]=useState(null);
  const [search,setSearch]=useState("");
  const [dateFilter,setDateFilter]=useState(new Date().toISOString().slice(0,10));
  const persist=(list)=>{setEnseignants(list);saveEnseignants(schoolData.code,list);};
  const persistPres=(data)=>{setPresences(data);savePresences(schoolData.code,data);};
  const blank={nom:"",prenom:"",genre:"M",dateNaissance:"",telephone:"",email:"",matieres:[],grade:"",diplome:"",dateEmbauche:"",statut:"actif",observations:"",emploiDuTemps:[]};
  const [form,setForm]=useState(blank);const [formErr,setFormErr]=useState("");
  const setF=(k,v)=>{setForm(p=>({...p,[k]:v}));setFormErr("");};
  const toggleMat=(m)=>setForm(p=>({...p,matieres:p.matieres.includes(m)?p.matieres.filter(x=>x!==m):[...p.matieres,m]}));
  const openAdd=()=>{setForm(blank);setSelected(null);setView("form");};
  const openEdit=(e)=>{setForm({...e,matieres:e.matieres||[],emploiDuTemps:e.emploiDuTemps||[]});setSelected(e);setView("form");};
  const handleSave=()=>{
    if(!form.nom.trim()||!form.prenom.trim()){setFormErr("Nom et prénom obligatoires.");return;}
    if(!form.telephone.trim()){setFormErr("Téléphone obligatoire.");return;}
    if(form.matieres.length===0){setFormErr("Sélectionnez au moins une matière.");return;}
    const ens={...form,id:selected?.id||genEnsId()};
    persist(selected?enseignants.map(e=>e.id===selected.id?ens:e):[...enseignants,ens]);
    setView("list");setSelected(null);
  };
  const handleDelete=(id)=>{if(!window.confirm("Supprimer cet enseignant ?"))return;persist(enseignants.filter(e=>e.id!==id));};
  const JOURS_WEEK=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const selectedDay=JOURS_WEEK[new Date(dateFilter+"T12:00:00").getDay()];
  const todayKey=(ensId)=>`${ensId}_${dateFilter}`;
  const getPres=(ensId)=>presences[todayKey(ensId)]||{statut:"present",heure:"",note:""};
  const setPres=(ensId,field,val)=>{const key=todayKey(ensId);const updated={...presences,[key]:{...getPres(ensId),[field]:val}};persistPres(updated);};
  const getSlotPres=(ensId,slotIdx)=>presences[`${ensId}_${dateFilter}_slot_${slotIdx}`]||{statut:"present"};
  const setSlotPres=(ensId,slotIdx,statut)=>{const key=`${ensId}_${dateFilter}_slot_${slotIdx}`;persistPres({...presences,[key]:{statut}});};
  const STATUTS=[{id:"present",label:"Présent",color:"#4ECDC4",bg:"rgba(78,205,196,.15)"},{id:"absent",label:"Absent",color:"#FF6B6B",bg:"rgba(255,107,107,.15)"},{id:"retard",label:"En retard",color:"#F4C542",bg:"rgba(244,197,66,.15)"},{id:"conge",label:"Congé",color:"#A78BFA",bg:"rgba(167,139,250,.15)"}];
  const filtered=enseignants.filter(e=>{const q=search.toLowerCase();return !q||e.nom.toLowerCase().includes(q)||e.prenom.toLowerCase().includes(q);});

  if(view==="absences"){
    const refDate=new Date(dateFilter+"T12:00:00");const dayOfWeek=refDate.getDay();
    const monday=new Date(refDate);monday.setDate(refDate.getDate()-(dayOfWeek===0?6:dayOfWeek-1));
    const weekDates=Array.from({length:6},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d.toISOString().slice(0,10);});
    const absReport=[];
    enseignants.forEach(ens=>{
      const allSlots=ens.emploiDuTemps||[];
      const classeMap={};
      allSlots.forEach((sl,si)=>{const cls=sl.classe||"—";if(!classeMap[cls])classeMap[cls]={classe:cls,matieres:new Set(),slots:[],absCount:0,absDays:[]};classeMap[cls].matieres.add(sl.matiere||"");classeMap[cls].slots.push({...sl,slotIdx:si});});
      Object.values(classeMap).forEach(clData=>{
        let absCount=0;const absDays=[];
        weekDates.forEach(date=>{const dayName=JOURS_WEEK[new Date(date+"T12:00:00").getDay()];
          clData.slots.forEach(sl=>{if(sl.jour===dayName){const key=`${ens.id}_${date}_slot_${sl.slotIdx}`;const sp=presences[key]||{statut:"present"};if(sp.statut==="absent"){absCount++;if(!absDays.includes(dayName))absDays.push(dayName);}}});});
        if(absCount>2) absReport.push({ens,classe:clData.classe,matieres:[...clData.matieres].filter(Boolean),absCount,absDays,allClasses:Object.keys(classeMap)});
      });
    });
    absReport.sort((a,b)=>b.absCount-a.absCount);
    const wStart=monday.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
    const wEnd=new Date(monday.getTime()+5*86400000).toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
          <button className="btn-secondary" onClick={()=>setView("list")} style={{padding:"9px 16px"}}>← Retour</button>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900}}>⚠️ Rapport absentéisme</div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <span style={{padding:"4px 12px",borderRadius:20,background:"rgba(255,107,107,.12)",color:c.red,fontSize:12,fontWeight:700,border:"1px solid rgba(255,107,107,.25)"}}>{wStart} → {wEnd}</span>
            <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} style={{padding:"8px 12px",background:c.navy,border:"1.5px solid rgba(255,107,107,.3)",borderRadius:9,color:c.red,fontFamily:"'DM Sans',sans-serif",fontSize:12,outline:"none"}}/>
          </div>
        </div>
        <div style={{background:"rgba(255,107,107,.07)",border:"1px solid rgba(255,107,107,.2)",borderRadius:11,padding:"11px 16px",marginBottom:16,fontSize:12,color:"rgba(255,150,150,.9)",lineHeight:1.6}}>⚠️ Enseignants absents <strong>plus de 2 fois</strong> dans une même classe cette semaine.</div>
        {absReport.length===0?(
          <div style={{background:c.navyMid,border:"1px solid rgba(78,205,196,.2)",borderRadius:14,padding:"36px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:c.success}}>Aucun cas d'absentéisme excessif</div>
          </div>
        ):(
          <div style={{overflowX:"auto",borderRadius:14,border:"1px solid rgba(255,107,107,.2)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead><tr style={{background:"rgba(10,22,40,.95)"}}>
                {["Enseignant","Classe","Matière(s)","Absences","Jours","Toutes ses classes"].map((h,i)=>(
                  <th key={h} style={{padding:"11px 14px",fontSize:"10px",fontWeight:700,textTransform:"uppercase",color:i===3?c.red:c.muted,borderBottom:"1px solid rgba(255,107,107,.15)",textAlign:i===0?"left":"center",whiteSpace:"nowrap",letterSpacing:".07em"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{absReport.map((r,ri)=>(
                <tr key={ri} style={{borderBottom:"1px solid rgba(136,146,176,.07)"}}>
                  <td style={{padding:"13px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:34,height:34,borderRadius:"50%",background:r.ens.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:r.ens.genre==="F"?c.purple:c.success,flexShrink:0}}>{r.ens.prenom[0]}{r.ens.nom[0]}</div>
                      <div><div style={{fontWeight:700,fontSize:13}}>{r.ens.prenom} {r.ens.nom}</div><div style={{fontSize:10,color:c.muted}}>{r.ens.grade||r.ens.id}</div></div>
                    </div>
                  </td>
                  <td style={{padding:"13px 14px",textAlign:"center"}}><span style={{padding:"4px 12px",borderRadius:8,background:"rgba(255,107,107,.12)",color:c.red,fontWeight:700,fontSize:13}}>🏫 {r.classe}</span></td>
                  <td style={{padding:"13px 14px",textAlign:"center"}}><div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>{r.matieres.map((m,mi)=><span key={mi} style={{padding:"2px 8px",borderRadius:6,background:"rgba(116,192,252,.1)",color:"#74C0FC",fontSize:11}}>{m}</span>)}</div></td>
                  <td style={{padding:"13px 14px",textAlign:"center"}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:c.red}}>{r.absCount}</div></td>
                  <td style={{padding:"13px 14px",textAlign:"center"}}><div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>{r.absDays.map((j,ji)=><span key={ji} style={{padding:"3px 9px",borderRadius:6,background:"rgba(244,197,66,.1)",color:c.gold,fontSize:11,fontWeight:700}}>{j}</span>)}</div></td>
                  <td style={{padding:"13px 14px",textAlign:"center"}}><div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>{r.allClasses.map((cl,ci)=><span key={ci} style={{padding:"2px 8px",borderRadius:6,background:cl===r.classe?"rgba(255,107,107,.1)":"rgba(136,146,176,.08)",color:cl===r.classe?c.red:c.muted,fontSize:11}}>{cl}</span>)}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  

  // ── PRESENCES VIEW ────────────────────────────────────────────────────────
  if(view==="presences"){
    const JOURS=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
    const selectedDay=JOURS[new Date(dateFilter+"T12:00:00").getDay()];
    return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <button className="btn-secondary" onClick={()=>setView("list")} style={{padding:"9px 16px"}}>← Retour</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900}}>📋 Feuille de présence</div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
          <span style={{padding:"4px 12px",borderRadius:20,background:"rgba(244,197,66,.12)",color:c.gold,fontSize:12,fontWeight:700,border:"1px solid rgba(244,197,66,.25)"}}>
            📅 {selectedDay}
          </span>
          <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} style={{padding:"9px 14px",background:c.navy,border:"1.5px solid rgba(244,197,66,.3)",borderRadius:10,color:c.gold,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none"}}/>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {STATUTS.map(s=>{
          const count=enseignants.filter(e=>getPres(e.id).statut===s.id).length;
          return(
            <div key={s.id} style={{background:s.bg,border:`1px solid ${s.color}44`,borderRadius:12,padding:"12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:s.color}}>{count}</div>
              <div style={{fontSize:11,color:s.color,fontWeight:600,marginTop:2}}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {enseignants.length===0?(
        <div className="empty-state"><div className="big">👨‍🏫</div><div style={{fontWeight:600}}>Aucun enseignant.</div></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {enseignants.map(e=>{
            const pres=getPres(e.id);
            const ps=STATUTS.find(s=>s.id===pres.statut)||STATUTS[0];
            const allSlots=e.emploiDuTemps||[];
            const slotsToday=allSlots.filter(sl=>sl.jour===selectedDay);
            const SLOT_STATUTS=[
              {id:"present",icon:"✅",label:"Présent", color:"#4ECDC4",bg:"rgba(78,205,196,.15)"},
              {id:"absent", icon:"❌",label:"Absent",  color:"#FF6B6B",bg:"rgba(255,107,107,.15)"},
              {id:"retard", icon:"⏰",label:"En retard",color:"#F4C542",bg:"rgba(244,197,66,.15)"},
            ];
            const curSS=SLOT_STATUTS.find(s=>s.id===pres.statut)||SLOT_STATUTS[0];
            return(
              <div key={e.id} style={{background:c.navyMid,border:"1px solid rgba(136,146,176,.12)",borderRadius:14,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",flexWrap:"wrap"}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:e.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:15,color:e.genre==="F"?c.purple:c.success,flexShrink:0}}>
                    {e.prenom[0]}{e.nom[0]}
                  </div>
                  <div style={{flex:1,minWidth:140}}>
                    <div style={{fontWeight:700,fontSize:14}}>{e.prenom} {e.nom}</div>
                    <div style={{fontSize:11,color:c.muted,marginTop:2}}>{(e.matieres||[]).slice(0,3).map(m=>`${getMatIcon(m)} ${m}`).join("  ")}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <select value={pres.statut} onChange={ev=>setPres(e.id,"statut",ev.target.value)}
                      style={{padding:"7px 10px",background:ps.bg,border:`1.5px solid ${ps.color}66`,borderRadius:8,color:ps.color,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:12,outline:"none",cursor:"pointer"}}>
                      {STATUTS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <input type="time" value={pres.heure||""} onChange={ev=>setPres(e.id,"heure",ev.target.value)} title="Heure d'arrivée" style={{padding:"7px 10px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:8,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:12,outline:"none",width:100}}/>
                    <input type="text" placeholder="Remarque…" value={pres.note||""} onChange={ev=>setPres(e.id,"note",ev.target.value)} style={{padding:"7px 10px",background:c.navy,border:"1.5px solid rgba(136,146,176,.15)",borderRadius:8,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:12,outline:"none",width:120}}/>
                  </div>
                </div>
                <div style={{borderTop:"1px solid rgba(136,146,176,.1)",background:"rgba(10,22,40,.4)",padding:"12px 16px"}}>
                  {allSlots.length===0?(
                    <span style={{fontSize:11,color:"rgba(136,146,176,.4)",fontStyle:"italic"}}>
                      Aucun créneau — <button type="button" onClick={()=>openEdit(e)} style={{background:"none",border:"none",cursor:"pointer",color:c.muted,fontSize:11,textDecoration:"underline",fontFamily:"'DM Sans',sans-serif"}}>Ajouter →</button>
                    </span>
                  ):(
                    <>
                      <div style={{fontSize:10,color:c.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>
                        📅 Emploi du temps — {slotsToday.length>0?<span style={{color:"#F9A8D4"}}>{slotsToday.length} cours ce {selectedDay}</span>:<span>Pas de cours ce {selectedDay}</span>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {allSlots.map((sl,si)=>{
                          const isToday=sl.jour===selectedDay;
                          const sp=getSlotPres(e.id,si);
                          const ssl=SLOT_STATUTS.find(s=>s.id===sp.statut)||SLOT_STATUTS[0];
                          return(
                            <div key={si} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"10px 14px",borderRadius:10,
                              background:isToday?`rgba(${sp.statut==="absent"?"255,107,107":sp.statut==="retard"?"244,197,66":"78,205,196"},.06)`:"rgba(136,146,176,.04)",
                              border:`1.5px solid ${isToday?ssl.color+"44":"rgba(136,146,176,.12)"}`,opacity:isToday?1:0.55}}>
                              <span style={{padding:"3px 9px",borderRadius:6,fontSize:10,fontWeight:700,background:isToday?"rgba(249,168,212,.15)":"rgba(136,146,176,.1)",color:isToday?"#F9A8D4":c.muted,whiteSpace:"nowrap"}}>{sl.jour}</span>
                              {sl.classe&&<span style={{padding:"3px 9px",borderRadius:6,fontSize:11,fontWeight:700,background:isToday?"rgba(244,197,66,.12)":"rgba(136,146,176,.08)",color:isToday?c.gold:c.muted}}>🏫 {sl.classe}</span>}
                              {sl.matiere&&<span style={{fontSize:12,color:isToday?"#fff":c.muted,flex:1,direction:sl.matiere.charCodeAt(0)>1000?"rtl":"ltr"}}>📚 {sl.matiere}</span>}
                              {(sl.heureDebut||sl.heureFin)&&<span style={{fontSize:11,color:isToday?"rgba(255,255,255,.7)":c.muted,whiteSpace:"nowrap"}}>⏱ {sl.heureDebut||"—"} → {sl.heureFin||"—"}</span>}
                              {isToday&&(
                                <div style={{display:"flex",gap:6,marginLeft:"auto",flexShrink:0}}>
                                  {SLOT_STATUTS.map(ss=>(
                                    <button key={ss.id} type="button" onClick={()=>setSlotPres(e.id,si,ss.id)} title={ss.label}
                                      style={{padding:"6px 10px",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,
                                        border:`1.5px solid ${sp.statut===ss.id?ss.color:"rgba(136,146,176,.2)"}`,
                                        background:sp.statut===ss.id?ss.bg:"transparent",
                                        color:sp.statut===ss.id?ss.color:c.muted,transition:".15s",whiteSpace:"nowrap"}}>
                                      {ss.icon} {ss.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!isToday&&<span style={{marginLeft:"auto",fontSize:10,color:c.muted,fontStyle:"italic"}}>Autre jour</span>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{fontSize:11,color:c.muted,marginTop:12,textAlign:"right"}}>
        Présences sauvegardées automatiquement · {enseignants.length} enseignant{enseignants.length!==1?"s":""}
      </div>
    </div>
  );}

  if(view==="form") return(
    <div style={{maxWidth:620}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
        <button className="btn-secondary" onClick={()=>setView("list")} style={{padding:"9px 16px"}}>← Retour</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900}}>{selected?"✏️ Modifier l'enseignant":"➕ Ajouter un enseignant"}</div>
      </div>
      <div style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.15)",borderRadius:16,padding:"24px"}}>
        <div style={{fontSize:12,color:c.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:14}}>👤 Identité</div>
        <div className="form-grid">
          <div><label>Prénom *</label><input type="text" placeholder="Mamadou" value={form.prenom} onChange={e=>setF("prenom",e.target.value)}/></div>
          <div><label>Nom *</label><input type="text" placeholder="Diallo" value={form.nom} onChange={e=>setF("nom",e.target.value)}/></div>
          <div><label>Genre</label><select value={form.genre} onChange={e=>setF("genre",e.target.value)}><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
          <div><label>Date de naissance</label><input type="date" value={form.dateNaissance} onChange={e=>setF("dateNaissance",e.target.value)}/></div>
          <div><label>Téléphone *</label><input type="text" placeholder="06 xx xx xx xx" value={form.telephone} onChange={e=>setF("telephone",e.target.value)}/></div>
          <div><label>Email</label><input type="email" placeholder="email@example.com" value={form.email} onChange={e=>setF("email",e.target.value)}/></div>
        </div>
        <div style={{fontSize:12,color:c.success,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:14,marginTop:20}}>🎓 Informations professionnelles</div>
        <div className="form-grid">
          <div><label>Grade / Titre</label><input type="text" placeholder="Professeur certifié" value={form.grade} onChange={e=>setF("grade",e.target.value)}/></div>
          <div><label>Diplôme</label><input type="text" placeholder="Master CAPES" value={form.diplome} onChange={e=>setF("diplome",e.target.value)}/></div>
          <div><label>Date d'embauche</label><input type="date" value={form.dateEmbauche} onChange={e=>setF("dateEmbauche",e.target.value)}/></div>
          <div><label>Statut</label><select value={form.statut} onChange={e=>setF("statut",e.target.value)}><option value="actif">Actif</option><option value="inactif">Inactif</option><option value="remplacant">Remplaçant</option></select></div>
        </div>
        <div style={{fontSize:12,color:"#74C0FC",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12,marginTop:20}}>📚 Matières enseignées *</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
          {MATIERES_LABELS.map(m=>(
            <button key={m.label} type="button" onClick={()=>toggleMat(m.label)}
              style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${form.matieres.includes(m.label)?"rgba(116,192,252,.6)":"rgba(136,146,176,.2)"}`,background:form.matieres.includes(m.label)?"rgba(116,192,252,.15)":"transparent",color:form.matieres.includes(m.label)?"#74C0FC":c.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:".15s",direction:m.label.charCodeAt(0)>1000?"rtl":"ltr"}}>
              {m.icon} {form.matieres.includes(m.label)?"✓ ":""}{m.label}
            </button>
          ))}
        </div>
        <div style={{fontSize:12,color:"#F9A8D4",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12,marginTop:20}}>📅 Emploi du temps</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
          {(form.emploiDuTemps||[]).map((slot,i)=>(
            <div key={i} style={{background:c.navy,borderRadius:12,padding:"14px",border:"1px solid rgba(249,168,212,.15)"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:"#F9A8D4"}}>Créneau {i+1}</span>
                <button type="button" onClick={()=>setForm(p=>({...p,emploiDuTemps:p.emploiDuTemps.filter((_,idx)=>idx!==i)}))} style={{background:"rgba(255,107,107,.12)",border:"1px solid rgba(255,107,107,.25)",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,color:c.red,fontFamily:"'DM Sans',sans-serif"}}>✕</button>
              </div>
              <div className="form-grid">
                <div><label>Classe</label><input type="text" placeholder="Ex: 7ème A" value={slot.classe||""} onChange={e=>{const t=[...(form.emploiDuTemps||[])];t[i]={...t[i],classe:e.target.value};setF("emploiDuTemps",t);}}/></div>
                <div><label>Matière</label><select value={slot.matiere||""} onChange={e=>{const t=[...(form.emploiDuTemps||[])];t[i]={...t[i],matiere:e.target.value};setF("emploiDuTemps",t);}}><option value="">-- Matière --</option>{MATIERES_LABELS.map(m=><option key={m.label} value={m.label}>{m.icon} {m.label}</option>)}</select></div>
                <div><label>Jour</label><select value={slot.jour||""} onChange={e=>{const t=[...(form.emploiDuTemps||[])];t[i]={...t[i],jour:e.target.value};setF("emploiDuTemps",t);}}><option value="">-- Jour --</option>{["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"].map(j=><option key={j} value={j}>{j}</option>)}</select></div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}><label>Début</label><input type="time" value={slot.heureDebut||""} onChange={e=>{const t=[...(form.emploiDuTemps||[])];t[i]={...t[i],heureDebut:e.target.value};setF("emploiDuTemps",t);}}/></div>
                  <div style={{flex:1}}><label>Fin</label><input type="time" value={slot.heureFin||""} onChange={e=>{const t=[...(form.emploiDuTemps||[])];t[i]={...t[i],heureFin:e.target.value};setF("emploiDuTemps",t);}}/></div>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={()=>setForm(p=>({...p,emploiDuTemps:[...(p.emploiDuTemps||[]),{classe:"",matiere:"",jour:"",heureDebut:"",heureFin:""}]}))}
            style={{width:"100%",padding:"11px",background:"rgba(249,168,212,.07)",border:"1.5px dashed rgba(249,168,212,.3)",borderRadius:10,cursor:"pointer",fontSize:13,color:"#F9A8D4",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
            ➕ Ajouter un créneau
          </button>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{marginBottom:7,display:"block"}}>Observations</label>
          <textarea rows={3} placeholder="Notes particulières…" value={form.observations} onChange={e=>setF("observations",e.target.value)} style={{width:"100%",padding:"11px 14px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:10,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none",resize:"vertical"}}/>
        </div>
        {formErr&&<p className="error-msg">{formErr}</p>}
        <div style={{display:"flex",gap:10}}>
          <button className="btn-secondary" onClick={()=>setView("list")} style={{width:120}}>Annuler</button>
          <button className="btn-primary" onClick={handleSave} style={{marginTop:0}}>{selected?"💾 Enregistrer":"➕ Ajouter l'enseignant"}</button>
        </div>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <div className="stat-tile"><div className="stat-val">{enseignants.length}</div><div className="stat-lbl">Total</div></div>
        <div className="stat-tile"><div className="stat-val" style={{color:c.success}}>{enseignants.filter(e=>e.statut==="actif").length}</div><div className="stat-lbl">Actifs</div></div>
        <div className="stat-tile"><div className="stat-val" style={{color:c.success}}>{enseignants.filter(e=>getPres(e.id).statut==="present").length}</div><div className="stat-lbl">Présents</div></div>
        <div className="stat-tile"><div className="stat-val" style={{color:c.red}}>{enseignants.filter(e=>getPres(e.id).statut==="absent").length}</div><div className="stat-lbl">Absents</div></div>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
        <input className="search-input" placeholder="🔍 Rechercher un enseignant…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180}}/>
        <button className="btn-primary" style={{width:"auto",padding:"10px 20px",marginTop:0,fontSize:13}} onClick={()=>setView("presences")}>📋 Présences du jour</button>
        <button className="btn-primary" style={{width:"auto",padding:"10px 20px",marginTop:0,fontSize:13,background:"rgba(255,107,107,.2)",color:c.red,border:"1px solid rgba(255,107,107,.35)"}} onClick={()=>setView("absences")}>⚠️ Rapport absentéisme</button>
        <button className="btn-primary" style={{width:"auto",padding:"10px 20px",marginTop:0,fontSize:13,background:"rgba(78,205,196,.9)",color:"#0A1628"}} onClick={openAdd}>➕ Ajouter un enseignant</button>
      </div>
      {filtered.length===0?(
        <div className="empty-state"><div className="big">👨‍🏫</div><div style={{fontWeight:600}}>Aucun enseignant enregistré</div><button className="btn-primary" style={{marginTop:16,width:"auto",padding:"10px 24px"}} onClick={openAdd}>➕ Ajouter le premier enseignant</button></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(e=>{
            const pres=getPres(e.id);const ps=STATUTS.find(s=>s.id===pres.statut)||STATUTS[0];
            return(
              <div key={e.id} style={{background:c.navyMid,border:"1px solid rgba(136,146,176,.12)",borderRadius:14,padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:46,height:46,borderRadius:"50%",background:e.genre==="F"?"rgba(167,139,250,.2)":"rgba(78,205,196,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:18,color:e.genre==="F"?c.purple:c.success,flexShrink:0}}>{e.prenom[0]}{e.nom[0]}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:14}}>{e.prenom} {e.nom}</span>
                    <span className={`tag tag-${e.statut==="actif"?"actif":"inactif"}`}>{e.statut}</span>
                    <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:ps.bg,color:ps.color}}>{ps.label}</span>
                  </div>
                  <div style={{fontSize:12,color:c.muted,display:"flex",gap:12,flexWrap:"wrap"}}>
                    {e.matieres?.length>0&&<span>📚 {e.matieres.slice(0,3).join(", ")}{e.matieres.length>3?` +${e.matieres.length-3}`:""}</span>}
                    {e.telephone&&<span>📞 {e.telephone}</span>}
                    {e.emploiDuTemps?.length>0&&<span>📅 {e.emploiDuTemps.length} créneau{e.emploiDuTemps.length>1?"x":""}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <button onClick={()=>openEdit(e)} style={{padding:"7px 12px",background:"rgba(167,139,250,.12)",border:"1px solid rgba(167,139,250,.3)",borderRadius:8,color:c.purple,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>✏️ Modifier</button>
                  <button onClick={()=>handleDelete(e.id)} style={{padding:"7px 12px",background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:8,color:c.red,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bibliothèque ──────────────────────────────────────────────────────────────
const BIBLIO_KEY="ecolehub_biblio_db";
function getBiblio(sc){try{const a=JSON.parse(localStorage.getItem(BIBLIO_KEY)||"{}");return a[sc]||[];}catch{return[];}}
function saveBiblio(sc,list){const a=JSON.parse(localStorage.getItem(BIBLIO_KEY)||"{}");a[sc]=list;localStorage.setItem(BIBLIO_KEY,JSON.stringify(a));}
function genLivreId(){return"LIV-"+Math.floor(10000+Math.random()*90000);}

function BibliothequeModule({schoolData}){
  const [livres,setLivres]=useState(()=>getBiblio(schoolData.code));
  const [view,setView]=useState("liste"); // liste | form | emprunts | pdf
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("all");
  const [sel,setSel]=useState(null);
  const [form,setForm]=useState({titre:"",auteur:"",categorie:"Manuel scolaire",classe:"",matiere:"",quantite:1,disponible:1,isbn:"",editeur:"",annee:""});
  const [formErr,setFormErr]=useState("");
  const [pdfDocs,setPdfDocs]=useState(()=>{try{const s=localStorage.getItem("biblio_pdfs_"+schoolData.code);return s?JSON.parse(s):[];}catch{return[];}});
  const [pdfSearch,setPdfSearch]=useState("");
  const savePdfDocs=(list)=>{setPdfDocs(list);try{localStorage.setItem("biblio_pdfs_"+schoolData.code,JSON.stringify(list));}catch(e){alert("Stockage insuffisant — essayez des fichiers plus petits.");}};

  const CATEGORIES=["Manuel scolaire","Livre de lecture","Dictionnaire","Atlas","Roman","Science","Religieux","Autre"];
  const CAT_ICONS={"Manuel scolaire":"📘","Livre de lecture":"📖","Dictionnaire":"📒","Atlas":"🗺️","Roman":"📕","Science":"🔬","Religieux":"📿","Autre":"📗"};

  const persist=(list)=>{setLivres(list);saveBiblio(schoolData.code,list);};
  const setF=(k,v)=>{setForm(p=>({...p,[k]:v}));setFormErr("");};

  const handleSave=()=>{
    if(!form.titre.trim()){setFormErr("Le titre est obligatoire.");return;}
    if(!form.auteur.trim()){setFormErr("L'auteur est obligatoire.");return;}
    const livre={...form,id:sel?.id||genLivreId(),
      quantite:parseInt(form.quantite)||1,
      disponible:parseInt(form.disponible)||1,
      emprunts:sel?.emprunts||[]};
    persist(sel?livres.map(l=>l.id===sel.id?livre:l):[...livres,livre]);
    setView("liste");setSel(null);
    setForm({titre:"",auteur:"",categorie:"Manuel scolaire",classe:"",matiere:"",quantite:1,disponible:1,isbn:"",editeur:"",annee:""});
  };

  const handleDelete=(id)=>{if(!window.confirm("Supprimer ce livre ?"))return;persist(livres.filter(l=>l.id!==id));};

  const handleEmprunt=(livre)=>{
    if(livre.disponible<=0){alert("Aucun exemplaire disponible.");return;}
    const nom=prompt("Nom de l'emprunteur (élève/enseignant) :");
    if(!nom) return;
    const date=new Date().toLocaleDateString("fr-FR");
    const updated={...livre,disponible:livre.disponible-1,
      emprunts:[...livre.emprunts||[],{nom,dateEmprunt:date,dateRetour:null}]};
    persist(livres.map(l=>l.id===livre.id?updated:l));
  };

  const handleRetour=(livre,idx)=>{
    const updated={...livre,disponible:livre.disponible+1,
      emprunts:livre.emprunts.map((e,i)=>i===idx?{...e,dateRetour:new Date().toLocaleDateString("fr-FR")}:e)};
    persist(livres.map(l=>l.id===livre.id?updated:l));
  };

  const filtered=livres.filter(l=>{
    const q=search.toLowerCase();
    return(!q||l.titre.toLowerCase().includes(q)||l.auteur.toLowerCase().includes(q)||l.classe?.toLowerCase().includes(q))
      &&(filterCat==="all"||l.categorie===filterCat);
  });

  const totalLivres=livres.reduce((a,l)=>a+(parseInt(l.quantite)||0),0);
  const totalDispo=livres.reduce((a,l)=>a+(parseInt(l.disponible)||0),0);
  const totalEmpruntes=totalLivres-totalDispo;
  const enRetard=livres.flatMap(l=>(l.emprunts||[]).filter(e=>!e.dateRetour)).length;

  // ── FORM VIEW ──
  if(view==="form") return(
    <div style={{maxWidth:580}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
        <button className="btn-secondary" onClick={()=>{setView("liste");setSel(null);}} style={{padding:"9px 16px"}}>← Retour</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900}}>
          {sel?"✏️ Modifier le livre":"➕ Ajouter un livre"}
        </div>
      </div>
      <div style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.15)",borderRadius:16,padding:"24px"}}>
        <div style={{fontSize:12,color:c.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:14}}>📚 Informations du livre</div>
        <div className="form-grid">
          <div style={{gridColumn:"1/-1"}}><label>Titre *</label><input type="text" placeholder="Ex: Mathématiques 7ème" value={form.titre} onChange={e=>setF("titre",e.target.value)}/></div>
          <div><label>Auteur *</label><input type="text" placeholder="Nom de l'auteur" value={form.auteur} onChange={e=>setF("auteur",e.target.value)}/></div>
          <div><label>Éditeur</label><input type="text" placeholder="Éditeur" value={form.editeur} onChange={e=>setF("editeur",e.target.value)}/></div>
          <div><label>Catégorie</label>
            <select value={form.categorie} onChange={e=>setF("categorie",e.target.value)}>
              {CATEGORIES.map(cat=><option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>)}
            </select>
          </div>
          <div><label>Classe concernée</label><input type="text" placeholder="Ex: 7ème, 8ème..." value={form.classe} onChange={e=>setF("classe",e.target.value)}/></div>
          <div><label>Matière</label><input type="text" placeholder="Ex: Mathématiques" value={form.matiere} onChange={e=>setF("matiere",e.target.value)}/></div>
          <div><label>Année édition</label><input type="text" placeholder="Ex: 2023" value={form.annee} onChange={e=>setF("annee",e.target.value)}/></div>
          <div><label>ISBN</label><input type="text" placeholder="Code ISBN" value={form.isbn} onChange={e=>setF("isbn",e.target.value)}/></div>
          <div><label>Quantité totale</label><input type="number" min={1} value={form.quantite} onChange={e=>setF("quantite",e.target.value)}/></div>
          <div><label>Exemplaires disponibles</label><input type="number" min={0} max={form.quantite} value={form.disponible} onChange={e=>setF("disponible",e.target.value)}/></div>
        </div>
        {formErr&&<p className="error-msg">{formErr}</p>}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button className="btn-secondary" onClick={()=>{setView("liste");setSel(null);}} style={{width:120}}>Annuler</button>
          <button className="btn-primary" onClick={handleSave} style={{marginTop:0}}>{sel?"💾 Enregistrer":"➕ Ajouter le livre"}</button>
        </div>
      </div>
    </div>
  );

  // ── DETAIL EMPRUNTS VIEW ──
  if(view==="emprunts"&&sel) return(
    <div style={{maxWidth:600}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button className="btn-secondary" onClick={()=>{setView("liste");setSel(null);}} style={{padding:"9px 16px"}}>← Retour</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900}}>📋 Emprunts — {sel.titre}</div>
      </div>
      <div style={{background:c.navyMid,border:"1px solid rgba(244,197,66,.15)",borderRadius:14,padding:"18px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10,fontSize:13}}>
          <span><strong style={{color:c.gold}}>{CAT_ICONS[sel.categorie]} {sel.categorie}</strong></span>
          <span style={{color:c.muted}}>Quantité : {sel.quantite} | Disponible : <strong style={{color:sel.disponible>0?c.success:c.red}}>{sel.disponible}</strong></span>
        </div>
      </div>
      <button className="btn-primary" onClick={()=>handleEmprunt(sel)} style={{marginTop:0,marginBottom:16,width:"auto",padding:"10px 20px",
        background:sel.disponible>0?"rgba(78,205,196,.9)":"rgba(136,146,176,.3)",
        color:sel.disponible>0?"#0A1628":c.muted,cursor:sel.disponible>0?"pointer":"not-allowed"}}>
        📤 Enregistrer un emprunt
      </button>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(sel.emprunts||[]).length===0&&<div className="empty-state"><div className="big">📋</div><div>Aucun emprunt enregistré</div></div>}
        {(sel.emprunts||[]).map((e,i)=>(
          <div key={i} style={{background:c.navyMid,border:`1px solid ${e.dateRetour?"rgba(78,205,196,.2)":"rgba(244,197,66,.2)"}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13}}>{e.nom}</div>
              <div style={{fontSize:11,color:c.muted,marginTop:2}}>
                Emprunté le {e.dateEmprunt}
                {e.dateRetour&&<span style={{color:c.success,marginLeft:10}}>✓ Rendu le {e.dateRetour}</span>}
                {!e.dateRetour&&<span style={{color:c.gold,marginLeft:10}}>⏳ En cours</span>}
              </div>
            </div>
            {!e.dateRetour&&(
              <button onClick={()=>{handleRetour(sel,i);setSel({...sel,emprunts:sel.emprunts.map((x,j)=>j===i?{...x,dateRetour:new Date().toLocaleDateString("fr-FR")}:x),disponible:sel.disponible+1});}}
                style={{padding:"7px 14px",background:"rgba(78,205,196,.15)",border:"1px solid rgba(78,205,196,.3)",borderRadius:8,color:c.success,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                ✓ Retour
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ── PDF VIEW ──
  if(view==="pdf"){
    const handleFiles=(files)=>{
      const pdfs=Array.from(files).filter(f=>f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf"));
      if(!pdfs.length){alert("Veuillez sélectionner des fichiers PDF.");return;}
      if(pdfs.some(f=>f.size>3*1024*1024)){
        alert("Attention : certains fichiers dépassent 3 Mo. Le stockage peut être limité.");
      }
      let done=0;
      const newDocs=[];
      pdfs.forEach(file=>{
        const reader=new FileReader();
        reader.onload=ev=>{
          newDocs.push({
            id:"PDF-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            nom:file.name.replace(/\.pdf$/i,""),
            taille:file.size,
            date:new Date().toLocaleDateString("fr-FR"),
            data:ev.target.result,
          });
          done++;
          if(done===pdfs.length){
            const updated=[...pdfDocs,...newDocs];
            try{
              localStorage.setItem("biblio_pdfs_"+schoolData.code,JSON.stringify(updated));
              setPdfDocs(updated);
              alert(`✅ ${newDocs.length} fichier${newDocs.length>1?"s":""} importé${newDocs.length>1?"s":""}  !`);
            }catch(e){
              alert("❌ Stockage insuffisant. Essayez des fichiers plus petits (< 2 Mo chacun).");
            }
          }
        };
        reader.onerror=()=>{alert("Erreur lors de la lecture de "+file.name);};
        reader.readAsDataURL(file);
      });
    };

    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <button className="btn-secondary" onClick={()=>setView("liste")} style={{padding:"9px 16px"}}>← Retour</button>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900}}>📁 Documents PDF</div>
          <div style={{marginLeft:"auto",fontSize:12,color:c.muted}}>{pdfDocs.length} document{pdfDocs.length!==1?"s":""}</div>
        </div>

        {/* Ajouter un document */}
        <div style={{background:c.navyMid,border:"1px solid rgba(255,107,107,.25)",borderRadius:16,padding:"24px",marginBottom:20}}>
          <div style={{fontSize:13,color:"#FF6B6B",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:16}}>
            📁 Ajouter un document PDF
          </div>

          {/* Option 1 : Lien URL (Google Drive, Dropbox...) */}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,color:c.muted,fontWeight:600,display:"block",marginBottom:6}}>
              🔗 Lien du fichier (Google Drive, Dropbox, OneDrive...)
            </label>
            <div style={{display:"flex",gap:8}}>
              <input type="url"
                id="pdf-url-input"
                placeholder="https://drive.google.com/..."
                style={{flex:1,padding:"10px 14px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:9,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none"}}/>
            </div>
          </div>

          {/* Nom du document */}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,color:c.muted,fontWeight:600,display:"block",marginBottom:6}}>
              📄 Nom du document *
            </label>
            <input type="text"
              id="pdf-nom-input"
              placeholder="Ex: Cours de Mathématiques 7ème"
              style={{width:"100%",padding:"10px 14px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:9,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none"}}/>
          </div>

          {/* Description */}
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,color:c.muted,fontWeight:600,display:"block",marginBottom:6}}>
              📝 Description (optionnel)
            </label>
            <input type="text"
              id="pdf-desc-input"
              placeholder="Ex: Cours S1 - Classe 7ème"
              style={{width:"100%",padding:"10px 14px",background:c.navy,border:"1.5px solid rgba(136,146,176,.2)",borderRadius:9,color:c.white,fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:"none"}}/>
          </div>

          <button
            onClick={()=>{
              const nom=document.getElementById("pdf-nom-input")?.value?.trim();
              const url=document.getElementById("pdf-url-input")?.value?.trim();
              const desc=document.getElementById("pdf-desc-input")?.value?.trim();
              if(!nom){alert("Veuillez entrer le nom du document.");return;}
              const newDoc={
                id:"PDF-"+Date.now(),
                nom,
                url:url||null,
                description:desc||"",
                date:new Date().toLocaleDateString("fr-FR"),
                taille:null,
                data:null,
              };
              const updated=[...pdfDocs,newDoc];
              try{
                localStorage.setItem("biblio_pdfs_"+schoolData.code,JSON.stringify(updated));
                setPdfDocs(updated);
                document.getElementById("pdf-nom-input").value="";
                document.getElementById("pdf-url-input").value="";
                document.getElementById("pdf-desc-input").value="";
                alert("✅ Document ajouté !");
              }catch(e){
                alert("Erreur de sauvegarde.");
              }
            }}
            style={{width:"100%",padding:"12px",background:"rgba(255,107,107,.85)",color:"#fff",border:"none",borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            ➕ Ajouter le document
          </button>

          <div style={{marginTop:12,padding:"10px 14px",background:"rgba(244,197,66,.06)",border:"1px solid rgba(244,197,66,.15)",borderRadius:8,fontSize:11,color:c.muted,lineHeight:1.6}}>
            💡 <strong style={{color:c.gold}}>Astuce :</strong> Partagez votre PDF sur Google Drive → Obtenir le lien → Coller ici. Vous pourrez l'ouvrir directement depuis la bibliothèque.
          </div>
        </div>

        {/* Barre de recherche */}
        {pdfDocs.length>0&&(
          <input className="search-input" placeholder="🔍 Rechercher un document…"
            value={pdfSearch} onChange={e=>setPdfSearch(e.target.value)}
            style={{marginBottom:16,width:"100%"}}/>
        )}

        {/* Liste des PDFs */}
        {pdfDocs.length===0?(
          <div className="empty-state">
            <div className="big">📂</div>
            <div style={{fontWeight:600}}>Aucun document importé</div>
            <div style={{fontSize:12,marginTop:6,color:c.muted}}>Importez vos fichiers PDF ci-dessus</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pdfDocs
              .filter(d=>!pdfSearch||d.nom.toLowerCase().includes(pdfSearch.toLowerCase()))
              .map(doc=>(
                <div key={doc.id} style={{background:c.navyMid,border:"1px solid rgba(255,107,107,.15)",borderRadius:14,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:46,height:46,borderRadius:12,background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
                    📄
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.nom}</div>
                    <div style={{fontSize:11,color:c.muted,display:"flex",gap:14,flexWrap:"wrap"}}>
                      <span>📅 {doc.date}</span>
                      {doc.taille&&<span>📦 {doc.taille>1024*1024?(doc.taille/1024/1024).toFixed(1)+" Mo":(doc.taille/1024).toFixed(0)+" Ko"}</span>}
                      {doc.url&&!doc.data&&<span style={{color:"#74C0FC"}}>🔗 Lien externe</span>}
                      {doc.description&&<span>{doc.description}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {/* Ouvrir */}
                    {(doc.url||doc.data)&&(
                      <button onClick={()=>{
                        let url=doc.url||doc.data||"";
                        // Convertir lien Google Drive en aperçu direct
                        if(url.includes("drive.google.com")){
                          const m=url.match(/[-\w]{25,}/);
                          if(m) url="https://drive.google.com/file/d/"+m[0]+"/preview";
                        }
                        window.open(url,"_blank");
                      }} style={{padding:"8px 14px",background:"rgba(78,205,196,.15)",border:"1px solid rgba(78,205,196,.3)",borderRadius:8,color:c.success,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:4}}>
                        👁️ Ouvrir
                      </button>
                    )}
                    {/* Copier lien ou Télécharger */}
                    {doc.url&&!doc.data&&(
                      <button onClick={()=>{
                        try{navigator.clipboard.writeText(doc.url);alert("✅ Lien copié dans le presse-papiers !");}
                        catch{alert("Lien : "+doc.url);}
                      }} style={{padding:"8px 14px",background:"rgba(244,197,66,.15)",border:"1px solid rgba(244,197,66,.3)",borderRadius:8,color:c.gold,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:4}}>
                        🔗 Copier lien
                      </button>
                    )}
                    {doc.data&&(
                      <a href={doc.data} download={doc.nom+".pdf"} style={{padding:"8px 14px",background:"rgba(244,197,66,.15)",border:"1px solid rgba(244,197,66,.3)",borderRadius:8,color:c.gold,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}}>
                        📥 Télécharger
                      </a>
                    )}
                    {/* Supprimer */}
                    <button onClick={()=>{
                        if(!window.confirm(`Supprimer "${doc.nom}" ?`)) return;
                        const updated=pdfDocs.filter(d=>d.id!==doc.id);
                        localStorage.setItem("biblio_pdfs_"+schoolData.code,JSON.stringify(updated));
                        setPdfDocs(updated);
                      }}
                      style={{padding:"8px 12px",background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:8,color:c.red,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
        <div style={{fontSize:11,color:c.muted,marginTop:10,textAlign:"right"}}>
          {pdfDocs.length} document{pdfDocs.length!==1?"s":""} · Stockage local navigateur
        </div>
      </div>
    );
  }

    // ── LISTE VIEW ──
  return(
    <div>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Total titres",val:livres.length,color:c.gold},
          {label:"Total exemplaires",val:totalLivres,color:"#74C0FC"},
          {label:"Disponibles",val:totalDispo,color:c.success},
          {label:"Empruntés",val:totalEmpruntes,color:"#F9A8D4"},
        ].map((st,i)=>(
          <div key={i} className="stat-tile">
            <div className="stat-val" style={{color:st.color}}>{st.val}</div>
            <div className="stat-lbl">{st.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Add button */}
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
        <input className="search-input" placeholder="🔍 Titre, auteur, classe…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180}}/>
        <select className="filter-sel" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map(cat=><option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>)}
        </select>
        <button className="btn-primary" style={{width:"auto",padding:"10px 20px",marginTop:0,fontSize:13}} onClick={()=>{setSel(null);setView("form");}}>
          ➕ Ajouter un livre
        </button>
        <button className="btn-primary" style={{width:"auto",padding:"10px 20px",marginTop:0,fontSize:13,background:"rgba(255,107,107,.85)",color:"#fff"}} onClick={()=>setView("pdf")}>
          📁 Importer des fichiers
        </button>
      </div>

      {filtered.length===0&&(
        <div className="empty-state">
          <div className="big">📚</div>
          <div style={{fontWeight:600,marginBottom:8}}>Aucun livre dans la bibliothèque</div>
          <button className="btn-primary" style={{width:"auto",padding:"10px 24px"}} onClick={()=>{setSel(null);setView("form");}}>➕ Ajouter le premier livre</button>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(livre=>{
          const empruntsActifs=(livre.emprunts||[]).filter(e=>!e.dateRetour).length;
          return(
            <div key={livre.id} style={{background:c.navyMid,border:`1px solid ${livre.disponible===0?"rgba(255,107,107,.2)":"rgba(136,146,176,.12)"}`,borderRadius:14,padding:"14px 18px"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                {/* Icône catégorie */}
                <div style={{width:48,height:48,borderRadius:12,background:"rgba(244,197,66,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
                  {CAT_ICONS[livre.categorie]||"📗"}
                </div>
                {/* Infos */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{livre.titre}</div>
                  <div style={{fontSize:12,color:c.muted,marginBottom:6,display:"flex",gap:14,flexWrap:"wrap"}}>
                    <span>✍️ {livre.auteur}</span>
                    {livre.classe&&<span>🏫 {livre.classe}</span>}
                    {livre.matiere&&<span>📚 {livre.matiere}</span>}
                    {livre.annee&&<span>📅 {livre.annee}</span>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:"rgba(244,197,66,.1)",color:c.gold}}>{livre.categorie}</span>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:"rgba(116,192,252,.1)",color:"#74C0FC"}}>
                      📦 {livre.quantite} ex.
                    </span>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:livre.disponible>0?"rgba(78,205,196,.1)":"rgba(255,107,107,.1)",
                      color:livre.disponible>0?c.success:c.red}}>
                      {livre.disponible>0?`✅ ${livre.disponible} dispo`:"❌ Indisponible"}
                    </span>
                    {empruntsActifs>0&&(
                      <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                        background:"rgba(249,168,212,.1)",color:"#F9A8D4"}}>
                        📤 {empruntsActifs} emprunté{empruntsActifs>1?"s":""}
                      </span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <button onClick={()=>handleEmprunt(livre)}
                    style={{padding:"7px 12px",background:livre.disponible>0?"rgba(78,205,196,.15)":"rgba(136,146,176,.1)",border:`1px solid ${livre.disponible>0?"rgba(78,205,196,.3)":"rgba(136,146,176,.2)"}`,borderRadius:8,color:livre.disponible>0?c.success:c.muted,fontSize:12,fontWeight:700,cursor:livre.disponible>0?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif"}}>
                    📤 Emprunter
                  </button>
                  <button onClick={()=>{setSel(livre);setView("emprunts");}}
                    style={{padding:"7px 12px",background:"rgba(244,197,66,.1)",border:"1px solid rgba(244,197,66,.25)",borderRadius:8,color:c.gold,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                    📋 Emprunts
                  </button>
                  <button onClick={()=>{setSel(livre);setForm({...livre});setView("form");}}
                    style={{padding:"7px 12px",background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.25)",borderRadius:8,color:c.purple,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                    ✏️
                  </button>
                  <button onClick={()=>handleDelete(livre.id)}
                    style={{padding:"7px 12px",background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",borderRadius:8,color:c.red,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{fontSize:11,color:c.muted,marginTop:10,textAlign:"right"}}>
        {filtered.length} livre{filtered.length!==1?"s":""} affiché{filtered.length!==1?"s":""}
      </div>
    </div>
  );
}


// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({data,onLogout}){
  const [nav,setNav]=useState("home");
  const lvI={maternelle:"🌱",primaire:"📚",college:"🏫",lycee:"🎓"};
  const lvL={maternelle:"Maternelle",primaire:"Primaire",college:"Collège",lycee:"Lycée"};
  const allMods=[];
  data.levels.forEach(lv=>(MODULE_MAP[lv]||[]).forEach(m=>{if(!allMods.find(x=>x.title===m.title))allMods.push(m);}));
  const navItems=[
    {id:"home",      icon:"🏠", label:"Accueil"},
    {id:"students",  icon:"👩‍🎓",label:"Élèves"},
    {id:"results",   icon:"📊", label:"Résultats"},
    {id:"bulletins", icon:"📝", label:"Bulletins"},
    {id:"messagerie",icon:"💬", label:"Messagerie"},
    ...(data.role==="directeur"?[{id:"enseignants",icon:"👨‍🏫",label:"Enseignants"}]:[]),
    {id:"bibliotheque",icon:"📚", label:"Bibliothèque"},
    {id:"modules",   icon:"📦", label:"Modules"},
  ];
  const sc=getStudents(data.code).length||data.levels.length*20;
  const isDirecteur=data.role==="directeur";

  return(
    <div className="dash-shell">
      <div className="sidebar" style={{width:200}}>
        <div className="sidebar-logo">
          <div className="logo-icon" style={{width:32,height:32,fontSize:16}}>🏛️</div>
          <div>
            <div className="logo-text" style={{fontSize:15}}>École<span>Hub</span></div>
            {data.role&&data.role!=="ecole"&&(
              <div style={{fontSize:10,fontWeight:700,marginTop:2,color:data.role==="directeur"?"#4ECDC4":data.adminRole==="enseignant"?"#86EFAC":"#74C0FC",letterSpacing:".04em",textTransform:"uppercase"}}>
                {data.role==="directeur"?"🎩 Directeur":data.adminRole==="enseignant"?"👨‍🏫 Enseignant":"📋 Censeur"}
              </div>
            )}
          </div>
        </div>
        {navItems.map(n=>(
          <div key={n.id} className={`nav-item ${nav===n.id?"active":""}`} style={{fontSize:12.5,padding:"10px 14px"}} onClick={()=>setNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <div className="sidebar-bottom"><button className="btn-secondary" onClick={onLogout} style={{width:"100%",fontSize:12,padding:"9px 14px"}}>🚪 Déconnexion</button></div>
      </div>

      <div className="dash-main">
        <div className="dash-topbar">
          <div className="school-info-badge">
            <div className="school-ava">🏛️</div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div className="school-nm">{data.name}</div>
                {data.role&&data.role!=="ecole"&&(
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:data.role==="directeur"?"rgba(78,205,196,.15)":"rgba(116,192,252,.12)",color:data.role==="directeur"?"#4ECDC4":"#74C0FC",border:`1px solid ${data.role==="directeur"?"rgba(78,205,196,.3)":"rgba(116,192,252,.25)"}`}}>
                    {data.role==="directeur"?"🎩 Directeur":"⚙️ Administrateur"}
                  </span>
                )}
              </div>
              <div className="school-sub">
                <span className={`tag tag-${data.type==="publique"?"public":"private"}`}>{data.type==="publique"?"Publique":"Privée"}</span>
                <span>Code : <strong style={{color:c.goldLight}}>{data.code}</strong></span>
              </div>
            </div>
          </div>
          <div className="levels-row" style={{marginBottom:0}}>
            {data.levels.map(lv=><span key={lv} className="level-pill">{lvI[lv]} {lvL[lv]}</span>)}
          </div>
        </div>

        {nav==="home"&&<>
          <div className="stats-strip">
            <div className="stat-tile"><div className="stat-val">{sc}</div><div className="stat-lbl">Élèves</div></div>
            <div className="stat-tile"><div className="stat-val">{data.levels.length*4}</div><div className="stat-lbl">Classes</div></div>
            <div className="stat-tile"><div className="stat-val">{data.levels.length*8}</div><div className="stat-lbl">Enseignants</div></div>
            <div className="stat-tile"><div className="stat-val">{allMods.length}</div><div className="stat-lbl">Modules</div></div>
          </div>
          <div className="divider"/>
          <div className="section-title" style={{marginBottom:14}}>Accès rapide</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:28}}>
            <button className="btn-secondary" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setNav("students")}>👩‍🎓 Élèves</button>
            <button className="btn-secondary" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setNav("results")}>📊 Résultats</button>
            <button className="btn-secondary" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setNav("messagerie")}>💬 Messagerie</button>
            {isDirecteur&&<button className="btn-secondary" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setNav("enseignants")}>👨‍🏫 Enseignants</button>}
          </div>
          <p className="footer-note">ÉcoleHub SaaS · {data.name} · {data.code}</p>
        </>}

        {nav==="students"&&<><h1 style={{marginBottom:20}}>👩‍🎓 Gestion des élèves</h1><StudentsModule schoolData={data}/></>}
        {nav==="results"&&<><h1 style={{marginBottom:20}}>📊 Résultats scolaires</h1><ResultsModule schoolData={data}/></>}
        {nav==="bulletins"&&<><h1 style={{marginBottom:20}}>📝 Bulletins scolaires</h1><BulletinModule schoolData={data}/></>}
        {nav==="messagerie"&&<><h1 style={{marginBottom:20}}>💬 Messagerie École–Parents</h1><MessagerieModule schoolData={data}/></>}
        {nav==="enseignants"&&<><h1 style={{marginBottom:20}}>👨‍🏫 Gestion des enseignants</h1><EnseignantsModule schoolData={data}/></>}
        {nav==="bibliotheque"&&<><h1 style={{marginBottom:20}}>📚 Bibliothèque</h1><BibliothequeModule schoolData={data}/></>}
                {nav==="modules"&&<><h1 style={{marginBottom:20}}>📦 Modules disponibles</h1>
          <div className="modules-grid">
            {allMods.map((m,i)=><div key={i} className="module-card"><div className="module-icon">{m.icon}</div><div className="module-title">{m.title}</div><div className="module-count">{m.count}</div></div>)}
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── Session helpers ──────────────────────────────────────────────────────────
const SESSION_KEY="ecolehub_session";
function saveSession(data){try{localStorage.setItem(SESSION_KEY,JSON.stringify(data));}catch{}}
function clearSession(){try{localStorage.removeItem(SESSION_KEY);}catch{}}
function loadSession(){
  try{
    const s=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");
    if(!s) return null;
    if(s.type==="school"&&s.data?.code){
      const fresh=getSchools()[s.data.code];
      if(fresh) return {...s,data:{...fresh,role:s.data.role||"ecole",adminRole:s.data.adminRole}};
    }
    return s;
  }catch{return null;}
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const APP_VERSION="v2.5";
// Clear stale sessions from old versions (no role field)
(()=>{try{const v=localStorage.getItem("ecolehub_version");if(v!==APP_VERSION){localStorage.removeItem("ecolehub_session");localStorage.setItem("ecolehub_version",APP_VERSION);}}catch{}})();

export default function App(){
  const savedSession=loadSession();
  if(savedSession?.type==="school"&&!savedSession?.data?.role) clearSession();

  const [step,setStep]=useState(savedSession?.type==="school"&&savedSession?.data?.role?7:1);
  const [school,setSchool]=useState(savedSession?.type==="school"&&savedSession?.data?.role?savedSession.data:{});
  const [isSuperAdmin,setIsSuperAdmin]=useState(savedSession?.type==="superadmin"||false);
  const [parentData,setParentData]=useState(savedSession?.type==="parent"?savedSession.data:null);

  const s1Login=(d,isLogin=false)=>{
    setSchool(d);
    if(isLogin){setStep(7);saveSession({type:"school",data:d});}
    else setStep(2);
  };
  const sL=d=>{setSchool(d);setStep(3);};
  const sA=d=>{setSchool(d);setStep(4);};
  const s2=d=>{setSchool(d);setStep(5);};
  const s3=d=>{setSchool(d);setStep(6);};
  const s4=d=>{saveSchool(d.code,d);setSchool(d);setStep(7);saveSession({type:"school",data:d});};

  const isDash=step===7;
  const logoutSchool=()=>{clearSession();setStep(1);setSchool({});};
  const handleSuperAdmin=()=>{setIsSuperAdmin(true);saveSession({type:"superadmin"});};
  const handleParent=(p)=>{setParentData(p);saveSession({type:"parent",data:p});};
  const logoutParent=()=>{clearSession();setParentData(null);};
  const logoutSuper=()=>{clearSession();setIsSuperAdmin(false);};

  if(isSuperAdmin) return(<><style>{CSS}</style><SuperAdminDashboard onLogout={logoutSuper}/></>);
  if(parentData)   return(<><style>{CSS}</style><ParentDashboard parentData={parentData} onLogout={logoutParent}/></>);

  return(<>
    <style>{CSS}</style>
    <div className="app-shell" style={isDash?{alignItems:"flex-start",padding:0}:{}}>
      {!isDash&&<><div className="bg-orb" style={{width:500,height:500,background:c.gold,top:-120,right:-160}}/><div className="bg-orb" style={{width:400,height:400,background:"#4ECDC4",bottom:-80,left:-100}}/></>}
      {step===1&&<Step1 onSuccess={s1Login} onSuperAdmin={handleSuperAdmin} onParent={handleParent}/>}
      {step===2&&<StepLieu data={school} onNext={sL} onBack={()=>setStep(1)}/>}
      {step===3&&<StepAdmin data={school} onNext={sA} onBack={()=>setStep(2)}/>}
      {step===4&&<Step2 data={school} onNext={s2} onBack={()=>setStep(3)}/>}
      {step===5&&<Step3 data={school} onNext={s3} onBack={()=>setStep(4)}/>}
      {step===6&&<Step4 data={school} onNext={s4} onBack={()=>setStep(5)}/>}
      {step===7&&<Dashboard data={school} onLogout={logoutSchool}/>}
    </div>
  </>);
}
