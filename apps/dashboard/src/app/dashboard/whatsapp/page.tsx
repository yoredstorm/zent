'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/useRealtime';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';

type MainTab = 'inbox' | 'session';
type InboxFilter = '' | 'handoff' | 'orders' | 'carts';

interface Conversation {
  chatId: string;
  waChatId?: string;
  contactPhone: string | null;
  contactDisplayName: string | null;
  customerName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  chatState: string | null;
  needsHandoff: boolean;
  hasNewOrder: boolean;
  hasActiveCart: boolean;
  cartItemCount: number;
  cartTotal: number | null;
  cartMinutesLeft: number | null;
  unreadHint: boolean;
  lastSource: string;
}

interface WaMessage {
  id: string;
  chatId: string;
  body: string;
  direction: string;
  source: string;
  messageType?: string;
  mediaUrl?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  createdAt: string;
}

const QUICK_EMOJIS = ['😀', '😂', '👍', '❤️', '🙏', '✅', '🎉', '😊', '👋', '🔥'];

const FILTER_OPTIONS: { id: InboxFilter; label: string }[] = [
  { id: '', label: 'Todas' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'orders', label: 'Pedidos nuevos' },
  { id: 'carts', label: 'Carritos activos' },
];

function encodeChatId(chatId: string) {
  return encodeURIComponent(chatId);
}

function displayName(c: Conversation): string {
  return (
    c.contactDisplayName ||
    c.customerName ||
    (c.contactPhone ? (c.contactPhone.startsWith('+') ? c.contactPhone : `+${c.contactPhone}`) : null) ||
    'Contacto'
  );
}

function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.startsWith('+') ? phone : `+${phone}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString();
}

function resolveMediaSrc(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/api/')) return url;
  if (url.startsWith('/')) return `/api${url}`;
  return url;
}

function MessageBubble({ m }: { m: WaMessage }) {
  const isOut = m.direction === 'OUT';
  const type = m.messageType || 'text';
  const mediaSrc = resolveMediaSrc(m.mediaUrl);

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow ${
          isOut ? 'bg-green-100' : 'bg-white'
        }`}
      >
        {isOut && (
          <div className="text-[10px] text-gray-500 mb-1">
            {m.source === 'agent' ? 'Asesor' : 'Bot'}
          </div>
        )}
        {type === 'image' && mediaSrc && (
          <a href={mediaSrc} target="_blank" rel="noopener noreferrer">
            <img
              src={mediaSrc}
              alt={m.caption || 'imagen'}
              className="max-w-full rounded mb-1 max-h-64 object-contain"
            />
          </a>
        )}
        {type === 'document' && mediaSrc && (
          <a
            href={mediaSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline block mb-1"
          >
            📎 Documento
          </a>
        )}
        {type !== 'text' && type !== 'image' && type !== 'document' && !mediaSrc && (
          <div className="text-gray-500 italic mb-1">{m.body}</div>
        )}
        {(type === 'text' || m.caption || (type === 'image' && m.body && m.body !== '[imagen]')) && (
          <div className="whitespace-pre-wrap break-words">
            {type === 'text' ? m.body : m.caption || (m.body !== '[imagen]' && m.body !== '[documento]' ? m.body : '')}
          </div>
        )}
        <div className="text-[10px] text-gray-400 mt-1 text-right">{formatTime(m.createdAt)}</div>
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const [mainTab, setMainTab] = useState<MainTab>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [qr, setQr] = useState('');
  const [openwaUrl, setOpenwaUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(() => {
    const q = filter ? `?filter=${filter}` : '';
    api.get(`/whatsapp/conversations${q}`).then(setConversations).catch(() => {
      toast.error('No se pudo cargar conversaciones');
    });
  }, [filter]);

  const loadMessages = useCallback(async (chatId: string, showLoader = true, sync = false) => {
    if (showLoader) setLoadingMessages(true);
    try {
      const rows = await api.get<WaMessage[]>(
        `/whatsapp/conversations/${encodeChatId(chatId)}/messages?limit=80${sync ? '&sync=1' : '&sync=0'}`,
      );
      setMessages(rows.reverse());
    } catch {
      toast.error('No se pudieron cargar los mensajes');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadMeta = useCallback((chatId: string) => {
    api
      .get(`/whatsapp/conversations/${encodeChatId(chatId)}/meta`)
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    api.get('/openwa/config').then((c) => setOpenwaUrl(c.publicUrl)).catch(() => {});
  }, []);

  useRealtime(
    useCallback(
      (event) => {
        if (
          event.type === 'message.received' ||
          event.type === 'message.sent' ||
          event.type === 'cart.hold.updated' ||
          event.type === 'order.created'
        ) {
          loadConversations();
          const chatId = event.payload?.chatId as string | undefined;
          if (chatId && selected?.chatId === chatId) {
            loadMessages(chatId, false);
          } else if (event.type === 'message.received' && chatId) {
            toast.message('Nuevo mensaje de WhatsApp', {
              description: displayName(
                conversations.find((c) => c.chatId === chatId) ?? {
                  chatId,
                  contactDisplayName: null,
                  customerName: null,
                  contactPhone: null,
                } as Conversation,
              ),
            });
          }
        }
      },
      [loadConversations, loadMessages, selected?.chatId, conversations],
    ),
  );

  const selectConversation = (c: Conversation) => {
    setSelected(c);
    setPendingFile(null);
    setMessages([]);
    loadMessages(c.chatId, true, true);
    loadMeta(c.chatId);
  };

  const handleSync = async () => {
    if (!selected) return;
    setSyncing(true);
    try {
      await api.post(`/whatsapp/conversations/${encodeChatId(selected.chatId)}/sync`);
      await loadMessages(selected.chatId, false);
      loadConversations();
      toast.success('Conversación actualizada');
    } catch {
      toast.error('No se pudo sincronizar con OpenWA');
    } finally {
      setSyncing(false);
    }
  };

  const handleSend = async () => {
    if (!selected || sending) return;
    if (!reply.trim() && !pendingFile) return;

    setSending(true);
    try {
      if (pendingFile) {
        const isPdf = pendingFile.type === 'application/pdf' || pendingFile.name.endsWith('.pdf');
        const uploadPath = isPdf ? '/uploads/document' : '/uploads/image';
        const uploaded = await api.upload<{ url: string; publicUrl?: string }>(
          uploadPath,
          pendingFile,
        );
        const mediaUrl = uploaded.publicUrl || uploaded.url;
        await api.post(`/whatsapp/conversations/${encodeChatId(selected.chatId)}/send-media`, {
          type: isPdf ? 'document' : 'image',
          url: mediaUrl,
          caption: reply.trim() || undefined,
          mimeType: pendingFile.type || undefined,
        });
        setPendingFile(null);
        setReply('');
      } else {
        await api.post(`/whatsapp/conversations/${encodeChatId(selected.chatId)}/send`, {
          text: reply.trim(),
        });
        setReply('');
      }
      await loadMessages(selected.chatId, false);
      loadConversations();
    } catch {
      toast.error('No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  const loadStatus = async () => {
    try {
      const data = await api.get('/openwa/status');
      setStatus(data);
    } catch {
      setStatus({ status: 'error' });
    }
  };

  const handleGetQR = async () => {
    try {
      const data = await api.get('/openwa/qr');
      if (data.qr) {
        setQr(data.qr);
        toast.success('QR generado');
      } else {
        toast.error(data.error || 'No se pudo obtener el QR');
      }
    } catch {
      toast.error('No se pudo obtener el QR');
    }
  };

  useEffect(() => {
    if (mainTab === 'session') loadStatus();
  }, [mainTab]);

  const statusLabel: Record<string, string> = {
    connected: 'Conectado',
    ready: 'Listo',
    disconnected: 'Desconectado',
    connecting: 'Conectando',
    qr: 'Esperando QR',
    no_sessions: 'Sin sesiones',
    error: 'Error',
  };

  const statusTone = (s?: string): 'success' | 'warning' | 'danger' | 'default' => {
    if (s === 'connected' || s === 'ready') return 'success';
    if (s === 'connecting' || s === 'qr') return 'warning';
    if (s === 'error' || s === 'disconnected') return 'danger';
    return 'default';
  };

  return (
    <div>
      <PageHeader title="WhatsApp" />

      <div className="mb-6">
        <Tabs
          value={mainTab}
          onChange={(id) => setMainTab(id as MainTab)}
          items={[
            { id: 'inbox', label: 'Bandeja' },
            { id: 'session', label: 'Sesión' },
          ]}
        />
      </div>

      {mainTab === 'inbox' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 h-[calc(100vh-12rem)] min-h-[500px]">
          <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card lg:col-span-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((f) => (
                  <button
                    key={f.id || 'all'}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className="rounded-full transition-opacity hover:opacity-80"
                  >
                    <Badge tone={filter === f.id ? 'success' : 'default'}>{f.label}</Badge>
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="!min-h-0 !px-2 !py-1.5"
                onClick={loadConversations}
                title="Refrescar lista"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <EmptyState
                  icon={MessageCircle}
                  title="Sin conversaciones"
                  description="Abre un chat para sincronizar desde OpenWA."
                />
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.chatId}
                    type="button"
                    onClick={() => selectConversation(c)}
                    className={`w-full border-b border-slate-100 p-3 text-left transition-colors hover:bg-slate-50 ${
                      selected?.chatId === c.chatId ? 'bg-brand-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{displayName(c)}</span>
                      <span className="shrink-0 text-xs text-slate-400">{formatTime(c.lastMessageAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{c.lastMessage}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.needsHandoff && <Badge tone="warning">Handoff</Badge>}
                      {c.hasNewOrder && <Badge tone="brand">Pedido nuevo</Badge>}
                      {c.hasActiveCart && (
                        <Badge tone="brand">
                          Carrito{c.cartItemCount > 0 ? ` (${c.cartItemCount})` : ''}
                        </Badge>
                      )}
                      {c.unreadHint && <Badge tone="success">Nuevo</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card lg:col-span-2">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                Selecciona una conversación
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
                  <div>
                    <div className="font-semibold text-slate-900">{displayName(selected)}</div>
                    {formatPhone(selected.contactPhone) && (
                      <div className="text-xs text-slate-500">{formatPhone(selected.contactPhone)}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {meta?.openOrder && (
                      <Link
                        href="/dashboard/orders"
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        Pedido #{meta.openOrder.id.slice(0, 8)} ({meta.openOrder.status})
                      </Link>
                    )}
                    {openwaUrl && (
                      <a
                        href={openwaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-brand-600"
                      >
                        Abrir en OpenWA
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      className="!min-h-0 !px-2 !py-1 text-xs"
                      onClick={handleSync}
                      loading={syncing}
                    >
                      {syncing ? 'Sincronizando…' : 'Actualizar'}
                    </Button>
                  </div>
                </div>

                {meta && (
                  <div className="space-y-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <div className="flex flex-wrap gap-3">
                      {meta.session?.state && <span>Bot: {meta.session.state}</span>}
                      {meta.customer && (
                        <Link href="/dashboard/customers" className="font-medium text-brand-600 hover:underline">
                          Ver cliente
                        </Link>
                      )}
                      <Link href="/dashboard/inventory" className="font-medium text-brand-600 hover:underline">
                        Inventario / carritos
                      </Link>
                    </div>
                    {meta.activeCart && (
                      <div className="rounded-xl border border-brand-200 bg-brand-50 p-2 text-brand-900">
                        <div className="mb-1 font-medium">
                          🛒 Carrito incompleto — S/ {Number(meta.activeCart.total).toFixed(2)}
                          {meta.activeCart.minutesLeft != null && (
                            <span className="ml-2 font-normal text-brand-700">
                              (expira en {meta.activeCart.minutesLeft} min)
                            </span>
                          )}
                        </div>
                        <ul className="space-y-0.5">
                          {meta.activeCart.items.map((item: { productId: string; nombre: string; quantity: number; unitPrice: number }) => (
                            <li key={item.productId}>
                              {item.quantity}x {item.nombre} — S/ {(item.quantity * item.unitPrice).toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto bg-[#e5ddd5]/30 p-4">
                  {loadingMessages ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                          <Skeleton className={`h-12 rounded-lg ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
                        </div>
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400">
                      Sin mensajes. Pulsa Actualizar para sincronizar el historial.
                    </div>
                  ) : (
                    messages.map((m) => <MessageBubble key={m.id} m={m} />)
                  )}
                </div>

                {pendingFile && (
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                    <span>📎 {pendingFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingFile(null)}
                      className="font-medium text-danger hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                )}

                <div className="relative flex items-end gap-2 border-t border-slate-100 p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPendingFile(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100"
                    title="Adjuntar imagen o PDF"
                  >
                    📎
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEmojis((v) => !v)}
                      className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100"
                      title="Emoji"
                    >
                      😊
                    </button>
                    {showEmojis && (
                      <div className="absolute bottom-full left-0 z-10 mb-1 flex w-48 flex-wrap gap-1 rounded-xl border border-slate-100 bg-white p-2 shadow-card">
                        {QUICK_EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            className="rounded p-1 text-lg hover:bg-slate-100"
                            onClick={() => {
                              setReply((r) => r + e);
                              setShowEmojis(false);
                            }}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Escribe tu respuesta como asesor…"
                    className="zent-input flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleSend}
                    loading={sending}
                    disabled={!reply.trim() && !pendingFile}
                  >
                    Enviar
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'session' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="zent-card p-6">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Estado de conexión</h2>
            <div className="mb-4">
              <Badge tone={statusTone(status?.status)}>
                {statusLabel[status?.status] ?? status?.status ?? '…'}
              </Badge>
            </div>
            <div className="space-y-3">
              <Button type="button" className="w-full" onClick={handleGetQR}>
                Obtener código QR
              </Button>
              <Button type="button" variant="secondary" className="w-full" onClick={loadStatus}>
                Refrescar estado
              </Button>
            </div>
          </div>
          <div className="zent-card p-6">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Código QR</h2>
            {qr ? (
              <div className="text-center">
                <img src={qr} alt="QR" className="mx-auto max-w-xs" />
              </div>
            ) : (
              <p className="py-12 text-center text-slate-400">Genera un QR para vincular WhatsApp</p>
            )}
          </div>
          {openwaUrl && (
            <div className="zent-card p-4 text-sm text-slate-600 lg:col-span-2">
              Configuración avanzada (webhooks, sesiones):{' '}
              <a
                href={openwaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-600 hover:underline"
              >
                {openwaUrl}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
