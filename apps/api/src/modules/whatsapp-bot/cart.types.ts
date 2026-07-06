export interface CartItem {
  productId: string;
  nombre: string;
  quantity: number;
  unitPrice: number;
  costAtSale: number;
  variantId?: string;
  variantLabel?: string;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  deliveryCost: number;
  total: number;
}
