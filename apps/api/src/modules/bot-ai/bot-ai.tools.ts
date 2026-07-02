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
      name: 'get_customer_profile',
      description: 'Obtiene datos del cliente si está registrado (nombre, teléfono, dirección).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
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
      name: 'update_cart_item',
      description: 'Actualiza la cantidad de un producto en el carrito. Usa quantity 0 para eliminar.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number', minimum: 0 },
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
      name: 'get_checkout_draft',
      description: 'Muestra borrador de checkout: carrito, datos de entrega y campos faltantes.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_checkout_field',
      description: 'Guarda un campo de entrega: customerName, customerPhone, address o reference.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['customerName', 'customerPhone', 'address', 'reference'],
          },
          value: { type: 'string' },
        },
        required: ['field', 'value'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_order',
      description:
        'Valida que el carrito y datos de entrega estén completos y marca el pedido como confirmado.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_order',
      description:
        'Crea el pedido. Requiere carrito con items y datos de entrega completos. Preferir confirm_order antes.',
      parameters: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          address: { type: 'string' },
          reference: { type: 'string' },
        },
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
