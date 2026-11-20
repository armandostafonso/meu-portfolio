import { firebaseConfig } from './firebase-config.js';
import { mergeProjects } from './portfolio-merge.js';

const ui = window.portfolioUI;
const $ = id => document.getElementById(id);
const status = message => $('syncStatus').textContent = message;
const configured = [firebaseConfig.apiKey, firebaseConfig.projectId, firebaseConfig.appId]
  .every(value => value && !value.includes('COLOCA_AQUI'));

if (!configured) {
  status('Sincronização por configurar. Os dados ficam neste dispositivo.');
} else {
  connect().catch(error => status('Erro ao iniciar a sincronização: ' + (error.code || error.message)));
}

async function connect() {
  const [{ initializeApp }, authSdk, firestore] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  const db = firestore.getFirestore(app);
  const { doc, onSnapshot, runTransaction, serverTimestamp } = firestore;
  let session;

  function renderSession(current) {
    ui.show(current.pending.reduce(
      (projects, change) => change.replace ? change.local : mergeProjects(change.base, change.local, projects),
      current.remote
    ));
  }

  async function flush(current) {
    if (session !== current || current.saving || !current.loaded || !current.pending.length) return;
    current.saving = true;
    status('A sincronizar alterações…');
    try {
      while (session === current && current.pending.length) {
        const change = current.pending[0];
        const committed = await runTransaction(db, async transaction => {
          const snap = await transaction.get(current.ref);
          const record = snap.data();
          const latest = record?.projects ?? [];
          const projects = change.replace ? change.local : mergeProjects(change.base, change.local, latest);
          const revision = (record?.revision ?? 0) + 1;
          transaction.set(current.ref, { projects, revision, updatedAt: serverTimestamp(), schemaVersion: 1 });
          return { projects, revision };
        });
        if (session !== current) return;
        current.pending.shift();
        if (committed.revision >= current.revision) {
          current.remote = committed.projects;
          current.revision = committed.revision;
        }
        persist(current);
        renderSession(current);
      }
      if (session === current) status('✓ Sincronizado com Firebase');
    } catch (error) {
      if (session === current) status('Alterações guardadas neste dispositivo. Usa «Tentar sincronizar». (' + (error.code || error.message) + ')');
    } finally {
      current.saving = false;
    }
  }

  function persist(current) {
    localStorage.setItem(current.key, JSON.stringify({ projects: current.remote, pending: current.pending }));
  }

  function watch(current) {
    current.stop?.();
    current.stop = onSnapshot(current.ref, { includeMetadataChanges: true }, snap => {
      if (session !== current || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      const record = snap.data();
      const revision = record?.revision ?? 0;
      if (revision < current.revision) return;
      current.remote = record?.projects ?? [];
      current.revision = revision;
      current.loaded = true;
      persist(current);
      if (current.saving) return;
      renderSession(current);
      if (current.pending.length) void flush(current);
      else status('✓ Sincronizado com Firebase');
    }, error => {
      if (session === current) status('Erro de leitura: ' + error.code + '. Usa «Tentar sincronizar».');
    });
  }

  async function authenticate(create) {
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if (!email || !password) {
      status('Introduz o email e a palavra-passe.');
      return;
    }
    status('A autenticar…');
    try {
      const action = create ? authSdk.createUserWithEmailAndPassword : authSdk.signInWithEmailAndPassword;
      await action(auth, email, password);
      $('authPassword').value = '';
    } catch (error) {
      status('Erro de autenticação: ' + error.code);
    }
  }

  $('signIn').onclick = () => authenticate(false);
  $('signUp').onclick = () => authenticate(true);
  $('signOut').onclick = async () => {
    if (session?.pending.length) {
      status('Sincroniza as alterações pendentes antes de terminar sessão ou exporta uma cópia.');
      if (!confirm('Há alterações por sincronizar. Terminar sessão e mantê-las neste dispositivo?')) return;
    }
    await authSdk.signOut(auth).catch(error => status('Erro ao terminar sessão: ' + error.code));
  };
  $('retrySync').onclick = () => {
    if (session?.pending.length && session.loaded) void flush(session);
    else if (session) watch(session);
  };
  window.addEventListener('online', () => {
    if (session) watch(session);
  });

  authSdk.onAuthStateChanged(auth, user => {
    session?.stop?.();
    session = undefined;
    ui.sync = undefined;
    $('authPanel').classList.toggle('hidden', !!user);
    $('signedPanel').classList.toggle('hidden', !user);
    if (!user) {
      ui.guest();
      status('Sem sessão. Os dados ficam neste dispositivo.');
      return;
    }

    const key = 'meu-portfolio-v2:' + firebaseConfig.projectId + ':' + user.uid;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch { saved = null; }
    const current = {
      key,
      remote: saved?.projects ?? [],
      pending: saved?.pending ?? [],
      ref: doc(db, 'users', user.uid, 'portfolio', 'main'),
      loaded: false,
      saving: false,
      revision: 0
    };
    session = current;
    ui.sync = (base, local, replace) => {
      current.pending.push({ base, local, replace });
      persist(current);
      status('Alterações pendentes de sincronização.');
      void flush(current);
    };
    renderSession(current);
    $('signedEmail').textContent = 'Sessão: ' + user.email;
    status('A ligar à base de dados…');
    watch(current);
  });
}
