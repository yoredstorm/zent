/** Clave unificada: `waSessionId::220473589768319@lid` o solo el JID. */
export function buildConversationId(
  waChatId: string,
  waSessionId?: string | null,
): string {
  const jid = parseWaConversationId(waChatId).waChatId;
  return waSessionId ? `${waSessionId}::${jid}` : jid;
}

export function parseWaConversationId(key: string): {
  waSessionId: string | null;
  waChatId: string;
} {
  const idx = key.indexOf('::');
  if (idx > 0) {
    return {
      waSessionId: key.slice(0, idx),
      waChatId: key.slice(idx + 2),
    };
  }
  return { waSessionId: null, waChatId: key };
}

export function shortWaChatLabel(waChatId: string): string {
  const { waChatId: jid } = parseWaConversationId(waChatId);
  const digits = jid.match(/^(\d+)@/);
  if (digits) return `+${digits[1]}`;
  return jid.replace(/@.*/, '');
}
