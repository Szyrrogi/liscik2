/* Liściki — logika aplikacji
   Wymaga wczytanego firebase-config.js (zmienne globalne: auth, db) */

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

let currentUser = null;      // { uid, displayName, email }
let friendsCache = [];       // [{uid, displayName, email}]
let activeListeners = [];    // firestore unsubscribe fns, cleared on logout
let currentFriendView = null;

// ---------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function friendlyAuthError(err) {
  const map = {
    'auth/email-already-in-use': 'Konto z tym adresem e-mail już istnieje.',
    'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
    'auth/weak-password': 'Hasło musi mieć co najmniej 6 znaków.',
    'auth/user-not-found': 'Nie znaleziono konta o tym adresie e-mail.',
    'auth/wrong-password': 'Nieprawidłowe hasło.',
    'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
    'auth/too-many-requests': 'Zbyt wiele prób. Spróbuj ponownie za chwilę.',
  };
  return map[err.code] || 'Coś poszło nie tak. Spróbuj ponownie.';
}

// ---------------------------------------------------------------
// Auth screen switching (login <-> register)
// ---------------------------------------------------------------
$('#go-register').addEventListener('click', () => {
  $('#form-login').classList.add('hidden');
  $('#form-register').classList.remove('hidden');
  $('#auth-error').classList.add('hidden');
});
$('#go-login').addEventListener('click', () => {
  $('#form-register').classList.add('hidden');
  $('#form-login').classList.remove('hidden');
  $('#auth-error').classList.add('hidden');
});

function setAuthError(msg) {
  const el = $('#auth-error');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError(null);
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    setAuthError(friendlyAuthError(err));
  }
});

$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError(null);
  const name = $('#reg-name').value.trim();
  const email = $('#reg-email').value.trim();
  const password = $('#reg-password').value;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await db.collection('users').doc(cred.user.uid).set({
      displayName: name,
      email: email.toLowerCase(),
      friends: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    setAuthError(friendlyAuthError(err));
  }
});

$('#btn-logout').addEventListener('click', () => auth.signOut());

// ---------------------------------------------------------------
// Auth state -> show correct screen
// ---------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
  activeListeners.forEach(unsub => unsub());
  activeListeners = [];
  teardownFriendView();

  if (user) {
    currentUser = { uid: user.uid, displayName: user.displayName || user.email, email: user.email };
    $('#view-auth').classList.add('hidden');
    $('#view-app').classList.remove('hidden');
    $('#form-login').reset();
    $('#form-register').reset();
    switchTab('wishes');
    startMyWishesListener();
    startFriendsListener();
    startRequestsListener();
    startSentRequestsListener();
  } else {
    currentUser = null;
    friendsCache = [];
    $('#view-app').classList.add('hidden');
    $('#view-auth').classList.remove('hidden');
  }
});

// ---------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------
$all('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  $all('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $all('.tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = name === 'friend-view' ? $('#tab-friend-view') : $(`#tab-${name}`);
  panel.classList.remove('hidden');
}

$('#back-to-friends').addEventListener('click', () => {
  teardownFriendView();
  switchTab('friends');
});

// ---------------------------------------------------------------
// MOJA LISTA ŻYCZEŃ (owner never sees reservation info)
// ---------------------------------------------------------------
$('#form-add-wish').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#wish-title').value.trim();
  const desc = $('#wish-desc').value.trim();
  if (!title) return;
  try {
    await db.collection('wishes').add({
      ownerId: currentUser.uid,
      ownerName: currentUser.displayName,
      title,
      description: desc,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    $('#form-add-wish').reset();
    showToast('Dodano do Twojej listy.');
  } catch (err) {
    showToast('Nie udało się dodać życzenia.');
    console.error(err);
  }
});

function startMyWishesListener() {
  const unsub = db.collection('wishes')
    .where('ownerId', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      const list = $('#my-wishes-list');
      list.innerHTML = '';
      $('#my-wishes-empty').classList.toggle('hidden', !snap.empty);
      snap.forEach(doc => {
        const w = doc.data();
        const tpl = $('#tpl-wish-own').content.cloneNode(true);
        tpl.querySelector('.wish-title').textContent = w.title;
        const descEl = tpl.querySelector('.wish-desc');
        if (w.description) descEl.textContent = w.description; else descEl.remove();
        const delBtn = tpl.querySelector('.btn-delete-wish');
        delBtn.addEventListener('click', () => deleteWish(doc.id));
        list.appendChild(tpl);
      });
    }, err => console.error('my wishes listener', err));
  activeListeners.push(unsub);
}

async function deleteWish(wishId) {
  try {
    await db.collection('wishes').doc(wishId).delete();
    showToast('Usunięto życzenie.');
  } catch (err) {
    showToast('Nie udało się usunąć.');
    console.error(err);
  }
}

// ---------------------------------------------------------------
// ZNAJOMI
// ---------------------------------------------------------------
$('#form-add-friend').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#friend-email').value.trim().toLowerCase();
  if (!email) return;
  if (email === currentUser.email.toLowerCase()) {
    showToast('To Twój własny adres e-mail.');
    return;
  }
  try {
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    if (q.empty) {
      showToast('Nie znaleziono użytkownika o tym adresie e-mail.');
      return;
    }
    const targetDoc = q.docs[0];
    const targetUid = targetDoc.id;

    if (friendsCache.some(f => f.uid === targetUid)) {
      showToast('Ta osoba jest już Twoim znajomym.');
      return;
    }
    const existing = await db.collection('friendRequests')
      .where('from', '==', currentUser.uid)
      .where('to', '==', targetUid)
      .where('status', '==', 'pending')
      .limit(1).get();
    if (!existing.empty) {
      showToast('Zaproszenie zostało już wysłane.');
      return;
    }

    await db.collection('friendRequests').add({
      from: currentUser.uid,
      fromName: currentUser.displayName,
      to: targetUid,
      toName: targetDoc.data().displayName,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    $('#form-add-friend').reset();
    showToast('Zaproszenie wysłane.');
  } catch (err) {
    showToast('Nie udało się wysłać zaproszenia.');
    console.error(err);
  }
});

function startFriendsListener() {
  const unsub = db.collection('users').doc(currentUser.uid)
    .onSnapshot(async doc => {
      const uids = (doc.data() && doc.data().friends) || [];
      if (uids.length === 0) {
        friendsCache = [];
        renderFriends([]);
        return;
      }
      const profiles = await Promise.all(uids.map(uid =>
        db.collection('users').doc(uid).get().then(d => ({ uid, ...d.data() }))
      ));
      friendsCache = profiles;
      renderFriends(profiles);
    }, err => console.error('friends listener', err));
  activeListeners.push(unsub);
}

function renderFriends(profiles) {
  const list = $('#friends-list');
  list.innerHTML = '';
  $('#friends-empty').classList.toggle('hidden', profiles.length !== 0);
  profiles
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    .forEach(f => {
      const tpl = $('#tpl-friend-item').content.cloneNode(true);
      tpl.querySelector('.friend-name').textContent = f.displayName || f.email;
      tpl.querySelector('.view-friend-list').addEventListener('click', () => openFriendView(f));
      list.appendChild(tpl);
    });
}

// ---------------------------------------------------------------
// ZAPROSZENIA
// ---------------------------------------------------------------
function startRequestsListener() {
  const unsub = db.collection('friendRequests')
    .where('to', '==', currentUser.uid)
    .where('status', '==', 'pending')
    .onSnapshot(snap => {
      const list = $('#requests-list');
      list.innerHTML = '';
      $('#requests-empty').classList.toggle('hidden', !snap.empty);
      const badge = $('#req-badge');
      badge.textContent = snap.size;
      badge.classList.toggle('hidden', snap.empty);

      snap.forEach(doc => {
        const r = doc.data();
        const tpl = $('#tpl-request-item').content.cloneNode(true);
        tpl.querySelector('.request-name').textContent = `${r.fromName || 'Ktoś'} chce dodać Cię do znajomych`;
        tpl.querySelector('.btn-accept').addEventListener('click', () => respondToRequest(doc.id, r, true));
        tpl.querySelector('.btn-decline').addEventListener('click', () => respondToRequest(doc.id, r, false));
        list.appendChild(tpl);
      });
    }, err => console.error('requests listener', err));
  activeListeners.push(unsub);
}

async function respondToRequest(reqId, req, accept) {
  try {
    if (accept) {
      // Każdy może aktualizować WYŁĄCZNIE własny dokument (tak stanowią reguły
      // bezpieczeństwa). Osoba akceptująca dopisuje nadawcę do swoich znajomych
      // od razu; nadawca dopisze odbiorcę u siebie, gdy tylko zauważy status
      // "accepted" (patrz startSentRequestsListener niżej).
      await db.collection('users').doc(currentUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayUnion(req.from)
      });
      await db.collection('friendRequests').doc(reqId).update({ status: 'accepted' });
      showToast(`Jesteście teraz znajomymi z ${req.fromName || 'tą osobą'}.`);
    } else {
      await db.collection('friendRequests').doc(reqId).update({ status: 'declined' });
      showToast('Zaproszenie odrzucone.');
    }
  } catch (err) {
    showToast('Coś poszło nie tak.');
    console.error(err);
  }
}

// Nasłuchuje na WYSŁANE przeze mnie zaproszenia, które właśnie zostały
// zaakceptowane, i dopisuje drugą osobę do MOJEJ własnej listy znajomych
// (to musi zrobić klient nadawcy — reguły nie pozwalają zrobić tego za niego).
function startSentRequestsListener() {
  const unsub = db.collection('friendRequests')
    .where('from', '==', currentUser.uid)
    .where('status', '==', 'accepted')
    .onSnapshot(async snap => {
      for (const doc of snap.docs) {
        const req = doc.data();
        try {
          await db.collection('users').doc(currentUser.uid).update({
            friends: firebase.firestore.FieldValue.arrayUnion(req.to)
          });
          await db.collection('friendRequests').doc(doc.id).delete();
        } catch (err) {
          console.error('finalizing accepted request', err);
        }
      }
    }, err => console.error('sent requests listener', err));
  activeListeners.push(unsub);
}

// ---------------------------------------------------------------
// LISTA ŻYCZEŃ ZNAJOMEGO (reservation visible to everyone but owner)
// ---------------------------------------------------------------
function teardownFriendView() {
  if (!currentFriendView) return;
  if (currentFriendView.unsub) currentFriendView.unsub();
  (currentFriendView.resUnsubs || []).forEach(u => u());
  currentFriendView = null;
}

function openFriendView(friend) {
  teardownFriendView();
  $('#friend-view-title').textContent = `Lista życzeń — ${friend.displayName || friend.email}`;
  switchTab('friend-view');

  currentFriendView = { friend, unsub: null, resUnsubs: [] };

  const unsub = db.collection('wishes')
    .where('ownerId', '==', friend.uid)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      renderFriendWishes(snap, friend);
    }, err => console.error('friend wishes listener', err));

  currentFriendView.unsub = unsub;
}

function renderFriendWishes(snap, friend) {
  // clear previous per-wish reservation listeners for this view before re-rendering
  if (currentFriendView) {
    (currentFriendView.resUnsubs || []).forEach(u => u());
    currentFriendView.resUnsubs = [];
  }
  const list = $('#friend-wishes-list');
  list.innerHTML = '';
  $('#friend-wishes-empty').classList.toggle('hidden', !snap.empty);

  snap.forEach(doc => {
    const w = doc.data();
    const tpl = $('#tpl-wish-friend').content.cloneNode(true);
    tpl.querySelector('.wish-title').textContent = w.title;
    const descEl = tpl.querySelector('.wish-desc');
    if (w.description) descEl.textContent = w.description; else descEl.remove();

    const li = tpl.querySelector('.wish-card');
    const reservedEl = li.querySelector('.wish-reserved-by');
    const claimBtn = li.querySelector('.btn-claim');
    claimBtn.textContent = '…';
    claimBtn.disabled = true;

    list.appendChild(li);

    // Per-wish reservation listener
    const resUnsub = db.collection('wishes').doc(doc.id).collection('reservation').doc('info')
      .onSnapshot(resDoc => {
        claimBtn.disabled = false;
        if (resDoc.exists) {
          const r = resDoc.data();
          const isMe = r.reservedBy === currentUser.uid;
          reservedEl.textContent = isMe
            ? 'Ty kupujesz ten prezent.'
            : `Kupuje: ${r.reservedByName || 'ktoś inny'}.`;
          reservedEl.classList.remove('hidden');
          claimBtn.textContent = isMe ? 'Zrezygnuj' : 'Zarezerwowane';
          claimBtn.classList.toggle('claimed', isMe);
          claimBtn.disabled = !isMe;
          claimBtn.onclick = isMe ? () => unclaimWish(doc.id) : null;
        } else {
          reservedEl.classList.add('hidden');
          claimBtn.textContent = 'Ja to kupię!';
          claimBtn.classList.remove('claimed');
          claimBtn.onclick = () => claimWish(doc.id, friend);
        }
      }, err => console.error('reservation listener', err));

    if (currentFriendView) currentFriendView.resUnsubs.push(resUnsub);
  });
}

async function claimWish(wishId, friend) {
  try {
    await db.collection('wishes').doc(wishId).collection('reservation').doc('info').set({
      reservedBy: currentUser.uid,
      reservedByName: currentUser.displayName,
      reservedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`Zarezerwowano! ${friend.displayName || ''} się nie dowie.`);
  } catch (err) {
    showToast('Nie udało się zarezerwować.');
    console.error(err);
  }
}

async function unclaimWish(wishId) {
  try {
    await db.collection('wishes').doc(wishId).collection('reservation').doc('info').delete();
    showToast('Anulowano rezerwację.');
  } catch (err) {
    showToast('Nie udało się anulować.');
    console.error(err);
  }
}

// ---------------------------------------------------------------
// PWA: rejestracja service workera (instalowalność na Androidzie)
// ---------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
}