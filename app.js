/* ═══════════════════════════════════════════════════════
   GEN-Z STORE — app.js (FIREBASE REALTIME DATABASE)
═══════════════════════════════════════════════════════ */

// ==========================================
// API KEYS & TOKENS (BLANK FOR NEW SETUP)
// ==========================================
const FIREBASE_SERVICE_ACCOUNT = {
  // Not needed for client-side JS anymore if you are using standard web SDK config in index.html
};

const QIKINK_CLIENT_ID = "";
const QIKINK_CLIENT_SECRET = "";

const TELEGRAM_BOT_TOKEN = ""; 
const TELEGRAM_CHAT_ID = "";

const FCM_VAPID_KEY = "";
const ONESIGNAL_APP_ID = "";

// ==========================================
// HELPER FUNCTIONS & GLOBAL VARIABLES
// ==========================================
const load = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
const save = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); };
const $ = (id) => { return document.getElementById(id); };
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const addClass = (id, cls) => { const el = $(id); if(el) el.classList.add(cls); };
const removeClass = (id, cls) => { const el = $(id); if(el) el.classList.remove(cls); };

const ADMIN_PIN = "9721";
const SUPER_ADMIN_PIN = "90793"; 
let superAdminTapCount = 0;
let superAdminTapTimer = null;

let mainCategories = [];
let products = [];
let shops = [];
let homeBanners = [];
let likes = load("knk_likes", []); 
let currentCheckoutItem = null;    
let activeMainCatId = null;
let activeShopId = null;
let editingProductId = null;
let editingShopId = null;
let searchQuery = "";
let currentDetailProduct = null;
let currentSelectedSize = null; 
let isAppInitialized = false;
let runtimeSkipped = false;
let activeAdminOrderTab = "Recent";
let bannerScrollInterval = null;

let currentTheme = load("knk_app_theme", "dark");
window.setAppTheme = function(t) {
    document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
    document.body.classList.remove('light-theme'); 
    if(t !== 'dark') document.body.classList.add('theme-' + t);
    currentTheme = t;
    save("knk_app_theme", t);
}
setAppTheme(currentTheme);

function getProfileKey() {
  const user = window.fbAuth ? window.fbAuth.currentUser : null;
  return user ? "knk_profile_pic_" + user.uid : "knk_profile_pic_guest";
}

const genId = () => { return "cat_" + Date.now() + Math.floor(Math.random() * 1000); };
const finalPrice = (p) => { return Math.round(p.price - (p.price * (p.discount || 0)) / 100 + (p.extra || 0)); };
const getCat = (id) => { return mainCategories.find((c) => c.id === id); };

const lockScroll = () => { document.body.classList.add("no-scroll"); };
const unlockScroll = () => { document.body.classList.remove("no-scroll"); };
const allowZoom = () => { document.querySelector('meta[name="viewport"]').setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=5.0"); };
const preventZoom = () => { document.querySelector('meta[name="viewport"]').setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"); };

function pushModalState() { history.pushState({ modal: true }, "", window.location.href); }
window.addEventListener('popstate', (e) => {
  if ($("imageViewer") && !$("imageViewer").classList.contains("hidden")) {
    $("imageViewer").classList.add("hidden"); preventZoom();
  } else if ($("checkoutOverlay") && !$("checkoutOverlay").classList.contains("hidden")) {
    if($("closeCheckout")) $("closeCheckout").click();
  } else if ($("prodDetail") && !$("prodDetail").classList.contains("hidden")) {
    closeProductDetail();
  } else if ($("myOrderDetailModal") && !$("myOrderDetailModal").classList.contains("hidden")) {
    $("myOrderDetailModal").classList.add("hidden"); unlockScroll();
  } else if ($("adminPin") && !$("adminPin").classList.contains("hidden")) {
    $("adminPin").classList.add("hidden");
  } else if ($("superAdminPinModal") && !$("superAdminPinModal").classList.contains("hidden")) {
    $("superAdminPinModal").classList.add("hidden");
  }
});

function requireLogin(callback) {
  if (window.fbAuth && window.fbAuth.currentUser) { callback(); } 
  else {
    alert("Order aage badhane ke liye kripya Login ya Register karein!");
    runtimeSkipped = false;
    $("app").classList.add("hidden"); $("prodDetail").classList.add("hidden"); $("authScreen").classList.remove("hidden");
  }
}

// ==========================================
// FIREBASE REALTIME DATABASE SYNC (LIVE DATA)
// ==========================================
function initRealtimeDatabase() {
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.warn("Firebase Realtime Database is not loaded! Make sure you included the correct script in index.html.");
        return;
    }
    const db = firebase.database();

    // Live Sync Categories
    db.ref('categories').on('value', (snapshot) => {
        mainCategories = snapshot.val() || [];
        renderMainCats();
        if (!$("adminPanel").classList.contains("hidden")) renderAdmin();
    });

    // Live Sync Banners
    db.ref('banners').on('value', (snapshot) => {
        homeBanners = snapshot.val() || [];
        renderHomeBanners();
        if (!$("adminPanel").classList.contains("hidden")) renderAdmin();
    });

    // Live Sync Shops
    db.ref('shops').on('value', (snapshot) => {
        const data = snapshot.val();
        shops = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        renderShopsPage();
        if (!$("adminPanel").classList.contains("hidden")) renderAdmin();
    });

    // Live Sync Products
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        products = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        renderProducts();
        if (!$("adminPanel").classList.contains("hidden")) renderAdmin();
    });

    // Live Sync Orders
    db.ref('orders').on('value', (snapshot) => {
        const data = snapshot.val();
        window.allFirebaseOrders = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        if ($("adminPanel") && !$("adminPanel").classList.contains("hidden")) {
            window.renderAdminOrders(window.allFirebaseOrders);
        }
        if ($("orderPage") && !$("orderPage").classList.contains("hidden")) {
            window.renderMyOrders();
        }
    });
}

// ==========================================
// APP INITIALIZATION
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  // Initialize Realtime DB Sync
  initRealtimeDatabase();

  if (window.onAuthStateChanged && window.fbAuth) {
    window.onAuthStateChanged(window.fbAuth, (user) => {
      if (user) {
        $("authScreen").classList.add("hidden");
        if (!isAppInitialized) { showSplashAndStart(); isAppInitialized = true; } 
        else { 
            $("app").classList.remove("hidden"); 
            renderProfile(); 
        }
      } else {
        if (!runtimeSkipped) { $("authScreen").classList.remove("hidden"); $("app").classList.add("hidden"); $("splash").classList.add("hidden"); }
      }
      if ($("orderPage") && !$("orderPage").classList.contains("hidden")) window.renderMyOrders();
    });
  }

  // Add Category (Admin)
  if ($("addCatBtn")) {
      $("addCatBtn").onclick = () => {
          if (!firebase || !firebase.database) return alert("Database connection error");
          const n = $("newCatName").value.trim().toUpperCase();
          const shopSel = $("newCatShop"); const sId = shopSel ? shopSel.value : "GLOBAL";
          if (!n) return alert("Category ka naam daalein!");
          
          mainCategories.push({ id: genId(), name: n, shopId: sId });
          firebase.database().ref('categories').set(mainCategories); // Sync to DB
          
          $("newCatName").value = ""; 
      };
  }

  // Admin Order Tabs
  document.querySelectorAll("#adminOrderTabs .admin-tab").forEach(btn => {
      btn.addEventListener("click", (e) => {
          document.querySelectorAll("#adminOrderTabs .admin-tab").forEach(b => b.classList.remove("active"));
          e.target.classList.add("active");
          activeAdminOrderTab = e.target.getAttribute("data-tab");
          if(window.allFirebaseOrders) window.renderAdminOrders(window.allFirebaseOrders);
      });
  });

  // Secret Admin Pin Entry
  if ($("tabProdsBtn")) {
      $("tabProdsBtn").addEventListener("click", (e) => {
          superAdminTapCount++;
          if (superAdminTapTimer) clearTimeout(superAdminTapTimer);
          if (superAdminTapCount >= 10) { superAdminTapCount = 0; pushModalState(); openSuperAdminPin(); return; }
          superAdminTapTimer = setTimeout(() => { superAdminTapCount = 0; }, 3000);
      });
  }
});

window.switchAdminTab = function(event, tabId) {
    document.querySelectorAll('.am-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    event.target.classList.add('active');
    $(tabId).classList.remove('hidden');
}

// ==========================================
// UI / UX LOGIC
// ==========================================
async function showSplashAndStart() {
  const splash = $("splash"); 
  if(!splash) return;
  splash.classList.remove("hidden");
  splash.style.opacity = "1";

  const box = $("particles");
  if (box && box.children.length === 0) {
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const sz = (2 + Math.random() * 3).toFixed(1) + 'px';
      p.style.cssText = [
        'left:'   + (Math.random() * 100).toFixed(1) + '%',
        'bottom:' + (Math.random() * 8).toFixed(1)   + '%',
        'width:'  + sz,
        'height:' + sz,
        'animation-duration:' + (2 + Math.random() * 3).toFixed(2) + 's',
        'animation-delay:'    + (Math.random() * 3).toFixed(2)     + 's',
      ].join(';');
      box.appendChild(p);
    }
  }

  const audio = $("bg-audio");
  if (audio) audio.play().catch(() => {});

  await delay(100); addClass('coin-scene', 'appear');
  await delay(200); addClass('coin-scene', 'spinning');
  await delay(800); removeClass('coin-scene', 'spinning'); addClass('coin-scene', 'stopping');
  await delay(300); addClass('flash', 'pop'); addClass('s1', 'fire'); addClass('s2', 'fire'); addClass('s3', 'fire');
  await delay(60); addClass('wave1', 'blast'); addClass('wave2', 'blast'); addClass('logo-glow', 'on');
  await delay(200); removeClass('coin-scene', 'stopping');
  await delay(300); addClass('coin-scene', 'move-up');
  await delay(150); addClass('welcome', 'show'); addClass('welcome-line', 'show');
  await delay(1000); addClass('welcome', 'hide'); removeClass('welcome-line', 'show');
  await delay(400); removeClass('welcome', 'show');
  if($('welcome')) $('welcome').style.display = 'none';
  if($('welcome-line')) $('welcome-line').style.display = 'none';
  await delay(100); addClass('shield-glow', 'show'); addClass('trusted', 'show');
  await delay(1000); addClass('outro-overlay', 'show'); addClass('trusted', 'hide'); removeClass('shield-glow', 'show');
  await delay(600); addClass('outro-overlay', 'fadeout');
  await delay(400);

  splash.style.transition = "opacity 0.4s ease"; 
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.classList.add("hidden"); 
    $("app").classList.remove("hidden"); 
    renderLikesCount(); 
    initBannerAutoScroll();
  }, 400);
}

if ($("skipLoginBtn")) { $("skipLoginBtn").onclick = () => { runtimeSkipped = true; $("authScreen").classList.add("hidden"); showSplashAndStart(); }; }

if ($("authSubmitBtn")) {
  $("authSubmitBtn").onclick = async () => {
    const mob = $("authMobile").value.trim(); const pwd = $("authPassword").value.trim();
    if (!mob || mob.length !== 10 || !/^[6-9]\d{9}$/.test(mob)) return alert("Kripya sahi 10-digit mobile number dalein!");
    if (!pwd || pwd.length < 6) return alert("Password kam se kam 6 characters ka hona chahiye!");
    const fakeEmail = mob + "@genzstore.com"; const btn = $("authSubmitBtn"); const originalText = btn.textContent;
    btn.textContent = "Please wait..."; btn.disabled = true;
    try { await window.signInWithEmailAndPassword(window.fbAuth, fakeEmail, pwd); } 
    catch (err) {
      try { await window.createUserWithEmailAndPassword(window.fbAuth, fakeEmail, pwd); } 
      catch (regErr) {
        if (regErr.code === 'auth/email-already-in-use') alert("Galat Password! Kripya is number ka sahi password dalein."); else alert("Error: " + regErr.message);
      }
    } finally { if ($("authSubmitBtn")) { $("authSubmitBtn").textContent = originalText; $("authSubmitBtn").disabled = false; } }
  };
}

if ($("authMobile")) { $("authMobile").oninput = function () { this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10); }; }
if ($("googleLoginBtn")) { $("googleLoginBtn").onclick = () => { const provider = new window.GoogleAuthProvider(); window.signInWithPopup(window.fbAuth, provider).catch((error) => { alert("Login failed: " + error.message); }); }; }
if ($("profileLogoutBtn")) { $("profileLogoutBtn").onclick = () => { if (confirm("Are you sure you want to logout?")) { runtimeSkipped = false; window.signOut(window.fbAuth).then(() => { window.location.reload(); }); } }; }

window.switchNav = function (tab) {
  document.querySelectorAll('.nav-item').forEach((el) => { el.classList.remove('active'); });
  if ($("nav" + tab)) $("nav" + tab).classList.add("active"); else if (tab === 'Contact' || tab === 'ReturnPolicy' || tab === 'HowToReturn' || tab === 'PrivacyPolicy') $("navProfile").classList.add("active"); 
  if (tab === 'Order') $("navOrderWrap").classList.add("active"); else $("navOrderWrap").classList.remove("active");

  ["homeContent", "newPage", "shopsPage", "contactPage", "orderPage", "likesPage", "profilePage", "returnPolicyPage", "howToReturnPage", "privacyPolicyPage"].forEach(id => {
      if($(id)) $(id).classList.add("hidden");
  });

  if (tab === 'Home') { $("homeContent").classList.remove("hidden"); initBannerAutoScroll(); renderMainCats(); renderProducts(); }
  if (tab === 'New') { $("newPage").classList.remove("hidden"); renderNewCollection(); }
  if (tab === 'Shops') { if($("shopsPage")) $("shopsPage").classList.remove("hidden"); }
  if (tab === 'Contact') { $("contactPage").classList.remove("hidden"); }
  if (tab === 'ReturnPolicy') { $("returnPolicyPage").classList.remove("hidden"); }
  if (tab === 'HowToReturn') { $("howToReturnPage").classList.remove("hidden"); }
  if (tab === 'PrivacyPolicy') { $("privacyPolicyPage").classList.remove("hidden"); }
  if (tab === 'Order') { $("orderPage").classList.remove("hidden"); window.renderMyOrders(); }
  if (tab === 'Likes') { $("likesPage").classList.remove("hidden"); renderLikesPageTab(); }
  if (tab === 'Profile') { $("profilePage").classList.remove("hidden"); renderProfile(); }
  window.scrollTo(0, 0);
};

window.clearShopFilterAndGoHome = function() {
    activeShopId = null; activeMainCatId = null; searchQuery = "";
    if($("searchInput")) $("searchInput").value = "";
    switchNav('Home'); 
}

function renderHomeBanners() {
    const wrap = $("homeBannersWrap"); const slider = $("homeBannersSlider");
    if(!wrap || !slider) return;
    if (homeBanners.length === 0) { wrap.classList.add("hidden"); return; }
    
    wrap.classList.remove("hidden"); slider.innerHTML = "";
    homeBanners.forEach(b => {
        const div = document.createElement("div"); div.className = "banner-slide";
        div.innerHTML = `<img src="${b.image}" alt="Banner" loading="lazy" />`;
        if (b.link) div.onclick = () => window.open(b.link, '_blank');
        slider.appendChild(div);
    });
    initBannerAutoScroll();
}

function initBannerAutoScroll() {
    clearInterval(bannerScrollInterval); const slider = $("homeBannersSlider");
    if(!slider || homeBanners.length <= 1) return;
    bannerScrollInterval = setInterval(() => {
        const scrollAmt = slider.offsetWidth;
        if (slider.scrollLeft + scrollAmt >= slider.scrollWidth - 10) { slider.scrollTo({ left: 0, behavior: 'smooth' }); } 
        else { slider.scrollBy({ left: scrollAmt, behavior: 'smooth' }); }
    }, 3000);
}

function renderShopsGrid() {
    const grid = $("shopsGrid"); const cityFilterEl = $("shopCityFilter"); const typeFilterEl = $("shopTypeFilter");
    if(!grid || !cityFilterEl || !typeFilterEl) return;
    grid.innerHTML = ""; const cityVal = cityFilterEl.value; const typeVal = typeFilterEl.value; let list = shops;
    
    if(cityVal !== "ALL") list = list.filter(s => s.city === cityVal);
    if(typeVal !== "ALL") list = list.filter(s => s.type === typeVal);
    
    if(list.length === 0) { grid.innerHTML = "<p class='empty' style='grid-column:1/-1;'>No shops found for this selection.</p>"; return; }

    list.forEach(s => {
        const div = document.createElement("div"); div.className = "shop-card";
        div.innerHTML = `<img src="${s.logo || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png'}" alt="${s.name}" loading="lazy"><h3>${s.name}</h3>`;
        div.onclick = () => {
            activeShopId = s.id; activeMainCatId = null;
            switchNav('Home'); renderMainCats(); renderProducts();
        };
        grid.appendChild(div);
    });
}

function renderShopsPage() {
    const cityFilterEl = $("shopCityFilter"); const typeFilterEl = $("shopTypeFilter");
    if(!cityFilterEl || !typeFilterEl) return;
    
    const currentCity = cityFilterEl.value || "ALL"; const currentType = typeFilterEl.value || "ALL";
    const uniqueCities = [...new Set(shops.map(s => s.city).filter(Boolean))]; const uniqueTypes = [...new Set(shops.map(s => s.type).filter(Boolean))];
    
    cityFilterEl.innerHTML = '<option value="ALL">All Cities</option>';
    uniqueCities.forEach(c => { const opt = document.createElement("option"); opt.value = c; opt.textContent = c; if(c === currentCity) opt.selected = true; cityFilterEl.appendChild(opt); });
    
    typeFilterEl.innerHTML = '<option value="ALL">All Types</option>';
    uniqueTypes.forEach(t => { const opt = document.createElement("option"); opt.value = t; opt.textContent = t; if(t === currentType) opt.selected = true; typeFilterEl.appendChild(opt); });
    
    cityFilterEl.onchange = () => { renderShopsGrid(); }; typeFilterEl.onchange = () => { renderShopsGrid(); };
    renderShopsGrid();
}

window.renderMyOrders = function() {
  const list = $("myOrdersList"); const user = window.fbAuth ? window.fbAuth.currentUser : null;
  const userEmail = user ? user.email : "guest"; const userMobile = userEmail.replace("@genzstore.com", "");
  let displayOrders = [];
  if (window.allFirebaseOrders && window.allFirebaseOrders.length > 0) { displayOrders = window.allFirebaseOrders.filter(o => o.userEmail === userEmail || o.mobile === userMobile); } 
  else { displayOrders = load("knk_my_orders_" + userEmail, []); }
  
  if (!displayOrders || displayOrders.length === 0) { list.innerHTML = `<div style="text-align:center; padding:40px 10px; color:var(--muted); font-size:13px;">Aapne abhi tak koi order place nahi kiya hai.</div>`; return; }

  let html = "";
  displayOrders.forEach((o) => {
    const dateStr = o.timestamp && o.timestamp.seconds ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : new Date(o.savedAt || Date.now()).toLocaleDateString();
    let thumb = "placeholder.jpg";
    if (o.items && o.items.length > 0) { const pImg = o.items[0].product.image; thumb = Array.isArray(pImg) ? pImg[0] : pImg; }
    let statusDisplay = o.status || 'Recent';

    html += `
    <div class="mo-card" onclick="pushModalState(); openMyOrderModal('${o.id || o.savedAt}')">
      <div class="mo-head">
        <span style="font-weight:700; color:var(--primary); font-size:15px;">₹${o.totalAmount}</span>
        <span class="mo-status">${statusDisplay}</span>
      </div>
      <div class="mo-body" style="display:flex; gap:12px; align-items:center;">
         <img src="${thumb}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">
         <div style="flex:1;">
           <strong style="color:var(--fg); font-size:13px;">Date: ${dateStr}</strong><br>
           <span style="color:var(--primary); font-size:12px; font-weight:600;">${o.items.length} Item(s) • Tap to view details</span>
         </div>
      </div>
    </div>`;
  });
  list.innerHTML = html;
}

window.openMyOrderModal = function (idStr) {
  let allSrc = window.allFirebaseOrders || []; const userEmail = window.fbAuth && window.fbAuth.currentUser ? window.fbAuth.currentUser.email : "guest";
  if(allSrc.length === 0) allSrc = load("knk_my_orders_" + userEmail, []);
  const o = allSrc.find((x) => (x.id && x.id === idStr) || (x.savedAt && x.savedAt.toString() === idStr.toString()));
  if (!o) return;

  let itemsHtml = o.items.map((i) => {
    const img = Array.isArray(i.product.image) ? i.product.image[0] : i.product.image;
    const actual = i.product.price * i.qty; const finalP = finalPrice(i.product) * i.qty;
    const sizeDisplay = i.size && i.size !== "Default" ? `<div style="font-size:11px; color:var(--primary); font-weight:700;">Size: ${i.size}</div>` : '';
    return `
    <div style="display:flex; gap:10px; margin-bottom:12px; border-bottom:1px solid var(--border2); padding-bottom:12px;">
       <img src="${img}" style="width:60px; height:60px; border-radius:8px; object-fit:cover;">
       <div>
          <div style="font-weight:600; font-size:13px; color:var(--fg);">${i.product.name}</div>
          <div style="font-size:12px; color:var(--muted2);">Qty: ${i.qty} Unit(s)</div>
          ${sizeDisplay}
          <div style="font-size:13px; margin-top:4px;">
            <span style="text-decoration:line-through; color:var(--muted); font-size:11px;">₹${actual}</span>
            <strong style="color:var(--primary); margin-left:6px;">₹${finalP}</strong>
          </div>
       </div>
    </div>`;
  }).join("");

  const dateStr = o.timestamp && o.timestamp.seconds ? new Date(o.timestamp.seconds * 1000).toLocaleString() : new Date(o.savedAt || Date.now()).toLocaleString();
  const payMode = o.paymentMethod === "COD" ? "Cash on Delivery" : "Prepaid Online";

  $("myOrderDetailBody").innerHTML = `
    <div style="margin-bottom:15px; background:var(--bg2); padding:12px; border-radius:10px; border:1px solid var(--border);">
       <div style="color:var(--primary); font-weight:700; margin-bottom:6px; font-size:14px;">Order Status: ${o.status || 'Recent'}</div>
       <div style="font-size:12px; color:var(--muted2);">Order Date: ${dateStr}</div>
       <div style="font-size:12px; color:var(--muted2); margin-top:4px;">Payment: ${payMode}</div>
    </div>
    <h3 style="font-size:14px; margin-bottom:10px; color:var(--fg); font-family:var(--font-body); font-weight:600;">Items Details</h3>
    ${itemsHtml}
    <h3 style="font-size:14px; margin:15px 0 10px; color:var(--fg); font-family:var(--font-body); font-weight:600;">Delivery Address</h3>
    <div style="font-size:13px; color:var(--muted); line-height:1.5; background:var(--bg2); padding:10px; border-radius:8px;">
       <strong style="color:var(--fg);">${o.name}</strong> (${o.mobile})<br>
       ${o.address}<br>
       ${o.landmark ? o.landmark + '<br>' : ''}
       ${o.state} - ${o.pincode}
    </div>
    <div style="margin-top:20px; border-top:1px dashed var(--border); padding-top:15px;">
       <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px;"><span>Paid Online:</span> <span>₹${o.amountPaid}</span></div>
       <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px;"><span>Balance Due (COD):</span> <span style="color:var(--destructive);">₹${o.balanceDue}</span></div>
       <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:16px; font-weight:700; color:var(--primary);"><span>Total Amount:</span> <span>₹${o.totalAmount}</span></div>
    </div>
  `;
  $("myOrderDetailModal").classList.remove("hidden"); lockScroll();
};

window.toggleLike = function(pid) {
    const p = products.find(x => x.id === pid);
    if(!p) return;
    const idx = likes.findIndex(l => l.id === pid);
    if(idx > -1) { likes.splice(idx, 1); } 
    else { likes.push(p); }
    save("knk_likes", likes);
    renderLikesCount();
    renderProducts(); 
    if($("newPage") && !$("newPage").classList.contains("hidden")) renderNewCollection();
    if($("likesPage") && !$("likesPage").classList.contains("hidden")) renderLikesPageTab();
}

function renderLikesCount() {
  const b = $("navLikesCount");
  if (b) { b.textContent = likes.length; b.classList.toggle("hidden", likes.length === 0); }
}

function renderLikesPageTab() {
  const body = $("likesPageItems");
  if(!body) return;
  if (!likes.length) { body.innerHTML = '<p class="empty" style="padding:40px 0;">Aapne abhi tak koi product Like nahi kiya hai.</p>'; return; }
  body.innerHTML = "";
  likes.forEach((p) => {
    const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : "placeholder.jpg";
    const el = document.createElement("div"); 
    el.className = "cart-item"; 
    el.style.cursor = "pointer";
    el.innerHTML = `
      <img src="${mainImg}" alt="${p.name}" />
      <div class="ci-info"><div class="ci-name">${p.name}</div><div class="ci-sub">₹${finalPrice(p)}</div></div>
      <button class="trash" style="font-size: 20px;" onclick="event.stopPropagation(); toggleLike('${p.id}')">❌</button>
    `;
    el.onclick = () => { openProductDetail(p); }; 
    body.appendChild(el);
  });
}

function renderProfile() {
  const user = window.fbAuth ? window.fbAuth.currentUser : null;
  const displayObj = $("profileDisplayId"); const nameObj = $("profileDisplayName"); const imgObj = $("profileImg");
  const savedPic = localStorage.getItem(getProfileKey());

  if (user) {
    let email = user.email || ""; displayObj.textContent = email.includes("@genzstore.com") ? "+91 " + email.replace("@genzstore.com", "") : email;
    nameObj.textContent = user.displayName || "Elite Member"; imgObj.src = savedPic ? savedPic : (user.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png");
  } else {
    displayObj.textContent = "Guest Access"; nameObj.textContent = "Welcome Guest"; imgObj.src = savedPic ? savedPic : "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png";
  }

  if (imgObj && !imgObj.dataset.listenerAttached) {
    imgObj.dataset.listenerAttached = "true"; let profileTapCount = 0; let profileTapTimer = null;
    imgObj.addEventListener("click", (e) => {
      e.stopPropagation(); profileTapCount++;
      if (profileTapTimer) clearTimeout(profileTapTimer);
      if (profileTapCount >= 10) { profileTapCount = 0; pushModalState(); openPin(); return; }
      profileTapTimer = setTimeout(() => { profileTapCount = 0; }, 3000);
    });
  }
}

if ($("editProfileBtn")) {
  $("editProfileBtn").onclick = async () => {
    const user = window.fbAuth ? window.fbAuth.currentUser : null; if (!user) return alert("Please login to edit profile!");
    const newName = prompt("Enter your Name:", user.displayName || "");
    if (newName !== null && newName.trim() !== "") {
      const btn = $("editProfileBtn"); const originalHtml = btn.innerHTML; btn.textContent = "Saving..."; btn.disabled = true;
      await window.updateProfile(user, { displayName: newName.trim() });
      btn.innerHTML = originalHtml; btn.disabled = false; renderProfile();
    }
  };
}

if ($("profilePicInput")) {
  $("profilePicInput").onchange = function (e) {
    const file = e.target.files[0]; if (!file) return;
    $("profileImg").style.opacity = "0.5"; const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas"); let width = img.width; let height = img.height; const MAX_SIZE = 250;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        try { localStorage.setItem(getProfileKey(), dataUrl); $("profileImg").src = dataUrl; $("profileImg").style.opacity = "1";
          const user = window.fbAuth ? window.fbAuth.currentUser : null;
          if (user && !user.email.includes("@genzstore.com")) window.updateProfile(user, { photoURL: dataUrl });
        } catch (err) { alert("Quota full!"); $("profileImg").style.opacity = "1"; }
      }; img.src = event.target.result;
    }; reader.readAsDataURL(file);
  };
}

$("logoBtn").onclick = () => { clearShopFilterAndGoHome(); };

function renderMainCats() {
  const wrapDiv = $("mainCatsWrap"); const wrap = $("mainCats"); 
  if(!wrapDiv || !wrap) return;
  wrap.innerHTML = "";
  
  let visibleCats = mainCategories;
  if(visibleCats.length === 0) { wrapDiv.classList.add("hidden"); return; }
  
  wrapDiv.classList.remove("hidden");
  visibleCats.forEach((cat, i) => {
    const btn = document.createElement("button");
    btn.className = "main-cat-btn" + (cat.id === activeMainCatId && !searchQuery ? " active" : "");
    btn.style.animationDelay = (i * 0.07) + "s"; btn.style.animation = "fadeUp 0.4s ease both";
    btn.innerHTML = `<span class="mc-label">${cat.name}</span>`;
    btn.onclick = () => selectMainCat(cat.id);
    wrap.appendChild(btn);
  });
}

window.selectMainCat = function (id) {
  if (searchQuery) { searchQuery = ""; $("searchInput").value = ""; $("searchClear").classList.add("hidden"); }
  if (activeMainCatId === id) activeMainCatId = null; else activeMainCatId = id; 
  renderMainCats(); renderProducts();
};

function searchMatches(p, q) {
  if (!q) return false; const cat = getCat(p.mainCategoryId); const haystack = [p.name || "", cat ? cat.name : ""].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => haystack.includes(w));
}

let searchDebounce = null;
$("searchInput").addEventListener("input", function () {
  const v = this.value.trim(); $("searchClear").classList.toggle("hidden", !v);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { searchQuery = v; renderMainCats(); renderProducts(); }, 120);
});

$("searchClear").addEventListener("click", () => {
  $("searchInput").value = ""; $("searchClear").classList.add("hidden"); searchQuery = "";
  renderMainCats(); renderProducts(); $("searchInput").focus();
});

function renderProducts() {
  const title = $("activeTitle"); let list = products;

  if (searchQuery) {
    list = list.filter((p) => searchMatches(p, searchQuery));
    title.innerHTML = `Search: "<span style="color:var(--primary)">${searchQuery}</span>" <span class="search-count">${list.length} results</span>`;
  } else {
      if (activeMainCatId) {
          const cat = getCat(activeMainCatId);
          title.textContent = cat ? cat.name : "PREMIUM COLLECTIONS";
          list = list.filter(p => p.mainCategoryId === activeMainCatId);
      } else {
          title.textContent = "ALL PREMIUM COLLECTIONS";
      }
      if (activeShopId) list = list.filter(p => p.shopId === activeShopId);
  }

  if (activeShopId) $("activeShopBanner").classList.add("hidden"); else $("activeShopBanner").classList.add("hidden");

  const grid = $("products");
  if (list.length === 0) { grid.innerHTML = searchQuery ? `<p class="empty">Koi product nahi mila.</p>` : `<p class="empty">Loading products...</p>`; return; }
  grid.innerHTML = "";

  if(!activeShopId && !searchQuery) { list = [...list].sort(() => Math.random() - 0.5); }

  list.forEach((p, i) => {
    const price = finalPrice(p); const inStock = p.inStock !== false; const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : "placeholder.jpg";
    const isLiked = likes.some(l => l.id === p.id);
    const freeDel = p.freeDelivery !== false ? '<div style="color:#388e3c; font-size:10px; font-weight:800; letter-spacing:0.05em; margin-top:3px; text-transform:uppercase;">FREE Delivery</div>' : '';

    const el = document.createElement("div"); el.className = "product"; el.style.animationDelay = (i * 0.05) + "s";
    el.innerHTML = `
      <div style="position:relative;">
          <img src="${mainImg}" alt="${p.name}" loading="lazy" />
          <button class="like-btn-grid" onclick="event.stopPropagation(); toggleLike('${p.id}')" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:30px; height:30px; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.3); z-index:5; cursor:pointer;">
              ${isLiked ? '❤️' : '🤍'}
          </button>
      </div>
      <div class="info">
        <div class="name">${p.name}</div>
        <div class="price-row"><span class="price">₹${price}</span>${p.discount > 0 ? `<span class="strike">₹${p.price}</span>` : ""}</div>
        ${freeDel}
        <span class="stock-badge ${inStock ? 'in' : 'out'}">${inStock ? '● In Stock' : '● Out of Stock'}</span>
        <div class="btn-row">
          <button class="btn-primary btn-buy-grid full" ${!inStock ? 'disabled' : ''} style="grid-column: 1 / -1;">💳 Buy Now</button>
        </div>
      </div>
    `;
    el.querySelector("img").onclick = () => openProductDetail(p); el.querySelector(".name").onclick = () => openProductDetail(p);
    if (inStock) { el.querySelector(".btn-buy-grid").onclick = (e) => { e.stopPropagation(); openProductDetail(p); }; }
    grid.appendChild(el);
  });
}

function renderNewCollection() {
    const list = $("newCollectionList");
    if(!list) return;
    list.innerHTML = "";
    if(products.length === 0) { list.innerHTML = "<p class='empty'>No new collection yet.</p>"; return; }

    const sorted = [...products].reverse(); 
    sorted.forEach(p => {
        const price = finalPrice(p);
        const inStock = p.inStock !== false;
        const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : "placeholder.jpg";
        const freeDel = p.freeDelivery !== false ? '<div style="color:#388e3c; font-size:12px; font-weight:800; letter-spacing:0.05em; margin-top:5px; text-transform:uppercase;">FREE Delivery</div>' : '';
        const isLiked = likes.some(l => l.id === p.id);

        const el = document.createElement("div");
        el.style.cssText = "background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; position: relative; animation: fadeUp 0.4s ease both;";
        el.innerHTML = `
          <div style="position:relative;">
            <img src="${mainImg}" style="width: 100%; height: 380px; object-fit: cover; display: block; background: var(--card2);" />
            <button onclick="event.stopPropagation(); toggleLike('${p.id}')" style="position:absolute; top:12px; right:12px; background:rgba(255,255,255,0.9); border:none; border-radius:50%; width:40px; height:40px; font-size:20px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.3); z-index: 5; cursor:pointer;">
              ${isLiked ? '❤️' : '🤍'}
            </button>
            <span class="stock-badge ${inStock ? 'in' : 'out'}" style="position:absolute; bottom:12px; left:12px; font-size:12px; padding: 4px 12px;">${inStock ? '● In Stock' : '● Out of Stock'}</span>
          </div>
          <div style="padding: 16px;">
             <h3 style="font-size:17px; color:var(--fg); margin-bottom:8px; font-family:var(--font-body); font-weight:600;">${p.name}</h3>
             <div style="display:flex; align-items:baseline; gap:8px;">
                <span style="font-size:22px; font-weight:700; color:var(--primary);">₹${price}</span>
                ${p.discount > 0 ? `<span style="font-size:15px; text-decoration:line-through; color:var(--muted);">₹${p.price}</span>` : ''}
             </div>
             ${freeDel}
             <button class="btn-primary full" style="margin-top:14px; padding:12px; font-size:15px;" ${!inStock ? 'disabled' : ''}>💳 Buy Now</button>
          </div>
        `;
        el.onclick = () => openProductDetail(p);
        if(inStock) el.querySelector(".btn-primary").onclick = (e) => { e.stopPropagation(); openProductDetail(p); };
        list.appendChild(el);
    });
}

window.openProductDetailById = function(id) {
    const p = products.find(x => x.id === id);
    if(p) { 
        if (!$("prodDetail").classList.contains("hidden")) {
            closeProductDetail(); 
            setTimeout(() => openProductDetail(p), 300); 
        } else {
            openProductDetail(p);
        }
    }
}

function openProductDetail(p) {
  pushModalState();
  lockScroll(); currentDetailProduct = p; currentSelectedSize = null;
  const price = finalPrice(p); const inStock = p.inStock !== false; const cat = getCat(p.mainCategoryId);
  const slider = $("pdImageSlider"); const dotsWrap = $("pdImageDots");
  slider.innerHTML = ""; dotsWrap.innerHTML = "";
  let images = Array.isArray(p.image) ? p.image : [p.image]; if (images.length === 0) images = ["placeholder.jpg"];

  images.forEach((imgUrl, i) => {
    const imgEl = document.createElement("img"); imgEl.src = imgUrl;
    imgEl.onclick = () => { pushModalState(); $("fullImage").src = imgUrl; $("imageViewer").classList.remove("hidden"); allowZoom(); };
    slider.appendChild(imgEl);
    if (images.length > 1) { const dot = document.createElement("div"); dot.className = "dot" + (i === 0 ? " active" : ""); dotsWrap.appendChild(dot); }
  });

  if (images.length > 1) {
    slider.onscroll = () => {
      const idx = Math.round(slider.scrollLeft / slider.offsetWidth);
      Array.from(dotsWrap.children).forEach((dot, i) => { dot.className = "dot" + (i === idx ? " active" : ""); });
    };
  }

  const badge = $("pdStockBadge"); badge.textContent = inStock ? "● In Stock" : "● Out of Stock"; badge.className = "stock-badge pd-img-stock " + (inStock ? "in" : "out");
  $("pdBreadcrumb").textContent = (cat ? cat.name : ""); $("pdName").textContent = p.name; $("pdPrice").textContent = "₹" + price;

  const freeDelObj = p.freeDelivery !== false ? '<div style="color:#388e3c; font-size:12px; font-weight:800; letter-spacing:0.05em; margin-top:8px; text-transform:uppercase;">FREE Delivery</div>' : '';
  
  if (p.discount > 0) { $("pdStrike").textContent = "₹" + p.price; $("pdStrike").classList.remove("hidden"); $("pdOff").textContent = p.discount + "% off"; $("pdOff").classList.remove("hidden"); } 
  else { $("pdStrike").classList.add("hidden"); $("pdOff").classList.add("hidden"); }
  
  const existFreeDel = document.getElementById("pdFreeDelText");
  if(existFreeDel) existFreeDel.remove();
  if(p.freeDelivery !== false) {
      const d = document.createElement('div'); d.id = "pdFreeDelText"; d.innerHTML = freeDelObj;
      $("pdName").parentNode.insertBefore(d, $("pdColorsWrap"));
  }

  if(p.groupId) {
      const variants = products.filter(x => x.groupId === p.groupId);
      if(variants.length > 1) {
          let html = '<div class="field-label" style="margin-bottom:8px; font-size:13px; font-weight:600; color:var(--fg);">Colours</div><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px; scrollbar-width:none;">';
          variants.forEach(v => {
              const vImg = (Array.isArray(v.image) && v.image.length > 0) ? v.image[0] : "placeholder.jpg";
              const isActive = v.id === p.id ? 'border: 2px solid var(--primary); transform: scale(1.05);' : 'border: 1px solid var(--border); opacity: 0.7;';
              html += `<div onclick="openProductDetailById('${v.id}')" style="display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; flex-shrink:0;">
                  <img src="${vImg}" style="width:48px;height:48px;border-radius:50%;object-fit:cover; padding:2px; ${isActive} transition:all 0.2s;">
                  <span style="font-size:10px;font-weight:600;color:var(--fg); text-transform:uppercase;">${v.color || 'VAR'}</span>
              </div>`;
          });
          html += '</div>';
          $("pdColorsWrap").innerHTML = html; $("pdColorsWrap").classList.remove("hidden");
      } else { $("pdColorsWrap").classList.add("hidden"); }
  } else { $("pdColorsWrap").classList.add("hidden"); }

  const sizesIn = p.sizesIn ? p.sizesIn.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const sizesOut = p.sizesOut ? p.sizesOut.split(',').map(s=>s.trim()).filter(Boolean) : [];

  if(sizesIn.length > 0 || sizesOut.length > 0) {
      let html = '<div class="field-label" style="margin-bottom:10px; margin-top:10px; font-size:13px; font-weight:600; color:var(--fg);">Sizes</div><div style="display:flex;gap:10px;flex-wrap:wrap;">';
      sizesIn.forEach(s => { html += `<button class="size-box in" data-size="${s}">${s}</button>`; });
      sizesOut.forEach(s => { html += `<button class="size-box out" disabled>${s}</button>`; });
      html += '</div>';
      $("pdSizesWrap").innerHTML = html; $("pdSizesWrap").classList.remove("hidden");

      const btns = $("pdSizesWrap").querySelectorAll('.size-box.in');
      btns.forEach(b => {
          b.onclick = () => {
              btns.forEach(x => x.classList.remove('active'));
              b.classList.add('active');
              currentSelectedSize = b.getAttribute('data-size');
          }
      });
  } else {
      $("pdSizesWrap").classList.add("hidden");
      currentSelectedSize = "Default";
  }

  const buyBtn = $("pdBuyNow");
  if (inStock) {
    buyBtn.disabled = false;
    buyBtn.onclick = () => { 
        if(p.sizesIn && p.sizesIn.trim() !== "" && !currentSelectedSize) {
            alert("Please select a size first!"); return;
        }
        directBuyCheckout(p, currentSelectedSize); 
    };
  } else { buyBtn.disabled = true; }

  renderHorizSections(p); $("pdScroll").scrollTop = 0; $("prodDetail").classList.remove("hidden", "closing");
}

function closeProductDetail() {
  preventZoom(); const detail = $("prodDetail"); detail.classList.add("closing");
  detail.addEventListener("animationend", () => { detail.classList.add("hidden"); detail.classList.remove("closing"); currentDetailProduct = null; unlockScroll(); }, { once: true });
}
$("pdBackBtn").onclick = () => { history.back(); }; 

function renderHorizSections(currentProduct) {
  const container = $("pdHorizSections"); container.innerHTML = "";
  const vContainer = $("pdVerticalSections"); if(vContainer) vContainer.innerHTML = "";
  
  const sameMainList = products.filter((p) => {
      if (p.id === currentProduct.id) return false;
      if (p.mainCategoryId !== currentProduct.mainCategoryId) return false;
      if (currentProduct.shopId && currentProduct.shopId !== "GLOBAL" && p.shopId !== currentProduct.shopId) return false;
      return true;
  });
  
  if (sameMainList.length > 0) {
    container.appendChild(buildHorizSection("Similar Products", sameMainList));
    
    if(vContainer) {
       const vList = sameMainList.slice(0, 10);
       vList.forEach((p, i) => {
          const price = finalPrice(p); const inStock = p.inStock !== false; const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : "placeholder.jpg";
          const freeDel = p.freeDelivery !== false ? '<div style="color:#388e3c; font-size:10px; font-weight:800; text-transform:uppercase; margin-top:2px;">Free Delivery</div>' : '';
          const el = document.createElement("div"); el.className = "product";
          el.innerHTML = `
            <div><img src="${mainImg}" alt="${p.name}" loading="lazy" /></div>
            <div class="info">
              <div class="name">${p.name}</div>
              <div class="price-row"><span class="price">₹${price}</span>${p.discount > 0 ? `<span class="strike">₹${p.price}</span>` : ""}</div>
              ${freeDel}
              <span class="stock-badge ${inStock ? 'in' : 'out'}">${inStock ? '● In Stock' : '● Out of Stock'}</span>
            </div>
          `;
          el.onclick = () => openProductDetail(p);
          vContainer.appendChild(el);
       });
    }
  }
}

function buildHorizSection(title, list) {
  const section = document.createElement("div"); section.className = "horiz-section";
  const head = document.createElement("div"); head.className = "horiz-section-head";
  head.innerHTML = `<span class="horiz-section-title">${title}</span>`; section.appendChild(head);
  const row = document.createElement("div"); row.className = "horiz-row";
  list.forEach((p) => {
    const price = finalPrice(p); const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : "placeholder.jpg";
    const card = document.createElement("div"); card.className = "horiz-card";
    card.innerHTML = `<img src="${mainImg}" /><div><div class="horiz-card-name">${p.name}</div><div class="horiz-card-price">₹${price}</div></div>`;
    card.onclick = () => { closeProductDetail(); setTimeout(() => openProductDetail(p), 300); }; row.appendChild(card);
  });
  section.appendChild(row); return section;
}

// ==========================================
// CHECKOUT & PAYMENTS
// ==========================================
let currentDynamicUpi = "genzstore@nyes";

if ($("chkUtr")) { $("chkUtr").oninput = function () { this.value = this.value.replace(/[^0-9]/g, '').slice(0, 12); }; }
if ($("copyUpiBtn")) {
  $("copyUpiBtn").onclick = function () {
    navigator.clipboard.writeText(currentDynamicUpi).then(() => {
      this.innerHTML = `${currentDynamicUpi} <span style="font-size:12px; background:#4cc968; color:#fff; padding:3px 8px; border-radius:4px;">✅ Copied!</span>`;
      setTimeout(() => { this.innerHTML = `${currentDynamicUpi} <span style="font-size:12px; background:var(--primary); color:#fff; padding:3px 8px; border-radius:4px;">📋 Copy</span>`; }, 2000);
    }).catch(err => alert("Copy nahi ho paya, manually type karein."));
  };
}

function directBuyCheckout(p, size) { 
    requireLogin(() => { 
        preventZoom(); 
        const s = size || "Default"; 
        currentCheckoutItem = { product: p, qty: 1, size: s }; 
        $("prodDetail").classList.add("hidden"); $("prodDetail").classList.remove("closing"); 
        currentDetailProduct = null; 
        pushModalState(); openCheckout(); 
    }); 
}

function resetCheckoutUI() {
  $("checkoutStep1").classList.remove("hidden"); $("checkoutStep2").classList.add("hidden"); if ($("checkoutStep3")) $("checkoutStep3").classList.add("hidden");
  $("checkoutFooter").classList.remove("hidden"); $("chkFooterTotalRow").classList.remove("hidden");
  $("step1NextBtn").classList.remove("hidden"); $("step2PayBtn").classList.add("hidden"); $("confirmOrderBtn").classList.add("hidden");
  if ($("paymentOptionsWrap")) $("paymentOptionsWrap").classList.remove("hidden");
  if ($("qrScanSection")) $("qrScanSection").classList.add("hidden");
  if ($("chkUtr")) $("chkUtr").value = "";
  if (window.paymentInterval) clearInterval(window.paymentInterval);
  $("step1Indicator").className = "step-item active"; $("step1Circle").innerHTML = "1"; $("line1").className = "step-line";
  $("step2Indicator").className = "step-item"; $("step2Circle").innerHTML = "2"; $("line2").className = "step-line";
  $("step3Indicator").className = "step-item"; $("step3Circle").innerHTML = "3";
}

function openCheckout() {
  lockScroll(); resetCheckoutUI();
  if(!currentCheckoutItem) return;
  const total = finalPrice(currentCheckoutItem.product) * currentCheckoutItem.qty;
  $("chkTotalAmt").textContent = "₹" + total;
  $("checkoutOverlay").classList.remove("hidden");
  
  let shopCodEnabled = true; let shopCodAdvance = 0; let shopFullCodEnabled = false;
  if (currentCheckoutItem.product.shopId) {
      const sp = shops.find(s => s.id === currentCheckoutItem.product.shopId);
      if (sp) { currentDynamicUpi = sp.upi || "genzstore@nyes"; $("chkQrImage").src = sp.qr || "62673.png"; shopCodEnabled = sp.codEnabled !== false; shopCodAdvance = Number(sp.codAdvance) || 0; shopFullCodEnabled = sp.fullCodEnabled === true; } 
      else { currentDynamicUpi = "genzstore@nyes"; $("chkQrImage").src = "62673.png"; }
  } else { currentDynamicUpi = "genzstore@nyes"; $("chkQrImage").src = "62673.png"; }
  
  $("copyUpiBtn").innerHTML = `${currentDynamicUpi} <span style="font-size:12px; background:var(--primary); color:#fff; padding:3px 8px; border-radius:4px;">📋 Copy</span>`;

  if(!shopCodEnabled) {
      $("payCODLabel").classList.add("hidden"); $("payPrepaid").checked = true; $("codWarningBox").classList.add("hidden"); 
      $("step2PayBtn").textContent = "Pay Online (Prepaid)";
  } else {
      $("payCODLabel").classList.remove("hidden");
      if (shopFullCodEnabled) {
          $("codTextDesc").innerHTML = `100% Cash on Delivery available. No advance required. 🚚`;
      } else if(shopCodAdvance > 0) {
          $("codTextDesc").innerHTML = `Safety Deposit of ₹${shopCodAdvance} required online.`; 
      } else { 
          $("codTextDesc").innerHTML = `Safety Deposit online required.`; 
      }
      $("step2PayBtn").textContent = "Pay Online (Prepaid)";
  }
}

$("closeCheckout").onclick = () => { history.back(); }; 

$("step1NextBtn").onclick = () => {
  const name = $("chkName").value.trim(); const mobile = $("chkMobile").value.trim(); const address = $("chkAddress").value.trim(); const state = $("chkState").value.trim(); const pincode = $("chkPincode").value.trim();
  if (!name || !mobile || !address || !state || !pincode) return alert("Kripya sabhi zaroori jankari bharein!");
  if (mobile.length < 10 || isNaN(mobile)) return alert("Mobile number galat hai!");
  
  $("checkoutStep1").classList.add("hidden"); $("checkoutStep2").classList.remove("hidden");
  $("step1NextBtn").classList.add("hidden"); $("step2PayBtn").classList.remove("hidden"); $("chkFooterTotalRow").classList.add("hidden");
  $("step1Indicator").classList.remove("active"); $("step1Indicator").classList.add("completed"); $("step1Circle").innerHTML = "✔";
  $("line1").classList.add("completed"); $("step2Indicator").classList.add("active");
  renderStep2();
};

function renderStep2() {
  if (!currentCheckoutItem) return;
  const item = currentCheckoutItem; const p = item.product;
  const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : (typeof p.image === 'string' ? p.image : "placeholder.jpg");
  $("chkStep2Img").src = mainImg; $("chkStep2Qty").value = item.qty > 7 ? 7 : item.qty;
  updateStep2Summary();
  
  $("chkStep2Qty").onchange = (e) => { 
      item.qty = parseInt(e.target.value); updateStep2Summary(); 
      const selectedRadio = document.querySelector('input[name="payMethod"]:checked');
      if(selectedRadio) selectedRadio.dispatchEvent(new Event('change'));
  };
  
  const selectedRadio = document.querySelector('input[name="payMethod"]:checked');
  if(selectedRadio) { selectedRadio.dispatchEvent(new Event('change')); }
}

function updateStep2Summary() {
  if (!currentCheckoutItem) return;
  let actualTotal = currentCheckoutItem.product.price * currentCheckoutItem.qty; 
  let finalTotal = finalPrice(currentCheckoutItem.product) * currentCheckoutItem.qty;
  $("billActual").textContent = "₹" + actualTotal; $("billFinal").textContent = "₹" + finalTotal;
  if (actualTotal > 0) { const discPercent = Math.round(((actualTotal - finalTotal) / actualTotal) * 100); $("billDiscount").textContent = discPercent + "% off"; }
  
  let shopCodAdvance = 0; let shopFullCodEnabled = false;
  if (currentCheckoutItem.product.shopId) {
      const sp = shops.find(s => s.id === currentCheckoutItem.product.shopId);
      if (sp) { shopCodAdvance = Number(sp.codAdvance) || 0; shopFullCodEnabled = sp.fullCodEnabled === true; }
  }
  
  let advance = 0;
  if (!shopFullCodEnabled) {
      advance = shopCodAdvance > 0 ? shopCodAdvance : Math.round(finalTotal * 0.25);
      if(advance > finalTotal) advance = finalTotal;
  }
  const balance = finalTotal - advance;
  
  $("codAdvanceAmt").textContent = "₹" + advance; $("codBalanceAmt").textContent = "₹" + balance;
}

document.querySelectorAll('input[name="payMethod"]').forEach(radio => {
  radio.addEventListener("change", (e) => {
    $("qrScanSection").classList.add("hidden"); $("paymentOptionsWrap").classList.remove("hidden");
    $("confirmOrderBtn").classList.add("hidden"); $("step2PayBtn").classList.remove("hidden");
    if (window.paymentInterval) clearInterval(window.paymentInterval);
    if (e.target.value === "COD") { 
        let shopCodAdvance = 0; let shopFullCodEnabled = false;
        if (currentCheckoutItem && currentCheckoutItem.product.shopId) { const sp = shops.find(s => s.id === currentCheckoutItem.product.shopId); if (sp) { shopCodAdvance = Number(sp.codAdvance) || 0; shopFullCodEnabled = sp.fullCodEnabled === true; } }
        
        if (shopFullCodEnabled) {
            $("codWarningBox").classList.add("hidden");
            $("step2PayBtn").textContent = "Place Order (100% COD)";
        } else {
            $("codWarningBox").classList.remove("hidden"); 
            if(shopCodAdvance > 0) {
                $("step2PayBtn").textContent = `Pay ₹${shopCodAdvance} Advance`; 
            } else { 
                let finalTotal = finalPrice(currentCheckoutItem.product) * currentCheckoutItem.qty;
                let defaultAdv = Math.round(finalTotal * 0.25);
                if(defaultAdv > finalTotal) defaultAdv = finalTotal;
                $("step2PayBtn").textContent = `Pay ₹${defaultAdv} Advance`;
            }
        }
    } 
    else { 
        $("codWarningBox").classList.add("hidden"); 
        $("step2PayBtn").textContent = "Pay Online (Prepaid)"; 
    }
  });
});

$("step2PayBtn").onclick = () => {
  if(!currentCheckoutItem) return;
  const payMethod = $("payPrepaid").checked ? "Prepaid" : "COD";
  let finalTotal = finalPrice(currentCheckoutItem.product) * currentCheckoutItem.qty;
  
  let amountPaid = finalTotal;
  if(payMethod === "COD") {
      let shopCodAdvance = 0; let shopFullCodEnabled = false;
      if (currentCheckoutItem.product.shopId) { const sp = shops.find(s => s.id === currentCheckoutItem.product.shopId); if (sp) { shopCodAdvance = Number(sp.codAdvance) || 0; shopFullCodEnabled = sp.fullCodEnabled === true; } }
      
      if (shopFullCodEnabled) {
          amountPaid = 0;
      } else {
          amountPaid = shopCodAdvance > 0 ? shopCodAdvance : Math.round(finalTotal * 0.25);
          if(amountPaid > finalTotal) amountPaid = finalTotal;
      }
  }

  if (amountPaid === 0 && payMethod === "COD") {
      $("confirmOrderBtn").click();
      return;
  }
  
  $("qrAmountDisplay").textContent = "₹" + amountPaid;
  $("paymentOptionsWrap").classList.add("hidden"); $("qrScanSection").classList.remove("hidden");
  $("step2PayBtn").classList.add("hidden"); $("confirmOrderBtn").classList.remove("hidden");
  $("checkoutStep2").scrollTop = 0;

  let timeLeft = 300; const timerDisplay = document.getElementById("paymentTimer");
  if (window.paymentInterval) clearInterval(window.paymentInterval);
  window.paymentInterval = setInterval(() => {
    timeLeft--; let minutes = Math.floor(timeLeft / 60); let seconds = timeLeft % 60;
    timerDisplay.innerText = "Time left: 0" + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    if (timeLeft <= 0) { clearInterval(window.paymentInterval); timerDisplay.innerText = "Time expired! Kripya page refresh karein."; timerDisplay.style.color = "red"; }
  }, 1000);
};

async function sendTelegramAlert(orderData) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "") return;
    let itemsList = "";
    if (orderData.items && orderData.items.length > 0) {
        itemsList = orderData.items.map(i => `${i.product.name} (x${i.qty}) ${i.size && i.size !== 'Default' ? '['+i.size+']' : ''}`).join(', ');
    } else {
        itemsList = "Unknown Items";
    }

    let text = `🛍️ *NEW ELITE ORDER ALERT!* 🛍️\n\n`;
    text += `👤 *Name:* ${orderData.name}\n`;
    text += `📱 *Mobile:* ${orderData.mobile}\n\n`;
    text += `🏠 *FULL DELIVERY ADDRESS:*\n`;
    text += `${orderData.address}\n`;
    if(orderData.landmark) text += `📌 Landmark: ${orderData.landmark}\n`;
    text += `📍 ${orderData.state} - ${orderData.pincode}\n\n`;
    text += `📦 *Items Ordered:* ${itemsList}\n`;
    text += `🛒 *Store:* ${orderData.shopName}\n`;
    text += `💰 *Total Amount:* ₹${orderData.totalAmount}\n`;
    text += `💳 *Payment Mode:* ${orderData.paymentMethod}\n`;
    
    if(orderData.paymentMethod === "COD") {
        text += `💸 *Advance Paid:* ₹${orderData.amountPaid}\n`;
        text += `🛑 *Balance Due (COD):* ₹${orderData.balanceDue}\n`;
    }
    
    if(orderData.utrNumber && orderData.utrNumber !== "FULL_COD") text += `🧾 *UTR No:* ${orderData.utrNumber}\n`;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: "Markdown" }) }); } catch(e) {}
}

$("confirmOrderBtn").onclick = () => {
  let utrValue = $("chkUtr").value.trim();
  if(!currentCheckoutItem) return;
  
  const payMethod = $("payPrepaid").checked ? "Prepaid" : "COD";
  let finalTotal = finalPrice(currentCheckoutItem.product) * currentCheckoutItem.qty;
  
  let amountPaid = finalTotal;
  if(payMethod === "COD") {
      let shopCodAdvance = 0; let shopFullCodEnabled = false;
      if (currentCheckoutItem.product.shopId) { const sp = shops.find(s => s.id === currentCheckoutItem.product.shopId); if (sp) { shopCodAdvance = Number(sp.codAdvance) || 0; shopFullCodEnabled = sp.fullCodEnabled === true; } }
      if (shopFullCodEnabled) {
          amountPaid = 0;
      } else {
          amountPaid = shopCodAdvance > 0 ? shopCodAdvance : Math.round(finalTotal * 0.25);
          if(amountPaid > finalTotal) amountPaid = finalTotal;
      }
  }

  if (amountPaid > 0) {
      if (utrValue.length !== 12 || !/^\d+$/.test(utrValue)) return alert("Galat UTR! Kripya exactly 12-digit ka sahi numeric UTR / Reference Number daalein.");
  } else {
      utrValue = "FULL_COD";
  }

  let balanceDue = finalTotal - amountPaid;

  const userEmail = window.fbAuth && window.fbAuth.currentUser ? window.fbAuth.currentUser.email : "guest";
  let orderShopName = "Gen-Z Store"; let orderShopLogo = "placeholder.jpg";
  if (currentCheckoutItem.product.shopId) {
      const sp = shops.find(s => s.id === currentCheckoutItem.product.shopId);
      if (sp) { orderShopName = sp.name; orderShopLogo = sp.logo || "placeholder.jpg"; }
  }

  const orderData = { name: $("chkName").value.trim(), mobile: $("chkMobile").value.trim(), address: $("chkAddress").value.trim(), state: $("chkState").value.trim(), pincode: $("chkPincode").value.trim(), landmark: $("chkLandmark").value.trim(), items: [currentCheckoutItem], totalAmount: finalTotal, paymentMethod: payMethod, amountPaid: amountPaid, balanceDue: balanceDue, utrNumber: utrValue, status: "Recent", userEmail: userEmail, shopName: orderShopName, shopLogo: orderShopLogo, savedAt: Date.now() };

  const btn = $("confirmOrderBtn"); btn.textContent = "Placing Order...";
  if (window.paymentInterval) clearInterval(window.paymentInterval);

  if (firebase && firebase.database) {
    const orderRef = firebase.database().ref('orders').push();
    orderRef.set({ ...orderData, id: orderRef.key }).then(() => {
        sendTelegramAlert(orderData); 
        showStep3Success(payMethod, amountPaid, balanceDue);
    }).catch((err) => {
        alert("Server error. Please try again."); 
        btn.textContent = "Verify Payment & Confirm";
    });
  } else {
    // Fallback if Firebase fails
    let localUserOrders = load("knk_my_orders_" + userEmail, []); localUserOrders.unshift(orderData); save("knk_my_orders_" + userEmail, localUserOrders);
    sendTelegramAlert(orderData); 
    showStep3Success(payMethod, amountPaid, balanceDue);
  }
};

function showStep3Success(payMethod, paid, due) {
  $("checkoutStep2").classList.add("hidden"); $("checkoutStep3").classList.remove("hidden"); $("checkoutFooter").classList.add("hidden");
  $("step2Indicator").classList.remove("active"); $("step2Indicator").classList.add("completed"); $("step2Circle").innerHTML = "✔";
  $("line2").classList.add("completed"); $("step3Indicator").classList.add("active");
  let sumHtml = `<strong style="font-size:14px; color:var(--primary);">Payment Mode: ${payMethod}</strong><br><br>`;
  if (payMethod === "COD" && paid > 0) { sumHtml += `<strong>Safety Deposit Paid:</strong> ₹${paid}<br><strong style="color:var(--destructive)">Balance Cash on Delivery:</strong> ₹${due}`; } 
  else if (payMethod === "COD" && paid === 0) { sumHtml += `<strong>Total Amount to Pay on Delivery:</strong> ₹${due}`; }
  else { sumHtml += `<strong>Total Paid Online:</strong> ₹${paid}<br><strong style="color:#4cc968">No pending dues!</strong>`; }
  $("successOrderSummary").innerHTML = sumHtml;
}

$("successCloseBtn").onclick = () => { history.back(); };

function openPin() { $("pinInput").value = ""; $("pinError").classList.add("hidden"); $("adminPin").classList.remove("hidden"); setTimeout(() => $("pinInput").focus(), 100); }
$("pinClose").onclick = () => { history.back(); };
$("pinUnlock").onclick = tryUnlock;
$("pinInput").onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };

function tryUnlock() {
  if ($("pinInput").value === ADMIN_PIN) { 
      $("adminPin").classList.add("hidden"); 
      openAdminAsVendor(); 
  } else { 
      $("pinError").classList.remove("hidden"); 
  }
}

function openSuperAdminPin() {
    $("superPinInput").value = ""; $("superPinError").classList.add("hidden"); $("superAdminPinModal").classList.remove("hidden"); setTimeout(() => $("superPinInput").focus(), 100);
}

$("superPinClose").onclick = () => { history.back(); };
$("superPinInput").onkeydown = (e) => { if (e.key === "Enter") trySuperUnlock(); };
$("superPinUnlock").onclick = trySuperUnlock;

function trySuperUnlock() {
    if ($("superPinInput").value === SUPER_ADMIN_PIN) {
        $("superAdminPinModal").classList.add("hidden");
        $("tabShopsBtn").classList.remove("hidden");
        $("tabOrdersBtn").classList.remove("hidden");
        $("tabCatsBtn").classList.remove("hidden");
        $("tabSettingsBtn").classList.remove("hidden");
        if ($("adminProducts") && $("adminProducts").parentElement) { $("adminProducts").parentElement.classList.remove("hidden"); }
    } else {
        $("superPinError").classList.remove("hidden");
    }
}

function openAdminAsVendor() { 
  lockScroll(); 
  renderAdmin(); 
  $("adminPanel").classList.remove("hidden"); 
  $("tabShopsBtn").classList.add("hidden");
  $("tabOrdersBtn").classList.add("hidden");
  $("tabCatsBtn").classList.add("hidden");
  $("tabSettingsBtn").classList.add("hidden");
  if ($("adminProducts") && $("adminProducts").parentElement) { $("adminProducts").parentElement.classList.add("hidden"); }
  document.querySelectorAll('.am-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  $("tabProdsBtn").classList.add('active');
  $("amProds").classList.remove('hidden');
}

$("adminClose").onclick = () => { 
    $("adminPanel").classList.add("hidden"); 
    unlockScroll(); 
    $("tabShopsBtn").classList.add("hidden");
    $("tabOrdersBtn").classList.add("hidden");
    $("tabCatsBtn").classList.add("hidden");
    $("tabSettingsBtn").classList.add("hidden");
    if ($("adminProducts") && $("adminProducts").parentElement) { $("adminProducts").parentElement.classList.add("hidden"); }
};

// ==========================================
// ADMIN REALTIME DATABASE ACTIONS
// ==========================================

if ($("addBannerBtn")) {
    $("addBannerBtn").onclick = async () => {
        if (!firebase || !firebase.database) return alert("Database connection error");
        const i = $("newBannerImg").value.trim(); const l = $("newBannerLink").value.trim();
        if(!i) return alert("Banner Image URL zaroori hai!");
        $("addBannerBtn").textContent = "Adding...";
        
        homeBanners.push({ id: genId(), image: i, link: l });
        await firebase.database().ref('banners').set(homeBanners);
        
        $("newBannerImg").value = ""; $("newBannerLink").value = "";
        alert("Banner Add Ho Gaya!"); $("addBannerBtn").textContent = "+ Add Banner";
    };
}

if ($("addShopBtn")) {
    $("addShopBtn").onclick = async () => {
        if (!firebase || !firebase.database) return alert("Database connection error");
        const n = $("newShopName").value.trim(); const c = $("newShopCity").value.trim(); const t = $("newShopType").value.trim(); const l = $("newShopImage").value.trim(); const u = $("newShopUPI").value.trim(); const q = $("newShopQR").value.trim();
        const codAmt = Number($("newShopCodAmt").value) || 0; const codStat = $("newShopCodStatus").checked; const fCodStat = $("newShopFullCodStatus") ? $("newShopFullCodStatus").checked : false;

        if(!n || !c || !l || !u) return alert("Shop Name, City, Logo URL, aur UPI ID sab zaroori hain!");
        $("addShopBtn").textContent = "Adding/Updating...";
        
        try {
            if(editingShopId) {
                await firebase.database().ref('shops/' + editingShopId).update({ name: n, city: c, type: t, logo: l, upi: u, qr: q, codAdvance: codAmt, codEnabled: codStat, fullCodEnabled: fCodStat });
                alert("Dukaan Update Ho Gayi!");
            } else {
                const newRef = firebase.database().ref('shops').push();
                await newRef.set({ name: n, city: c, type: t, logo: l, upi: u, qr: q, codAdvance: codAmt, codEnabled: codStat, fullCodEnabled: fCodStat, timestamp: Date.now() });
                alert("Nai Dukaan Add Ho Gayi!");
            }
            $("newShopName").value = ""; $("newShopCity").value = ""; $("newShopType").value=""; $("newShopImage").value = ""; $("newShopUPI").value = ""; $("newShopQR").value = ""; $("newShopCodAmt").value = ""; $("newShopCodStatus").checked = true; if($("newShopFullCodStatus")) $("newShopFullCodStatus").checked = false;
            editingShopId = null; $("addShopBtn").textContent = "+ Add Shop";
        } catch(e) { console.error(e); alert("Error in shop operation!"); $("addShopBtn").textContent = "+ Add Shop"; }
    };
}

if ($("saveEditShopBtn")) {
    $("saveEditShopBtn").onclick = async () => {
        if(!editingShopId) return;
        if (!firebase || !firebase.database) return alert("Database connection error");
        
        const n = $("editSName").value.trim(); const c = $("editSCity").value.trim(); const t = $("editSType").value.trim(); const l = $("editSImage").value.trim(); const u = $("editSUPI").value.trim(); const q = $("editSQR").value.trim();
        const codAmt = Number($("editSCodAmt").value) || 0; const codStat = $("editSCodStatus").checked; const fCodStat = $("editSFullCodStatus") ? $("editSFullCodStatus").checked : false;

        if(!n || !c || !l || !u) return alert("Name, City, Logo, UPI required!");
        $("saveEditShopBtn").textContent = "Saving...";
        
        try {
            await firebase.database().ref('shops/' + editingShopId).update({ name: n, city: c, type: t, logo: l, upi: u, qr: q, codAdvance: codAmt, codEnabled: codStat, fullCodEnabled: fCodStat });
        } catch(e) { console.error(e) }
        
        $("editShopModal").classList.add("hidden"); editingShopId = null; $("saveEditShopBtn").textContent = "Save Shop";
    };
}

if ($("editShopClose")) { $("editShopClose").onclick = () => { $("editShopModal").classList.add("hidden"); editingShopId = null; } }
function openEditShopModal(shop) { 
    editingShopId = shop.id; 
    $("editSName").value = shop.name || ""; $("editSCity").value = shop.city || ""; $("editSType").value = shop.type || ""; 
    $("editSImage").value = shop.logo || ""; $("editSUPI").value = shop.upi || ""; $("editSQR").value = shop.qr || ""; 
    $("editSCodAmt").value = shop.codAdvance || ""; $("editSCodStatus").checked = shop.codEnabled !== false;
    if($("editSFullCodStatus")) $("editSFullCodStatus").checked = shop.fullCodEnabled === true;
    $("editShopModal").classList.remove("hidden"); 
}

function renderCatMgmt() {
  const list = $("catMgmtList"); list.innerHTML = "";
  mainCategories.forEach((cat) => {
    let shopLabel = "Global";
    if (cat.shopId && cat.shopId !== "GLOBAL") { const sp = shops.find(s => s.id === cat.shopId); if (sp) shopLabel = sp.name; }
    const card = document.createElement("div"); card.className = "cat-mgmt-card";
    card.innerHTML = `
      <div class="cat-mgmt-head">
        <span>${cat.name} <small style="color:var(--primary); font-size:10px;">(${shopLabel})</small></span>
        <div><button class="del-cat-btn" style="color:var(--destructive); background:none; border:1px solid rgba(224,85,85,0.3); border-radius:8px; padding:4px 8px; font-size:12px; cursor:pointer;">Delete</button></div>
      </div>
    `;
    card.querySelector(".del-cat-btn").onclick = async () => {
        if(confirm(`Are you sure you want to permanently delete the category "${cat.name}"?`)) {
            if (!firebase || !firebase.database) return;
            mainCategories = mainCategories.filter(c => c.id !== cat.id); 
            await firebase.database().ref('categories').set(mainCategories);
        }
    };
    list.appendChild(card);
  });
}

function syncAddProductDropdowns() {
  const pMainCat = $("pMainCat"); pMainCat.innerHTML = "";
  mainCategories.forEach((cat) => { const o = document.createElement("option"); o.value = cat.id; o.textContent = cat.name; pMainCat.appendChild(o); });
  const pShop = $("pShop"); const newCatShop = $("newCatShop");
  if(pShop) { pShop.innerHTML = '<option value="">Gen-Z Store (Default Store)</option>'; shops.forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name + " (" + (s.city || 'City') + ")"; pShop.appendChild(o); }); }
  if(newCatShop) { newCatShop.innerHTML = '<option value="GLOBAL">Global (All Shops)</option>'; shops.forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; newCatShop.appendChild(o); }); }
}

window.renderAdminOrders = function (orders) {
  const list = $("adminOrdersList"); if (!list) return; list.innerHTML = "";
  const filteredOrders = orders.filter(o => (o.status || 'Recent') === activeAdminOrderTab);
  if (filteredOrders.length === 0) { list.innerHTML = `<p class="empty" style="padding: 20px;">No ${activeAdminOrderTab} orders found.</p>`; return; }
  
  filteredOrders.forEach((o) => {
    const div = document.createElement("div"); div.className = "admin-order-card";
    let itemsHtml = (o.items || []).map(i => {
       const img = Array.isArray(i.product.image) ? i.product.image[0] : i.product.image;
       const sizeHtml = i.size && i.size !== "Default" ? `<span style="color:var(--primary); font-weight:700;">[${i.size}]</span>` : '';
       return `<div class="order-item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><img src="${img}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; border:1px solid var(--border);"><div style="font-size:12px; color:var(--fg);">${i.product.name} ${sizeHtml} <strong style="color:var(--primary);">(x${i.qty})</strong></div></div>`;
    }).join("");
    div.innerHTML = `
      <div class="order-head"><span>Name: ${o.name} (${o.mobile})</span><strong>₹${o.totalAmount}</strong></div>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px dashed var(--border);">
         <img src="${o.shopLogo || 'placeholder.jpg'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid var(--primary);">
         <strong style="color:var(--primary); font-size:13px;">Seller: ${o.shopName || 'Gen-Z Store'}</strong>
         <span style="margin-left:auto; font-size:11px; font-weight:700; background:var(--card2); padding:4px 8px; border-radius:4px; color:${o.paymentMethod==='COD'?'var(--destructive)':'#4cc968'}">${o.paymentMethod}</span>
      </div>
      <div style="font-size:12px; color:var(--muted2); margin:8px 0; line-height:1.5;"><strong>Address:</strong> ${o.address}<br>${o.landmark ? '<strong>Landmark:</strong> ' + o.landmark + '<br>' : ''}<strong>State & Pincode:</strong> ${o.state} - ${o.pincode}</div>
      <div class="order-items" style="background:var(--card); padding:10px; border-radius:8px; margin-bottom:10px;">${itemsHtml}</div>
      <div class="order-actions" style="display:flex; justify-content: space-between; align-items: center; margin-top:10px; border-top:1px solid var(--border); padding-top:10px;">
        <select class="field small-field status-select" data-id="${o.id}" style="padding:6px; margin-bottom:0;"><option value="Recent" ${o.status === 'Recent' ? 'selected' : ''}>Recent</option><option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option><option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>Completed</option></select>
        <button class="del-order-btn" data-id="${o.id}">🗑️ Delete Order</button>
      </div>`;
    
    div.querySelector(".status-select").onchange = async (e) => { 
        if (!firebase || !firebase.database) return;
        const newStatus = e.target.value; 
        await firebase.database().ref('orders/' + o.id).update({ status: newStatus });
    };
    
    div.querySelector(".del-order-btn").onclick = async () => { 
        if(confirm("Are you sure you want to permanently delete this order?")) { 
            if (!firebase || !firebase.database) return;
            await firebase.database().ref('orders/' + o.id).remove();
        } 
    };
    list.appendChild(div);
  });
};

function renderAdminProducts() {
  $("adminProdTitle").textContent = `Products (${products.length})`;
  const filterCat = $("adminFilterCat").value || "ALL"; const list = $("adminProducts"); list.innerHTML = "";
  const filtered = filterCat === "ALL" ? products : products.filter(p => p.mainCategoryId === filterCat);
  filtered.forEach(p => {
    const price = finalPrice(p); const inStock = p.inStock !== false; const cat = getCat(p.mainCategoryId); const catName = cat ? cat.name : "—";
    const mainImg = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : "placeholder.jpg";
    const el = document.createElement("div"); el.className = "admin-prod";
    el.innerHTML = `
      <img src="${mainImg}" alt="${p.name}" />
      <div class="ap-info"><div class="ap-name">${p.name}</div><div class="ap-sub">${catName}</div><div class="ap-price">₹${price} ${p.discount > 0 ? `(${p.discount}% off)` : ''} · <span style="color:${inStock ? '#4cc968' : '#e05555'}">${inStock ? 'In Stock' : 'Out of Stock'}</span></div></div>
      <div class="ap-actions"><button class="edit-btn">✏️</button><button class="trash">🗑️</button></div>`;
    
    el.querySelector(".edit-btn").onclick = () => openEditModal(p);
    
    el.querySelector(".trash").onclick = async () => { 
        if (!confirm("Delete this product?")) return; 
        if (!firebase || !firebase.database) return;
        await firebase.database().ref('products/' + p.id).remove();
    };
    list.appendChild(el);
  });
}

window.renderAdmin = function () {
  renderCatMgmt(); syncAddProductDropdowns();
  if ($("adminFilterCat")) { const sel = $("adminFilterCat"); sel.innerHTML = '<option value="ALL">All Categories</option>'; mainCategories.forEach(cat => { const o = document.createElement("option"); o.value = cat.id; o.textContent = cat.name; sel.appendChild(o); }); }
  
  const blist = $("adminBannersList");
  if(blist) { 
      blist.innerHTML = ""; 
      homeBanners.forEach(b => { 
          const d = document.createElement("div"); d.className = "admin-prod"; 
          d.innerHTML = `<img src="${b.image}" alt="Banner" style="width:80px; border-radius:4px; object-fit:cover;" /><div class="ap-info"><div class="ap-name" style="font-size:11px; color:var(--muted);">${b.link || 'No Link'}</div></div><div class="ap-actions"><button class="trash del-banner" data-id="${b.id}">🗑️</button></div>`; 
          d.querySelector('.del-banner').onclick = async () => { 
              if(confirm("Delete this Banner?")) { 
                  if (!firebase || !firebase.database) return;
                  homeBanners = homeBanners.filter(x => x.id !== b.id); 
                  await firebase.database().ref('banners').set(homeBanners);
              } 
          }; 
          blist.appendChild(d); 
      }); 
  }
  
  const slist = $("adminShopsList");
  if(slist) { 
      slist.innerHTML = ""; 
      shops.forEach(s => { 
          const d = document.createElement("div"); d.className = "admin-prod"; 
          d.innerHTML = `<img src="${s.logo || 'placeholder.jpg'}" alt="${s.name}" /><div class="ap-info"><div class="ap-name">${s.name} <span style="color:var(--muted);font-size:11px;">(${s.city || 'N/A'} - ${s.type || 'N/A'})</span></div><div class="ap-sub" style="color:var(--primary); font-size:10px;">UPI: ${s.upi} | COD: ${s.codEnabled !== false ? 'ON' : 'OFF'}</div></div><div class="ap-actions"><button class="edit-btn edit-shop" data-id="${s.id}">✏️</button><button class="trash del-shop" data-id="${s.id}">🗑️</button></div>`; 
          d.querySelector('.edit-shop').onclick = () => { openEditShopModal(s); }; 
          d.querySelector('.del-shop').onclick = async () => { 
              if(confirm("Delete this Shop completely?")) { 
                  if (!firebase || !firebase.database) return;
                  await firebase.database().ref('shops/' + s.id).remove();
              } 
          }; 
          slist.appendChild(d); 
      }); 
  }
  
  renderAdminProducts();
  if ($("updatePinBtn")) { $("updatePinBtn").onclick = () => { alert("PIN change option is securely hardcoded to 0000 for elite security."); }; }
};

function openEditModal(p) {
  editingProductId = p.id; $("editPName").textContent = p.name;
  let imgArray = Array.isArray(p.image) ? p.image : [p.image]; $("editPImage").value = imgArray.join(", ");
  $("editPSizesIn").value = p.sizesIn || ""; $("editPSizesOut").value = p.sizesOut || ""; $("editPColor").value = p.color || ""; $("editPGroupId").value = p.groupId || "";
  $("editPPrice").value = p.price; $("editPDiscount").value = p.discount || 0; $("editPExtra").value = p.extra || 0;
  
  const inStock = p.inStock !== false; $("editInStock").checked = inStock;
  const freeDel = p.freeDelivery !== false; if($("editPFreeDelivery")) $("editPFreeDelivery").checked = freeDel;

  const lbl = $("editStockLabel"); lbl.textContent = inStock ? "In Stock" : "Out of Stock"; lbl.className = "stock-label " + (inStock ? "in" : "out");
  $("editModal").classList.remove("hidden");
}

if ($("editInStock")) { $("editInStock").addEventListener("change", function () { const lbl = $("editStockLabel"); lbl.textContent = this.checked ? "In Stock" : "Out of Stock"; lbl.className = "stock-label " + (this.checked ? "in" : "out"); }); }
if ($("editClose")) { $("editClose").onclick = () => { $("editModal").classList.add("hidden"); editingProductId = null; }; }

if ($("saveEditBtn")) {
  $("saveEditBtn").onclick = async () => {
    if (!editingProductId) return;
    if (!firebase || !firebase.database) return alert("Database connection error");

    const newPrice = Number($("editPPrice").value); const newDiscount = Number($("editPDiscount").value) || 0; const newExtra = Number($("editPExtra").value) || 0; const newInStock = $("editInStock").checked; const rawImage = $("editPImage").value.trim(); const newImgArray = rawImage.split(",").map(s => s.trim()).filter(Boolean);
    const sIn = $("editPSizesIn").value.trim(); const sOut = $("editPSizesOut").value.trim(); const c = $("editPColor").value.trim(); const gid = $("editPGroupId").value.trim();
    const newFreeDel = $("editPFreeDelivery") ? $("editPFreeDelivery").checked : true;
    
    if (!newPrice || newPrice <= 0 || newImgArray.length === 0) return alert("Sahi Image aur Price daalein!");
    
    await firebase.database().ref('products/' + editingProductId).update({ 
        image: newImgArray, 
        price: newPrice, 
        discount: newDiscount, 
        extra: newExtra, 
        inStock: newInStock, 
        freeDelivery: newFreeDel, 
        sizesIn: sIn, 
        sizesOut: sOut, 
        color: c, 
        groupId: gid 
    });
    
    $("editModal").classList.add("hidden"); editingProductId = null;
  };
}

$("closeViewerBtn").onclick = () => { history.back(); };
$("imageViewer").onclick = (e) => { if (e.target === $("imageViewer") || e.target === $("fullImage")) { history.back(); } };
preventZoom(); renderLikesCount();

// --- PUSH NOTIFICATION SYSTEM (ONESIGNAL REST API) ---
if ($("sendNotifBtn")) {
    if ($("fcmServerKey")) {
        $("fcmServerKey").style.display = 'none';
    }

    $("sendNotifBtn").onclick = async () => {
        const t = $("notifTitle").value.trim(); 
        const b = $("notifBody").value.trim(); 
        const i = $("notifImage").value.trim();
        
        if (!t || !b) return alert("Title aur Message zaroori hai!");
        $("sendNotifBtn").textContent = "Sending...";

        const ONESIGNAL_REST_API_KEY = "";
        const APP_ID = "";

        const payload = {
            app_id: APP_ID,
            included_segments: ["Subscribed Users"], 
            headings: { "en": t },
            contents: { "en": b }
        };

        if (i) {
            payload.big_picture = i; 
            payload.chrome_web_image = i; 
        }

        try {
            const targetUrl = "https://onesignal.com/api/v1/notifications";
            const proxyUrl = "https://thingproxy.freeboard.io/fetch/" + targetUrl;

            const response = await fetch(proxyUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Basic " + ONESIGNAL_REST_API_KEY
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.id) {
                alert("OneSignal Notification Sent Successfully! 🚀");
                $("notifTitle").value = ""; 
                $("notifBody").value = ""; 
                $("notifImage").value = "";
            } else {
                console.error("OneSignal Error:", data);
                alert("Error: " + JSON.stringify(data));
            }
        } catch(e) { 
            console.error(e); 
            alert("Proxy Error: " + e.message + "\n\nBhai free proxy block kar raha hai. Abhi ke liye OneSignal Dashboard se bhej lo."); 
        }
        
        $("sendNotifBtn").textContent = "Send Notification";
    };
}
