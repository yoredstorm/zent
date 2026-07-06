function applyFlowPatch(session, patch) {
  if (!patch || !Object.keys(patch).length) return session;
  const prevFlow = session.flow || {};
  const nextFlow = { ...prevFlow, ...patch };
  if (patch.checkout || prevFlow.checkout) {
    nextFlow.checkout = { ...(prevFlow.checkout || {}), ...(patch.checkout || {}) };
  }
  return { ...session, flow: nextFlow };
}

if (typeof module !== 'undefined') {
  module.exports = { applyFlowPatch };
}
