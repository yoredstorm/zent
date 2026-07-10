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
 * el carrito, los pedidos y el dashboard.
 */
export function etiquetaVariante(variante: VarianteConAtributos): string {
  return (variante.values ?? [])
    .filter((v) => v?.attributeValue)
    .map((v) => `${v.attributeValue.attribute.nombre}: ${capitalizarPrimera(v.attributeValue.valor)}`)
    .join(' · ');
}
