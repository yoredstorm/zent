'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/useRealtime';

type MainTab = 'inbox' | 'session';
type InboxFilter = '' | 'handoff' | 'orders';

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
  unreadHint: boolean;
  lastSource: string;
}

interface WaMessage {
  id: string;
  chatId: string;
  body: string;
  direction: string;
  source: string;
  createdAt: string;
}

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

export default function WhatsAppPage() {
  const [mainTab, setMainTab] = useState<MainTab>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [qr, setQr] = useState('');
  const [openwaUrl, setOpenwaUrl] = useState<string | null>(null);

  const loadConversations = useCallback(() => {
    const q = filter ? `?filter=${filter}` : '';
    api.get(`/whatsapp/conversations${q}`).then(setConversations).catch(console.error);
  }, [filter]);

  const loadMessages = useCallback((chatId: string) => {
    api
      .get(`/whatsapp/conversations/${encodeChatId(chatId)}/messages?limit=80`)
      .then((rows) => setMessages(rows.reverse()))
      .catch(console.error);
    api
      .get(`/whatsapp/conversations/${encodeChatId(chatId)}/meta`)
      .then(setMeta)
      .catch(console.error);
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
        if (event.type === 'message.received' || event.type === 'message.sent') {
          loadConversations();
          const chatId = event.payload?.chatId as string | undefined;
          if (chatId && selected?.chatId === chatId) {
            loadMessages(chatId);
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
    loadMessages(c.chatId);
  };

  const handleSend = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/whatsapp/conversations/${encodeChatId(selected.chatId)}/send`, {
        text: reply.trim(),
      });
      setReply('');
      loadMessages(selected.chatId);
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

  return (
    <div>
      <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">WhatsApp</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMainTab('inbox')}
            className={`px-4 py-2 rounded-lg text-sm ${mainTab === 'inbox' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
          >
            Bandeja
          </button>
          <button
            type="button"
            onClick={() => setMainTab('session')}
            className={`px-4 py-2 rounded-lg text-sm ${mainTab === 'session' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
          >
            Sesión
          </button>
        </div>
      </div>

      {mainTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-12rem)] min-h-[500px]">
          <div className="bg-white rounded-lg shadow flex flex-col overflow-hidden lg:col-span-1">
            <div className="p-3 border-b flex gap-2 flex-wrap">
              {(['', 'handoff', 'orders'] as const).map((f) => (
                <button
                  key={f || 'all'}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs ${
                    filter === f ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f === '' ? 'Todas' : f === 'handoff' ? 'Handoff' : 'Pedidos nuevos'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 text-center">
                  No hay conversaciones aún. Los mensajes aparecerán cuando los clientes escriban.
                </p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.chatId}
                    type="button"
                    onClick={() => selectConversation(c)}
                    className={`w-full text-left p-3 border-b hover:bg-gray-50 ${
                      selected?.chatId === c.chatId ? 'bg-green-50' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-sm truncate">{displayName(c)}</span>
                      <span className="text-xs text-gray-400 shrink-0">{formatTime(c.lastMessageAt)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-1">{c.lastMessage}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.needsHandoff && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          Handoff
                        </span>
                      )}
                      {c.hasNewOrder && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          Pedido nuevo
                        </span>
                      )}
                      {c.unreadHint && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                          Nuevo
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow flex flex-col overflow-hidden lg:col-span-2">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                Selecciona una conversación
              </div>
            ) : (
              <>
                <div className="p-3 border-b flex flex-wrap justify-between gap-2 items-center">
                  <div>
                    <div className="font-semibold">{displayName(selected)}</div>
                    {formatPhone(selected.contactPhone) && (
                      <div className="text-xs text-gray-500">{formatPhone(selected.contactPhone)}</div>
                    )}
                  </div>
                  {meta?.openOrder && (
                    <Link
                      href="/dashboard/orders"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Pedido #{meta.openOrder.id.slice(0, 8)} ({meta.openOrder.status})
                    </Link>
                  )}
                </div>

                {meta && (
                  <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600 border-b flex flex-wrap gap-3">
                    {meta.session?.state && <span>Bot: {meta.session.state}</span>}
                    {meta.customer && (
                      <Link href="/dashboard/customers" className="text-blue-600 hover:underline">
                        Ver cliente
                      </Link>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]/30">
                  {messages.map((m) => {
                    const isOut = m.direction === 'OUT';
                    return (
                      <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
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
                          <div className="whitespace-pre-wrap break-words">{m.body}</div>
                          <div className="text-[10px] text-gray-400 mt-1 text-right">
                            {formatTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 border-t flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Escribe tu respuesta como asesor…"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !reply.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'session' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Estado de conexión</h2>
            <span className="inline-block px-3 py-1 rounded-full text-sm bg-gray-100 mb-4">
              {statusLabel[status?.status] ?? status?.status ?? '…'}
            </span>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGetQR}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Obtener código QR
              </button>
              <button
                type="button"
                onClick={loadStatus}
                className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Refrescar estado
              </button>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Código QR</h2>
            {qr ? (
              <div className="text-center">
                <img src={qr} alt="QR" className="mx-auto max-w-xs" />
              </div>
            ) : (
              <p className="text-center text-gray-400 py-12">Genera un QR para vincular WhatsApp</p>
            )}
          </div>
          {openwaUrl && (
            <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow text-sm text-gray-600">
              Configuración avanzada (webhooks, sesiones):{' '}
              <a
                href={openwaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
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
