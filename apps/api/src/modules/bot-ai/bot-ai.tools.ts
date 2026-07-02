import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const BOT_AI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Lista categorías activas con productos disponibles.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Busca productos por nombre o categoría.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto a buscar en nombre o descripción' },
          categoryId: { type: 'string', description: 'Filtrar por ID de categoría' },
          limit: { type: 'number', description: 'Máximo de resultados (default 10)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Obtiene detalle de un producto por ID, incluyendo stock disponible.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
        },
        required: ['productId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Agrega unidades de un producto al carrito del cliente.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number', minimum: 1 },
        },
        required: ['productId', 'quantity'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_cart',
      description: 'Muestra el contenido actual del carrito y totales.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_cart',
      description: 'Elimina un producto del carrito.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
        },
        required: ['productId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_order',
      description:
        'Crea el pedido con los datos de entrega. El carrito debe tener items.',
      parameters: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          address: { type: 'string' },
          reference: { type: 'string' },
        },
        required: ['customerName', 'customerPhone', 'address'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Transfiere la conversación a un asesor humano.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_catalog_pdf',
      description: 'Indica si hay catálogo PDF activo disponible para enviar.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];
