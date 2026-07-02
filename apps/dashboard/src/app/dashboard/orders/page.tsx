'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/useRealtime';
import { orderStatusLabels } from '@/lib/labels';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';

const STATUS_TONES: Record<string, 'brand' | 'warning' | 'success' | 'default' | 'danger'> = {
  NUEVO: 'brand',
  EN_GESTION: 'warning',
  CONFIRMADO: 'success',
  EN_DELIVERY: 'brand',
  COMPLETADO: 'default',
  CANCELADO: 'danger',
};

const STATUS_ORDER = ['NUEVO', 'EN_GESTION', 'CONFIRMADO', 'EN_DELIVERY', 'COMPLETADO', 'CANCELADO'];

interface OrderLine {
  productId: string;
  quantity: number;
}

const emptyCustomer = {
  customerName: '',
  customerPhone: '',
  address: '',
  reference: '',
  chatId: '',
  notes: '',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [lines, setLines] = useState<OrderLine[]>([{ productId: '', quantity: 1 }]);
  const [creating, setCreating] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [editLines, setEditLines] = useState<{ id: string; quantity: number }[]>([]);
  const [savingItems, setSavingItems] = useState(false);

  const loadOrders = useCallback(() => {
    const params = filter ? `?status=${filter}` : '';
    setLoading(true);
    api
      .get(`/orders${params}`)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useRealtime(
    useCallback(
      (event) => {
        if (event.type === 'order.created' || event.type === 'order.updated') {
          loadOrders();
        }
      },
      [loadOrders],
    ),
  );

  const openCreate = () => {
    setCustomer(emptyCustomer);
    setLines([{ productId: '', quantity: 1 }]);
    setShowCreate(true);
    api.get('/products/with-stock').then(setProducts).catch(console.error);
  };

  const lookupCustomer = async () => {
    if (!customer.customerPhone.trim()) {
      toast.error('Ingresa un teléfono');
      return;
    }
    setLookupLoading(true);
    try {
      const found = await api.get(
        `/customers/lookup/by-phone?phone=${encodeURIComponent(customer.customerPhone)}`,
      );
      if (found) {
        setCustomer((c) => ({
          ...c,
          customerName: found.name || c.customerName,
          address: found.address || '',
          reference: found.reference || '',
        }));
        toast.success(`Cliente encontrado: ${found.name}`);
      } else {
        toast.message('Cliente nuevo — completa los datos');
      }
    } catch {
      toast.message('Cliente nuevo — completa los datos');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (!customer.customerName.trim() || !customer.customerPhone.trim()) {
      toast.error('Nombre y teléfono son obligatorios');
      return;
    }
    if (validLines.length === 0) {
      toast.error('Agrega al menos un producto');
      return;
    }
    setCreating(true);
    try {
      const order = await api.post('/orders', {
        customerName: customer.customerName.trim(),
        customerPhone: customer.customerPhone.trim(),
        address: customer.address.trim() || undefined,
        reference: customer.reference.trim() || undefined,
        chatId: customer.chatId.trim() || undefined,
        notes: customer.notes.trim() || undefined,
        items: validLines,
      });
      toast.success(`Pedido #${order.id.slice(0, 8)} creado`);
      setShowCreate(false);
      loadOrders();
      setSelected(order);
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear pedido');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await api.put(`/orders/${id}/status`, { status });
    toast.success(`Estado cambiado a ${status}`);
    loadOrders();
    if (selected?.id === id) {
      const updated = await api.get(`/orders/${id}`);
      setSelected(updated);
      syncEditLines(updated);
    }
  };

  const syncEditLines = (order: any) => {
    setEditLines(
      (order.items ?? []).map((item: any) => ({
        id: item.id,
        quantity: item.quantity,
      })),
    );
  };

  const selectOrder = async (order: any) => {
    setSelected(order);
    syncEditLines(order);
  };

  const handleSaveItems = async () => {
    if (!selected) return;
    setSavingItems(true);
    try {
      const updated = await api.put(`/orders/${selected.id}/items`, { items: editLines });
      toast.success('Cantidades confirmadas');
      setSelected(updated);
      syncEditLines(updated);
      loadOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar ítems');
    } finally {
      setSavingItems(false);
    }
  };

  const canEditItems =
    selected && !['COMPLETADO', 'CANCELADO'].includes(selected.status);

  const orderTotal = lines.reduce((sum, line) => {
    const p = products.find((x) => x.id === line.productId);
    return sum + (p ? Number(p.salePrice) * line.quantity : 0);
  }, 0);

  return (
    <div>
      <PageHeader
        title="Pedidos / Leads"
        actions={
          <>
            <Button type="button" onClick={openCreate}>
              + Nuevo pedido
            </Button>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="zent-input w-auto min-w-[180px]"
            >
              <option value="">Todos los estados</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {orderStatusLabels[s] ?? s}
                </option>
              ))}
            </select>
          </>
        }
      />

      {showCreate && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">Registrar pedido manual</h2>
            <p className="text-sm text-gray-600 mb-4">
              Para clientes que pidieron asesor por WhatsApp. El cliente queda registrado y en la
              próxima compra el bot lo saludará por su nombre.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Teléfono *</label>
                  <div className="flex gap-2">
                    <input
                      value={customer.customerPhone}
                      onChange={(e) => setCustomer({ ...customer, customerPhone: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded-md"
                      placeholder="51987654321"
                    />
                    <button
                      type="button"
                      onClick={lookupCustomer}
                      disabled={lookupLoading}
                      className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
                    >
                      Buscar
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre *</label>
                  <input
                    value={customer.customerName}
                    onChange={(e) => setCustomer({ ...customer, customerName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">Dirección</label>
                  <input
                    value={customer.address}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">Referencia</label>
                  <input
                    value={customer.reference}
                    onChange={(e) => setCustomer({ ...customer, reference: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">WhatsApp chatId (opcional)</label>
                  <input
                    value={customer.chatId}
                    onChange={(e) => setCustomer({ ...customer, chatId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                    placeholder="51987654321@c.us"
                  />
                  <p className="text-xs text-gray-500 mt-1">Si lo pones, le avisamos por WhatsApp que el pedido fue registrado.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Productos *</label>
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <select
                      value={line.productId}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...next[i], productId: e.target.value };
                        setLines(next);
                      }}
                      className="flex-1 px-3 py-2 border rounded-md"
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} — S/ {Number(p.salePrice).toFixed(2)} (stock: {p.stock})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...next[i], quantity: parseInt(e.target.value) || 1 };
                        setLines(next);
                      }}
                      className="w-20 px-3 py-2 border rounded-md"
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}
                        className="text-red-600 px-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setLines([...lines, { productId: '', quantity: 1 }])}
                  className="text-sm text-blue-600 hover:underline"
                >
                  + Agregar producto
                </button>
                <div className="text-right font-bold mt-2">Total estimado: S/ {orderTotal.toFixed(2)}</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notas internas</label>
                <textarea
                  value={customer.notes}
                  onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Guardando…' : 'Crear pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          {!loading && orders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin pedidos aún"
              description="Registra el primer pedido manual o espera leads por WhatsApp."
              action={
                <Button type="button" onClick={openCreate}>
                  Nuevo pedido
                </Button>
              }
            />
          ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origen</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((o: any) => (
                <tr
                  key={o.id}
                  onClick={() => selectOrder(o)}
                  className={`cursor-pointer hover:bg-gray-50 ${selected?.id === o.id ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    #{o.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>{o.customerName}</div>
                    {o.customerId && <span className="text-xs text-green-600">En cartera</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    S/ {Number(o.total).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge tone={STATUS_TONES[o.status] ?? 'default'}>
                      {orderStatusLabels[o.status] ?? o.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{o.source}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {selected && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Pedido #{selected.id.slice(0, 8)}</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">Cliente:</span> {selected.customerName}
              </div>
              {selected.customerId && (
                <div>
                  <a href="/dashboard/customers" className="text-blue-600 text-xs hover:underline">
                    Ver en cartera de clientes
                  </a>
                </div>
              )}
              <div>
                <span className="font-medium">Teléfono:</span> {selected.customerPhone}
              </div>
              <div>
                <span className="font-medium">Dirección:</span> {selected.address || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Referencia:</span> {selected.reference || 'N/A'}
              </div>
              {selected.notes && (
                <div>
                  <span className="font-medium">Notas:</span> {selected.notes}
                </div>
              )}
              <hr className="my-4" />
              <h3 className="font-bold">Items:</h3>
              {selected.items?.map((item: any) => {
                const editLine = editLines.find((l) => l.id === item.id);
                const requested = item.requestedQuantity ?? item.quantity;
                const confirmed = editLine?.quantity ?? item.quantity;
                const changed = requested !== confirmed;
                return (
                  <div key={item.id} className="py-2 border-b border-gray-100 last:border-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="font-medium">{item.product?.nombre}</div>
                        {requested !== item.quantity && (
                          <div className="text-xs text-gray-500">Pedido original: {requested}</div>
                        )}
                        {changed && (
                          <div className="text-xs text-amber-700">
                            Pedido: {requested} → confirmado: {confirmed}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {canEditItems ? (
                          <input
                            type="number"
                            min={0}
                            value={confirmed}
                            onChange={(e) => {
                              const qty = Math.max(0, parseInt(e.target.value) || 0);
                              setEditLines((lines) =>
                                lines.map((l) => (l.id === item.id ? { ...l, quantity: qty } : l)),
                              );
                            }}
                            className="w-16 px-2 py-1 border rounded-md text-right"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span>{item.quantity}x</span>
                        )}
                        <div className="text-gray-600">
                          S/ {(Number(item.unitPrice) * confirmed).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {canEditItems && (
                <button
                  type="button"
                  onClick={handleSaveItems}
                  disabled={savingItems}
                  className="mt-2 w-full px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {savingItems ? 'Guardando…' : 'Confirmar cantidades'}
                </button>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Ajusta cantidades antes de marcar en delivery o completado. Pon 0 si un producto no se incluyó.
              </p>
              <hr className="my-4" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span>S/ {Number(selected.total).toFixed(2)}</span>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Cambiar Estado:</label>
                <select
                  value={selected.status}
                  onChange={(e) => handleStatusChange(selected.id, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {orderStatusLabels[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
