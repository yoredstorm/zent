export interface ValorVarianteAtributo {
  attributeValue: { valor: string; attribute: { nombre: string } };
}

export interface VarianteConAtributos {
  values: ValorVarianteAtributo[];
}

function capitalizarPrimera(valor: string): string {
  return valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : valor;
}

/**
 * "Color: Rojo · Material: Acero inoxidable" en vez de valores sueltos unidos por
 * "/" (rojo / acero inoxidable) — mismo formato que `etiquetaVariante` en
 * n8n-commerce-tools.controller.ts, para que la etiqueta se vea igual en el chat,
 * el carrito, los pedidos y el dashboard. Úsalo donde se necesita texto plano
 * (ej. un `title` o un valor de exportación); para UI usa `paresAtributoVariante`.
 */
export function etiquetaVariante(variante: VarianteConAtributos): string {
  return paresAtributoVariante(variante)
    .map((p) => `${p.nombre}: ${p.valor}`)
    .join(' · ');
}

export interface ParAtributoValor {
  nombre: string;
  valor: string;
}

/** Los mismos pares (atributo, valor) de una variante, para renderizar como chips en vez de texto plano. */
export function paresAtributoVariante(variante: VarianteConAtributos): ParAtributoValor[] {
  return (variante.values ?? [])
    .filter((v) => v?.attributeValue)
    .map((v) => ({
      nombre: v.attributeValue.attribute.nombre,
      valor: capitalizarPrimera(v.attributeValue.valor),
    }));
}
