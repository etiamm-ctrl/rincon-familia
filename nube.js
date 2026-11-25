import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAnalytics, setUserId } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";

const app = initializeApp({
  apiKey: "AIzaSyDwgZT8n4WZSApSRG0DFPzppGafPuMxU58",
  authDomain: "rincondeaprender.firebaseapp.com",
  projectId: "rincondeaprender",
  storageBucket: "rincondeaprender.firebasestorage.app",
  messagingSenderId: "492421509509",
  appId: "1:492421509509:web:11cabf198c7f1131ef94ec",
  measurementId: "G-CQ9E6G35ES"
});
const auth = getAuth(app);

/* Analytics (si falla o está bloqueado, la app sigue funcionando igual) */
let analytics = null;
try { analytics = getAnalytics(app); } catch (e) { console.warn("analytics", e); }

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const LS = localStorage;
let user = null, pushing = false;

/* ---------- datos locales ---------- */
function snap() {
  const o = {};
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k.indexOf("nube_") === 0) continue;
    o[k] = LS.getItem(k);
  }
  return JSON.stringify(o);
}
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}
function clearLocal() {
  const ks = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k.indexOf("nube_") !== 0) ks.push(k);
  }
  ks.forEach(k => LS.removeItem(k));
}
function applyCloud(str) {
  clearLocal();
  const o = JSON.parse(str);
  Object.keys(o).forEach(k => { try { LS.setItem(k, o[k]); } catch (e) {} });
}
const ref = () => doc(db, "familias", user.uid, "datos", "estado");

/* ---------- subir a la nube ---------- */
async function push(force) {
  if (!user || pushing) return;
  const s = snap(), h = hash(s);
  if (!force && h === LS.getItem("nube_hash")) return;
  pushing = true;
  const free = setTimeout(() => { pushing = false; }, 15000);
  try {
    await setDoc(ref(), { data: s, updated: Date.now() });
    LS.setItem("nube_hash", h);
  } catch (e) { console.warn("nube push", e); }
  clearTimeout(free);
  pushing = false;
}

/* ---------- al entrar: bajar o subir ---------- */
async function sync() {
  const first = LS.getItem("nube_uid") !== user.uid;
  let cloud = null;
  try {
    const d = await getDoc(ref());
    if (d.exists()) cloud = d.data();
  } catch (e) { console.warn("nube get", e); if (first) return; }

  const dirty = hash(snap()) !== LS.getItem("nube_hash");
  if (cloud && (first || !dirty) && hash(cloud.data) !== hash(snap())) {
    applyCloud(cloud.data);
    LS.setItem("nube_uid", user.uid);
    LS.setItem("nube_hash", hash(cloud.data));
    if (!sessionStorage.getItem("nube_rl")) {
      sessionStorage.setItem("nube_rl", "1");
      location.reload();
      return;
    }
  } else {
    LS.setItem("nube_uid", user.uid);
    if (!cloud || dirty) await push(true);
    else LS.setItem("nube_hash", hash(snap()));
  }
  sessionStorage.removeItem("nube_rl");
}

/* ---------- pantalla de entrada ---------- */
const css = document.createElement("style");
css.textContent = `
#nube-ov{position:fixed;inset:0;z-index:300;background:var(--bg);color:var(--ink);display:none;overflow-y:auto;padding:20px 14px;box-sizing:border-box;font-family:"Trebuchet MS",system-ui,sans-serif}
#nube-ov.on{display:block}
#nube-ov .nc{max-width:420px;margin:0 auto;background:var(--card);border:2px solid var(--line);border-radius:28px;padding:24px 18px;text-align:center}
#nube-ov h1{margin:4px 0 2px;font-size:1.6rem}
#nube-ov p{margin:0 0 14px;color:var(--sub);font-size:.9rem}
#nube-ov input{font:inherit;font-size:1.1rem;width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;border:3px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink)}
#nube-ov button{font:inherit;font-weight:700;width:100%;margin-top:8px;padding:12px;border-radius:14px;border:2px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
#nube-ov .go{background:#1f9d6b;color:#fff;border:0;font-size:1.15rem;box-shadow:0 4px 0 rgba(0,0,0,.2)}
#nube-ov .lk{border:0;background:none;color:var(--c2);text-decoration:underline;font-weight:400}
#nube-msg{min-height:22px;margin:4px 0;font-weight:700;font-size:.9rem;color:#d9443b}
#nube-msg.ok{color:#1f9d6b}
`;
document.head.appendChild(css);

const ov = document.createElement("div");
ov.id = "nube-ov";
ov.innerHTML = `<div class="nc"><div style="font-size:3.2rem">🎒</div><h1>El rincón de aprender</h1>
<p>Entra con el correo de tu familia</p>
<input id="nube-em" type="email" autocomplete="email" placeholder="Correo electrónico">
<input id="nube-pw" type="password" autocomplete="current-password" placeholder="Contraseña (mínimo 6 caracteres)">
<div id="nube-msg"></div>
<button class="go" id="nube-in">Iniciar sesión</button>
<button id="nube-new">Crear cuenta</button>
<button class="lk" id="nube-fg">¿Has olvidado la contraseña?</button></div>`;
document.body.appendChild(ov);

const $ = id => document.getElementById(id);
function msg(t, ok) { const m = $("nube-msg"); m.textContent = t; m.className = ok ? "ok" : ""; }
function err(e) {
  const c = (e && e.code) || "";
  const t = {
    "auth/invalid-email": "El correo no es válido.",
    "auth/missing-password": "Escribe la contraseña.",
    "auth/weak-password": "La contraseña es muy corta (mínimo 6 caracteres).",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Pulsa «Iniciar sesión».",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera un poco e inténtalo de nuevo.",
    "auth/network-request-failed": "Sin conexión a internet."
  };
  msg(t[c] || "No se ha podido completar. Inténtalo de nuevo.");
}
function creds() {
  const e = $("nube-em").value.trim(), p = $("nube-pw").value;
  if (!e) { msg("Escribe el correo."); return null; }
  return [e, p];
}

/* Iniciar sesión: solo entra si el correo está verificado */
$("nube-in").onclick = async () => {
  const c = creds(); if (!c) return; msg("Entrando…", true);
  try {
    const cr = await signInWithEmailAndPassword(auth, c[0], c[1]);
    if (!cr.user.emailVerified) {
      try { await sendEmailVerification(cr.user); } catch (e) {}
      await signOut(auth);
      msg("Aún no has verificado tu correo. Te hemos reenviado el enlace: ábrelo y vuelve a entrar.", true);
    }
  } catch (e) { err(e); }
};

/* Crear cuenta: manda correo de verificación y cierra sesión */
$("nube-new").onclick = async () => {
  const c = creds(); if (!c) return; msg("Creando cuenta…", true);
  try {
    const cr = await createUserWithEmailAndPassword(auth, c[0], c[1]);
    await sendEmailVerification(cr.user);
    await signOut(auth);
    msg("¡Cuenta creada! Te hemos enviado un correo: pulsa el enlace para confirmar que eres tú (mira también en spam) y después inicia sesión.", true);
  } catch (e) { err(e); }
};

$("nube-fg").onclick = async () => {
  const c = $("nube-em").value.trim();
  if (!c) { msg("Escribe tu correo y pulsa de nuevo."); return; }
  try { await sendPasswordResetEmail(auth, c); msg("Te hemos enviado un correo para cambiar la contraseña.", true); } catch (e) { err(e); }
};
[$("nube-em"), $("nube-pw")].forEach(i => i.onkeydown = e => { if (e.key === "Enter") $("nube-in").click(); });

/* ---------- botón Cerrar sesión (menú de carpetas) ---------- */
const out = document.createElement("button");
out.className = "chg";
out.id = "nube-out";
out.textContent = "🚪 Cerrar sesión";
const fol = document.getElementById("folders");
if (fol) fol.appendChild(out);
out.onclick = async () => {
  await Promise.race([push(), new Promise(r => setTimeout(r, 5000))]);
  if (hash(snap()) !== LS.getItem("nube_hash") &&
      !confirm("Hay cambios que aún no se han subido a la nube (¿sin conexión?). Si cierras sesión se perderán. ¿Cerrar sesión igualmente?")) return;
  clearLocal();
  LS.removeItem("nube_uid"); LS.removeItem("nube_hash");
  try { await signOut(auth); } catch (e) {}
  location.reload();
};

/* ---------- estado de la sesión ---------- */
onAuthStateChanged(auth, async u => {
  user = (u && u.emailVerified) ? u : null;
  if (!user) { ov.classList.add("on"); out.style.display = "none"; return; }
  ov.classList.remove("on"); out.style.display = "";
  $("nube-pw").value = "";
  try { if (analytics) setUserId(analytics, user.uid); } catch (e) {}
  await sync();
});

/* ---------- sincronización automática ---------- */
setInterval(() => push(), 30000);
document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
window.addEventListener("online", () => push());
window.addEventListener("pagehide", () => push());
