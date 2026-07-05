export type N8nFlowPhase =
  | 'greeting'
  | 'main_menu'
  | 'browse_categories'
  | 'browse_products'
  | 'cart'
  | 'checkout_name'
  | 'checkout_address'
  | 'checkout_reference'
  | 'checkout_confirm'
  | 'order_status'
  | 'handoff';

export interface N8nCheckoutDraft {
  customerName?: string;
  address?: string;
  reference?: string;
  useSavedAddress?: boolean;
}

export interface N8nFlowContext {
  phase: N8nFlowPhase;
  categoryId?: string;
  categoryName?: string;
  categoryList?: { id: string; name: string; productCount: number }[];
  lastProductList?: { id: string; name: string; price: number; lowStock?: boolean }[];
  checkout?: N8nCheckoutDraft;
  lastCopyKeys?: Record<string, number>;
  productPage?: number;
}
