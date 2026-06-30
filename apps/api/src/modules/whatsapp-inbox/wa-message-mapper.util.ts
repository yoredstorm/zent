export type WaMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'sticker'
  | 'unknown';

export function mapOpenWaMessageType(type?: string, hasMedia?: boolean): WaMessageType {
  const t = (type || '').toLowerCase();
  if (t === 'chat' || t === 'text' || t === '') return hasMedia ? 'unknown' : 'text';
  if (t === 'image' || t === 'sticker') return t as WaMessageType;
  if (t === 'document' || t === 'application') return 'document';
  if (t === 'audio' || t === 'ptt') return 'audio';
  if (t === 'video') return 'video';
  if (hasMedia) return 'unknown';
  return 'text';
}

export function mediaPlaceholder(type: WaMessageType): string {
  switch (type) {
    case 'image':
      return '[imagen]';
    case 'document':
      return '[documento]';
    case 'audio':
      return '[audio]';
    case 'video':
      return '[video]';
    case 'sticker':
      return '[sticker]';
    default:
      return '[media]';
  }
}

export function messagePreview(body: string, messageType?: string, caption?: string | null): string {
  const type = (messageType || 'text') as WaMessageType;
  if (type !== 'text') {
    return caption?.trim() || mediaPlaceholder(type);
  }
  return body;
}

export interface OpenWaChatMessage {
  id?: string;
  from?: string;
  body?: string;
  text?: string;
  type?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
  caption?: string;
  mediaUrl?: string;
  mimetype?: string;
  mimeType?: string;
  timestamp?: string;
  media?: { url?: string; mimetype?: string; mimeType?: string };
}

export function parseOpenWaMessage(raw: OpenWaChatMessage) {
  const messageType = mapOpenWaMessageType(raw.type, raw.hasMedia);
  const caption = raw.caption?.trim() || null;
  const mediaUrl = raw.mediaUrl || raw.media?.url || null;
  const mimeType = raw.mimetype || raw.mimeType || raw.media?.mimetype || raw.media?.mimeType || null;
  const textBody = (raw.body || raw.text || '').trim();
  const body = textBody || caption || mediaPlaceholder(messageType);
  const rawDate = raw.timestamp ? new Date(raw.timestamp) : new Date();
  const createdAt = Number.isNaN(rawDate.getTime()) ? new Date() : rawDate;

  return {
    waMessageId: raw.id || null,
    messageType,
    body,
    caption,
    mediaUrl,
    mimeType,
    fromMe: raw.fromMe === true,
    createdAt,
  };
}
