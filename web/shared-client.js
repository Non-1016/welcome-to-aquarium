import {initializeApp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {getAuth, signInAnonymously, signInWithEmailAndPassword, signOut,
  setPersistence, browserSessionPersistence} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {getDatabase, ref, get, set, update, onValue, push, runTransaction,
  serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import {applyAction, checkState, initialState} from "./state-core.mjs";

const config = window.AQUARIUM_SESSION;
const settings = window.AQUARIUM_FIREBASE;
if (!config || !/^[A-Za-z0-9_-]{1,64}$/.test(config.sessionId)) throw new Error("セッション設定が不正です。");
const app = initializeApp(settings);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const sessionPath = "sessions/" + config.sessionId;
const stateRef = ref(db, sessionPath + "/state");
export const isKP = () => auth.currentUser?.uid === settings.kpUid;
export const loginKP = async (email, password) => {
  await setPersistence(auth, browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, password);
  if (!isKP()) {
    await signOut(auth);
    throw new Error("このアカウントにはKP権限がありません。");
  }
};
export const logoutKP = () => signOut(auth);

function message(error) {
  if (error?.code === "auth/invalid-credential") return "メールアドレスまたはパスワードを確認してください。";
  if (error?.code === "PERMISSION_DENIED" || error?.code === "permission-denied") return "KPの参加承認またはFirebaseのルールを確認してください。";
  if (error?.code?.startsWith("auth/")) return "接続認証に失敗しました。Firebaseの認証設定とWebアプリ設定を確認してください。（" + error.code + "）";
  return error?.message || "接続できません。通信を確認してください。";
}
export {message as errorMessage};

export class SharedStore {
  constructor() {
    this.state = null;
    this.connected = false;
    this.listeners = new Set();
    this.stops = [];
  }
  emit() { for (const listener of this.listeners) listener(); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async start() {
    await new Promise((resolve, reject) => {
      this.stops.push(onValue(stateRef, snapshot => {
        try {
          const state = snapshot.val();
          checkState(state, config);
          this.state = state;
          this.emit();
          resolve();
        } catch (error) { this.state = null; this.emit(); reject(error); }
      }, error => {
        this.state = null;
        this.emit();
        reject(error);
      }));
    });
    // 接続状態はデータ取得後から監視。切断時はキャッシュで成功扱いしない。
    await new Promise(resolve => {
      this.stops.push(onValue(ref(db, ".info/connected"), snapshot => {
        this.connected = snapshot.val() === true;
        this.emit();
        resolve();
      }));
    });
    return this;
  }
  stop() { this.stops.forEach(stop => stop()); this.stops = []; this.listeners.clear(); }
  readRecord(key) {
    if (!this.connected || !this.state) throw new Error("共有情報に接続できません。通信を確認してください。");
    const field = key.split(":").at(-1);
    if (!["registrations", "permits", "exits"].includes(field)) throw new Error("保存先が不正です。");
    return structuredClone(this.state[field] || {});
  }
  async act(action) {
    if (!this.connected || !this.state) throw new Error("共有情報に接続できません。");
    const eventId = push(ref(db, sessionPath + "/state/events")).key;
    const actor = auth.currentUser.uid;
    const result = await runTransaction(stateRef, current => {
      return applyAction(current, config, action, eventId, actor, serverTimestamp());
    }, {applyLocally: false});
    if (!result.committed) throw new Error("保存を完了できませんでした。");
    this.state = result.snapshot.val();
    this.emit();
  }
}

export async function createSession() {
  if (!isKP()) throw new Error("KPログインが必要です。");
  await runTransaction(stateRef, current => {
    if (current !== null) return; // 既存セッションは上書きしない。
    return initialState(config);
  }, {applyLocally: false});
}

export async function approve(uid) {
  if (!isKP()) throw new Error("KPログインが必要です。");
  await update(ref(db, sessionPath), {
    ["members/" + uid]: true,
    ["joinRequests/" + uid]: null
  });
}

export async function connectParticipant() {
  const panel = document.getElementById("shared-gate");
  panel.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = "館内システムに接続";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "共有情報を確認しています…";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "KPに接続を申請する";
  button.hidden = true;
  panel.append(title, status, button);
  await auth.authStateReady();
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
  } catch (error) {
    status.textContent = message(error) + " 設定を確認してページを再読み込みしてください。";
    return new Promise(() => {});
  }
  const uid = auth.currentUser.uid;
  const code = document.createElement("p");
  code.textContent = "接続確認ID：" + uid.slice(-8) + "（このIDをKPに伝えてください）";
  panel.append(code);
  let accepted = false;
  try { accepted = (await get(stateRef)).exists(); } catch {}
  if (!accepted) {
    status.textContent = "この端末の参加承認が必要です。";
    button.hidden = false;
    await new Promise(resolve => {
      let requested = false;
      let timer;
      button.addEventListener("click", async () => {
        if (requested) return;
        button.disabled = true;
        try {
          await set(ref(db, sessionPath + "/joinRequests/" + uid), true);
          requested = true;
          status.textContent = "KPの参加承認を待っています。この画面を開いたままお待ちください。";
          const poll = async () => {
            try {
              if ((await get(stateRef)).exists()) { clearTimeout(timer); resolve(); return; }
            } catch {}
            timer = setTimeout(poll, 3000);
          };
          poll();
        } catch (error) {
          status.textContent = message(error);
          button.disabled = false;
        }
      });
    });
  }
  const store = new SharedStore();
  try { await store.start(); }
  catch (error) {
    store.stop();
    status.textContent = message(error) + " 設定を確認して再読み込みしてください。";
    return new Promise(() => {});
  }
  panel.remove();
  const badge = document.createElement("p");
  badge.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:1000;background:#fff;color:#123;padding:6px 12px;border:1px solid #678;border-radius:6px;font-size:12px";
  badge.setAttribute("role", "status");
  const refreshBadge = () => {
    badge.textContent = store.connected && store.state ? "共有情報に接続中" : "接続が切れています。操作を止め、通信を確認してください。";
  };
  store.subscribe(refreshBadge);
  refreshBadge();
  document.body.append(badge);
  return store;
}
