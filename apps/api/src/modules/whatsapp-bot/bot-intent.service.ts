import { Injectable } from '@nestjs/common';

const ADD_TO_CART_RE = /^(agregar|añadir|add)\s*(\d+)$/i;

@Injectable()
export class BotIntentService {
  parseAddToCartIntent(text: string): { quantity: number } | null {
    const match = text.trim().match(ADD_TO_CART_RE);
    if (!match) return null;
    const quantity = Number.parseInt(match[2], 10);
    if (!Number.isFinite(quantity) || quantity < 1) return null;
    return { quantity };
  }
}
