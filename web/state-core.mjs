// FirebaseやDOMに依存しない、共有状態の更新処理。
export function fingerprint(config) {
  return JSON.stringify(config.visitors.map(({entryId, name, species, permitId}) =>
    [entryId, name, species || "人間", permitId]));
}

export function initialState(config) {
  return {meta: {schema: 1, roster: fingerprint(config)}, registrations: {}, permits: {}, exits: {}, events: {}};
}

export function checkState(state, config) {
  if (!state || state.meta?.schema !== 1 || state.meta.roster !== fingerprint(config)) {
    throw new Error("セッションが未作成、または探索者の設定がKPと一致しません。KPへお知らせください。");
  }
}

export function applyAction(current, config, action, eventId, actor, at) {
  checkState(current, config);
  const pc = config.visitors.find(pc => pc.entryId === action.entryId);
  if (!pc) throw new Error("入館番号が見つかりません。");
  const next = structuredClone(current);
  next.registrations ||= {};
  next.permits ||= {};
  next.exits ||= {};
  next.events ||= {};
  const id = pc.entryId;
  const before = next.registrations[id] === "visitor" ? "visitor" : "specimen";
  if (action.type === "registration") {
    if (String(action.name).replace(/\s+/g, "") !== pc.name.replace(/\s+/g, "")) {
      throw new Error("入館番号と氏名が一致しません。");
    }
    if (!["visitor", "specimen"].includes(action.status)) throw new Error("登録区分が不正です。");
    if (before === action.status) return current;
    next.registrations[id] = action.status;
    delete next.permits[id];
    delete next.exits[id];
  } else if (action.type === "permit") {
    if (before !== "visitor") throw new Error("登録区分が来館者ではありません。");
    if (next.permits[id] === pc.permitId) return current;
    next.permits[id] = pc.permitId;
  } else if (action.type === "exit") {
    if (before !== "visitor" || next.permits[id] !== pc.permitId) {
      throw new Error("来館者登録と退館許可証を確認してください。");
    }
    if (action.permitId !== pc.permitId) throw new Error("許可番号が一致しません。");
    if (next.exits[id] === true) return current;
    next.exits[id] = true;
  } else {
    throw new Error("操作が不正です。");
  }
  next.events[eventId] = {
    type: action.type, entryId: id, before,
    after: action.type === "registration" ? action.status : before,
    actor, at
  };
  return next;
}
