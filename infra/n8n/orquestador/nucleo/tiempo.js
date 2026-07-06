/** Núcleo de tiempo — antigüedad en español para estados de pedido. */

function haceCuanto(fechaIso) {
  const ms = Date.now() - new Date(fechaIso).getTime();
  if (!isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 2) return 'hace un momento';
  if (min < 60) return `hace ${min} minutos`;
  const horas = Math.floor(min / 60);
  if (horas < 2) return 'hace 1 hora';
  if (horas < 24) return `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

if (typeof module !== 'undefined') {
  module.exports = { haceCuanto };
}
