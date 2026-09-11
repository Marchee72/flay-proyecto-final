// Genera los 30 comprobantes ficticios de la PoC de extraccion (§ 8.4.3) a
// partir de `datos-cliente/comprobantes/indice-30.csv`, que es la verdad de
// campo. Cada fila dice formato y calidad; de eso sale un PDF digital o una
// "foto"/"escaneo" (PNG) con el defecto que anuncia la observacion: torcido,
// borroso, con sombra, con sello encima del importe, total manuscrito.
//
// Deterministico: dos corridas dejan los mismos archivos. Rendea con el
// Chromium de Playwright, que ya esta instalado para las pruebas e2e.
//
//   node poc/generar-comprobantes.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from '@playwright/test'

const INDICE = 'datos-cliente/comprobantes/indice-30.csv'
const SALIDA = 'datos-cliente/comprobantes/archivos'
const CLIENTE = {
  nombre: 'Consorcio Av. Pellegrini 1234',
  cuit: '30-71000123-4',
  domicilio: 'Av. Pellegrini 1234, Rosario, Santa Fe',
  condicion: 'Consumidor Final',
}

const filas = readFileSync(INDICE, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((linea) => {
    const [id, fecha, proveedor, cuit, rubro, importe, formato, calidad, tipo, observacion] =
      linea.split(';')
    return { id, fecha, proveedor, cuit, rubro, importe, formato, calidad, tipo, observacion }
  })

/** Generador seudoaleatorio chiquito y sembrado por comprobante (mulberry32). */
function azar(semilla) {
  let a = semilla
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pesos = (cadena) => {
  const [entero, dec] = Number(cadena).toFixed(2).split('.')
  return `$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}
const fechaAr = (iso) => iso.split('-').reverse().join('/')
const numero = (r) => String(Math.floor(r() * 90000) + 10000).padStart(8, '0')

/** Reparte el total entre N items con precios "redondos", en centavos, sin flotante. */
function items(total, nombres, r) {
  const centavos = Math.round(Number(total) * 100)
  const partes = []
  let resto = centavos
  nombres.forEach((nombre, i) => {
    const ultimo = i === nombres.length - 1
    const parte = ultimo ? resto : Math.floor((resto * (0.25 + r() * 0.5)) / 100) * 100
    partes.push({ nombre, importe: (parte / 100).toFixed(2) })
    resto -= parte
  })
  return partes
}

const ITEMS_POR_RUBRO = {
  R01: [
    'Sueldo basico encargado',
    'Antiguedad',
    'Suplencia francos',
    'Contribuciones patronales',
    'ART',
    'Obra social',
    'Cuota sindical FATERYH',
  ],
  R02: ['Servicio de limpieza mensual', 'Insumos de limpieza', 'Retiro de residuos voluminosos'],
  R04: ['Cargo fijo', 'Energia consumida 1.240 kWh', 'Alumbrado publico', 'Impuestos y tasas'],
  R05: ['Servicio medido agua', 'Servicio cloacal', 'Cargo fijo conexion'],
  R06: ['Cargo fijo', 'Gas consumido 310 m3', 'Impuestos nacionales', 'Tasa municipal'],
  R07: ['Abono mensual conservacion 2 equipos', 'Cambio de patin de puerta'],
  R08: [
    'Prima incendio edificio',
    'Prima responsabilidad civil',
    'Prima cristales',
    'Impuestos y sellados',
  ],
  R09: ['Honorarios de administracion mes en curso'],
  R10: ['Mano de obra', 'Materiales', 'Traslado'],
  R11: ['Poda y mantenimiento patio', 'Insumos riego', 'Retiro de restos'],
  R12: ['Desinfeccion y desratizacion bimestral', 'Certificado sanitario'],
  R13: ['Servicio fibra 300 MB', 'Telefonia fija porteria'],
  R15: [
    'Certificado de obra N 2 - cubierta',
    'Andamios y proteccion',
    'Impermeabilizacion sector B',
  ],
  R16: ['Anticipo 30 % caldera Bax 60000 kcal', 'Flete e izaje'],
  R17: [
    'Tablero general etapa 1',
    'Cableado 2x6 mm 120 ml',
    'Interruptores diferenciales 8 u',
    'Mano de obra certificada',
  ],
}
const ITEMS_ESPECIALES = {
  C04: [
    'Bulones 8 mm x 50',
    'Anclajes quimicos x 2',
    'Disco corte 115',
    'Cinta aisladora',
    'Silicona neutra',
  ],
  C05: ['Reparacion perdida bajo mesada porteria', 'Recambio flexible y sifon', 'Mano de obra'],
  C06: [
    'Latex interior 20 L x 3',
    'Enduido plastico 10 kg',
    'Rodillos y pinceles',
    'Fijador al agua 4 L',
  ],
  C15: ['Recambio tablero seccional palier 3', 'Termica 2x25 A x 4', 'Mano de obra'],
  C17: ['Apertura cerradura porteria', 'Cilindro doble paleta', 'Copias llave x 6'],
  C18: ['Vidrio laminado 3+3 puerta hall', 'Colocacion y sellado', 'Retiro vidrio roto'],
  C21: Array.from({ length: 22 }, (_, i) => `Articulo libreria ${i + 1}`),
  C22: ['Revoque y pintura pared medianera', 'Materiales', 'Retiro de escombros'],
  C24: ['Recarga matafuego ABC 5 kg x 12', 'Tarjeta DPS x 12', 'Prueba hidraulica x 3'],
  C28: ['Desagote pozo y camara', 'Destapacion cloacal con maquina', 'Traslado'],
  C29: ['Reja porton cochera 3 x 2,20 m', 'Pintura antioxido y esmalte', 'Colocacion'],
}

const ESTILO_BASE = `
  * { box-sizing: border-box }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff }
  .hoja { width: 210mm; min-height: 280mm; padding: 14mm; position: relative }
  .caja { border: 1px solid #222; padding: 8px }
  .cab { display: grid; grid-template-columns: 1fr 70px 1fr; gap: 8px; margin-bottom: 10px }
  .letra { border: 2px solid #222; text-align: center; font-size: 28px; font-weight: bold; padding: 4px 0; align-self: start }
  .letra small { display: block; font-size: 9px; font-weight: normal }
  h1 { font-size: 20px; margin: 0 0 4px }
  table { width: 100%; border-collapse: collapse; margin-top: 10px }
  th, td { border-bottom: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top }
  td.n, th.n { text-align: right; white-space: nowrap }
  .totales { margin-top: 12px; margin-left: auto; width: 55%; }
  .totales td { border: 0 }
  .total { font-size: 16px; font-weight: bold; border-top: 2px solid #222 !important }
  .pie { position: absolute; bottom: 14mm; left: 14mm; right: 14mm; font-size: 10px; color: #333; border-top: 1px solid #999; padding-top: 6px }
  .nota { font-size: 10px; color: #444; margin-top: 8px }
  .salto { page-break-before: always }
  .sello { position: absolute; color: rgba(190, 20, 20, 0.75); border: 3px solid rgba(190, 20, 20, 0.75); border-radius: 6px; padding: 4px 12px; font-size: 26px; font-weight: bold; transform: rotate(-14deg); letter-spacing: 2px }
  .manuscrito { font-family: 'Segoe Script', 'Segoe Print', cursive; font-size: 22px; color: #1b2a6b; transform: rotate(-3deg); display: inline-block }
`

/** Encabezado AFIP: proveedor a la izquierda, letra al medio, datos del comprobante a la derecha. */
function encabezado(c, letra, tipoDoc, r, extra = '') {
  const codigo = { A: '01', B: '06', C: '11' }[letra] ?? '01'
  const pv = String(Math.floor(r() * 9) + 1).padStart(5, '0')
  return `
  <div class="cab caja">
    <div>
      <h1>${c.razonImpresa}</h1>
      <div>${c.domicilioProv}</div>
      <div>${c.condicionIva}</div>
      ${extra}
    </div>
    <div class="letra">${letra}<small>COD. ${codigo}</small></div>
    <div style="text-align:right">
      <h1>${tipoDoc}</h1>
      <div>Punto de Venta: <b>${pv}</b> &nbsp; Comp. Nro: <b>${numero(r)}</b></div>
      <div>Fecha de Emision: <b>${fechaAr(c.fecha)}</b></div>
      <div>CUIT: <b>${c.cuit}</b></div>
      <div>Ingresos Brutos: ${c.cuit.replace(/-/g, '')}</div>
      <div>Inicio de Actividades: 01/03/20${10 + Math.floor(r() * 12)}</div>
    </div>
  </div>
  <div class="caja" style="margin-bottom:10px">
    <div><b>Periodo Facturado Desde:</b> 01/${c.fecha.slice(5, 7)}/${c.fecha.slice(0, 4)} &nbsp; <b>Hasta:</b> ${fechaAr(c.fecha)} &nbsp; <b>Fecha de Vto. para el pago:</b> ${fechaAr(c.fecha).replace(/^\d\d/, '28')}</div>
    <div><b>CUIT:</b> ${CLIENTE.cuit} &nbsp; <b>Apellido y Nombre / Razon Social:</b> ${CLIENTE.nombre}</div>
    <div><b>Condicion frente al IVA:</b> ${CLIENTE.condicion} &nbsp; <b>Domicilio:</b> ${CLIENTE.domicilio}</div>
    <div><b>Condicion de venta:</b> ${r() > 0.5 ? 'Transferencia bancaria' : 'Cuenta corriente'}</div>
  </div>`
}

function tablaItems(lista, conIva) {
  const filas = lista
    .map(
      (i) =>
        `<tr><td>${i.codigo ?? ''}</td><td>${i.nombre}</td><td class="n">${i.cantidad ?? '1,00'}</td><td class="n">${i.unidad ?? 'unidades'}</td><td class="n">${pesos(i.precio ?? i.importe)}</td>${conIva ? '<td class="n">21%</td>' : ''}<td class="n">${pesos(i.importe)}</td></tr>`,
    )
    .join('')
  return `<table><thead><tr><th>Codigo</th><th>Producto / Servicio</th><th class="n">Cantidad</th><th class="n">U. medida</th><th class="n">Precio Unit.</th>${conIva ? '<th class="n">Alicuota IVA</th>' : ''}<th class="n">Subtotal</th></tr></thead><tbody>${filas}</tbody></table>`
}

/** Totales: la factura A discrimina IVA hacia atras desde el total, para que el total sea el del indice. */
function totales(total, letra) {
  const t = Math.round(Number(total) * 100)
  if (letra !== 'A') {
    return `<table class="totales"><tr><td>Subtotal:</td><td class="n">${pesos(total)}</td></tr><tr><td>Importe Otros Tributos:</td><td class="n">${pesos('0')}</td></tr><tr class="total"><td>Importe Total:</td><td class="n">${pesos(total)}</td></tr></table>`
  }
  const neto = Math.round(t / 1.21)
  const iva = t - neto
  return `<table class="totales"><tr><td>Importe Neto Gravado:</td><td class="n">${pesos(neto / 100)}</td></tr><tr><td>IVA 21%:</td><td class="n">${pesos(iva / 100)}</td></tr><tr><td>Importe Otros Tributos:</td><td class="n">${pesos('0')}</td></tr><tr class="total"><td>Importe Total:</td><td class="n">${pesos(total)}</td></tr></table>`
}

function pieCae(r) {
  return `<div class="pie"><b>CAE N°:</b> ${Math.floor(r() * 9e13 + 1e13)} &nbsp; <b>Fecha de Vto. de CAE:</b> ${String(Math.floor(r() * 28) + 1).padStart(2, '0')}/09/2026 &nbsp;&nbsp; Comprobante Autorizado &nbsp; <i>Esta Administracion Federal no se responsabiliza por los datos ingresados en el detalle de la operacion</i></div>`
}

/** Factura A/B/C generica sobre hoja A4. */
function factura(c, letra, r, opciones = {}) {
  const lista = items(
    c.importe,
    ITEMS_ESPECIALES[c.id] ?? ITEMS_POR_RUBRO[c.rubro] ?? ['Servicio'],
    r,
  )
  const conIva = letra === 'A'
  if (conIva)
    for (const i of lista)
      i.precio = (Math.round((Number(i.importe) * 100) / 1.21) / 100).toFixed(2)
  const totalesHtml = opciones.sinTotal ? '' : totales(c.importe, letra)
  return `<div class="hoja">${encabezado(c, letra, 'FACTURA', r)}${tablaItems(lista, conIva)}${opciones.antesDeTotales ?? ''}${totalesHtml}${opciones.extra ?? ''}${pieCae(r)}</div>`
}

/** Factura de servicio masivo (EPE, gas, agua, fibra): otro layout, con numero de cliente y vencimientos. */
function servicio(c, r) {
  const lista = items(c.importe, ITEMS_POR_RUBRO[c.rubro], r)
  const nroCliente = String(Math.floor(r() * 9e8)).padStart(10, '0')
  const periodo = `${c.fecha.slice(5, 7)}/${c.fecha.slice(0, 4)}`
  return `<div class="hoja" style="font-family: Verdana, Arial, sans-serif">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 4px solid #0a5; padding-bottom: 8px">
      <div><div style="font-size:30px; font-weight:bold; color:#0a5">${c.razonImpresa.split(' — ')[0]}</div><div style="font-size:11px">${c.razonImpresa.split(' — ')[1] ?? ''}</div><div>${c.domicilioProv}</div><div>CUIT ${c.cuit} — ${c.condicionIva}</div></div>
      <div style="text-align:right"><div style="font-size:18px; font-weight:bold">FACTURA B</div><div>N° ${String(Math.floor(r() * 9) + 1).padStart(4, '0')}-${numero(r)}</div><div>Fecha de emision: <b>${fechaAr(c.fecha)}</b></div><div>Periodo: <b>${periodo}</b></div></div>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px">
      <div class="caja"><b>Titular:</b> ${CLIENTE.nombre}<br><b>Suministro:</b> ${CLIENTE.domicilio}<br><b>N° de cliente:</b> ${nroCliente}<br><b>Tarifa:</b> ${['T2 General', 'SGP Grandes usuarios', 'No residencial'][Math.floor(r() * 3)]}</div>
      <div class="caja" style="background:#f4fff8"><div>1° vencimiento: <b>${fechaAr(c.fecha).replace(/^\d\d/, '20')}</b> &nbsp; ${pesos(c.importe)}</div><div>2° vencimiento: <b>${fechaAr(c.fecha).replace(/^\d\d/, '28')}</b> &nbsp; ${pesos((Math.round(Number(c.importe) * 103) / 100).toFixed(2))}</div><div style="font-size:24px; font-weight:bold; margin-top:8px">TOTAL A PAGAR ${pesos(c.importe)}</div></div>
    </div>
    <table><thead><tr><th>Concepto</th><th class="n">Importe</th></tr></thead><tbody>${lista.map((i) => `<tr><td>${i.nombre}</td><td class="n">${pesos(i.importe)}</td></tr>`).join('')}<tr class="total"><td>Total</td><td class="n">${pesos(c.importe)}</td></tr></tbody></table>
    <div class="nota">Consumo del periodo comparado con el mismo periodo del año anterior: ${Math.floor(r() * 30) - 10} %. Lectura estimada: no.</div>
    <div style="margin-top:30px; font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 3px">||${Math.floor(r() * 1e15)}${Math.floor(r() * 1e15)}||</div>
    <div class="pie">CAE ${Math.floor(r() * 9e13 + 1e13)} — Vto. CAE 30/09/2026 — Comprobante emitido conforme RG 4291</div>
  </div>`
}

/** Ticket termico angosto: fuente monoespaciada, sin tabla. */
function ticket(c, r, ancho = 58) {
  const lista = items(c.importe, ITEMS_ESPECIALES[c.id] ?? ITEMS_POR_RUBRO[c.rubro], r)
  const col = ancho === 58 ? 30 : 40
  const linea = (izq, der) =>
    `${izq.slice(0, col - der.length - 1).padEnd(col - der.length)} ${der}`
  const cuerpo = [
    c.razonImpresa.toUpperCase(),
    c.domicilioProv,
    `CUIT ${c.cuit}`,
    c.condicionIva.toUpperCase(),
    `TICKET FACTURA B  N ${String(Math.floor(r() * 9) + 1).padStart(4, '0')}-${numero(r)}`,
    `FECHA ${fechaAr(c.fecha)}  HORA ${String(9 + Math.floor(r() * 9)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
    `A CONSUMIDOR FINAL`,
    ''.padEnd(col, '-'),
    ...lista.map((i) => linea(i.nombre, pesos(i.importe).replace('$ ', ''))),
    ''.padEnd(col, '-'),
    linea('TOTAL', pesos(c.importe)),
    '',
    linea('EFECTIVO', pesos(c.importe)),
    '',
    `CAE ${Math.floor(r() * 9e13 + 1e13)}`,
    'GRACIAS POR SU COMPRA',
  ]
  return `<pre style="font-family:'Courier New',monospace; font-size:${ancho === 58 ? 11 : 12}px; line-height:1.35; margin:0; padding:12px 8px; width:max-content; background:#fff">${cuerpo.join('\n')}</pre>`
}

/** Segunda pagina generica con un titulo y una tabla. */
const anexo = (titulo, filas) =>
  `<div class="hoja salto"><h1>${titulo}</h1><table><tbody>${filas.map((f) => `<tr>${f.map((x, i) => `<td class="${i ? 'n' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

/** Efectos de captura: el envoltorio simula foto o escaneo. */
function envolver(html, efecto) {
  const efectos = {
    limpio: '',
    escaneo: 'filter: grayscale(1) contrast(1.15); transform: rotate(5deg);',
    foto: 'transform: rotate(1.5deg); filter: contrast(0.95) saturate(0.9);',
    sombra: 'transform: rotate(-1deg);',
    borrosa: 'transform: rotate(2deg); filter: blur(1.3px) brightness(0.85) contrast(0.9);',
    arrugado: 'transform: rotate(-3deg) skewY(1deg); filter: grayscale(0.6) contrast(1.05);',
  }
  const fondo = efecto === 'limpio' ? '#fff' : efecto === 'escaneo' ? '#ddd' : '#6b5540'
  const velo =
    efecto === 'sombra'
      ? '<div style="position:absolute; inset:0; background: linear-gradient(115deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.38) 60%, rgba(0,0,0,0.55) 100%); pointer-events:none"></div>'
      : efecto === 'arrugado'
        ? '<div style="position:absolute; inset:0; background: repeating-linear-gradient(35deg, rgba(0,0,0,0) 0 40px, rgba(0,0,0,0.08) 40px 43px), repeating-linear-gradient(-60deg, rgba(0,0,0,0) 0 70px, rgba(0,0,0,0.06) 70px 72px); pointer-events:none"></div>'
        : ''
  return `<style>${ESTILO_BASE} body{background:${fondo}; padding:40px} .hoja{min-height:0; width:auto; background:#fff; box-shadow: 0 6px 18px rgba(0,0,0,.35)} .pie{position:static; margin-top:28px} .captura{display:inline-block; position:relative; ${efectos[efecto]}}</style><div class="captura">${html}${velo}</div>`
}

/** Datos impresos del proveedor: lo que dice el indice, mas domicilio y condicion verosimiles. */
function completar(c, r) {
  const razones = {
    EPE: 'EPE — Empresa Provincial de la Energia de Santa Fe',
    'Litoral Gas': 'Litoral Gas — Litoral Gas S.A.',
    'Aguas Santafesinas': 'Aguas Santafesinas — Aguas Santafesinas S.A.',
    'Telecom Fibra': 'Telecom Fibra — Telecom Argentina S.A.',
    'Plomero R. Díaz (monotributo)': 'Roberto Díaz — Plomería y gas',
    'Electricista M. Sosa': 'Marcelo Sosa — Instalaciones electricas',
    'Albañil J. Peralta': 'Jorge Peralta — Albañileria en general',
    'Herrero L. Gómez': 'Luis Gómez — Herreria de obra',
    'Grupo Delta Adm.': 'Grupo Delta S.R.L. — Administracion de consorcios',
  }
  const calles = [
    'Bv. Oroño 1450',
    'San Luis 2210',
    'Mendoza 3875',
    'Av. Francia 980',
    'Corrientes 1120',
    'Ruta 34 km 7',
    'Ov. Lagos 3300',
  ]
  return {
    ...c,
    razonImpresa: razones[c.proveedor] ?? c.proveedor,
    domicilioProv: `${calles[Math.floor(r() * calles.length)]}, Rosario, Santa Fe`,
    condicionIva: c.cuit.startsWith('20') ? 'Responsable Monotributo' : 'IVA Responsable Inscripto',
  }
}

/** Que documento y con que captura produce cada fila. Devuelve { html, tipo: 'pdf'|'png', ancho? }. */
function construir(fila) {
  const r = azar(Number(fila.id.slice(1)) * 7919)
  const c = completar(fila, r)
  const esMono = c.tipo === 'monotributo'
  const letraPyme =
    c.tipo === 'comercio' || c.id === 'C09' || c.id === 'C28' || c.id === 'C18' ? 'B' : 'A'

  if (c.tipo === 'servicio_masivo')
    return { html: `<style>${ESTILO_BASE}</style>${servicio(c, r)}`, tipo: 'pdf' }

  if (c.formato.startsWith('ticket')) {
    const efecto = c.id === 'C17' ? 'arrugado' : 'foto'
    return {
      html: envolver(ticket(c, r, c.id === 'C04' ? 58 : 80), efecto),
      tipo: 'png',
      ancho: 520,
    }
  }

  if (c.id === 'C15') {
    // Total manuscrito: el campo impreso queda vacio y el numero va a mano.
    const html = factura(c, 'C', r, {
      sinTotal: true,
      extra: `<table class="totales"><tr><td>Subtotal:</td><td class="n">${pesos(c.importe)}</td></tr><tr class="total"><td>Importe Total:</td><td class="n"><span class="manuscrito">$ 62.500.-</span></td></tr></table>`,
    })
    return { html: envolver(html, 'foto'), tipo: 'png', ancho: 1000 }
  }
  if (c.id === 'C28') {
    const html = factura(c, 'B', r, {
      extra: `<div class="sello" style="right: 26mm; bottom: 78mm">PAGADO 20/08/2026</div>`,
    })
    return { html: envolver(html, 'foto'), tipo: 'png', ancho: 1000 }
  }
  if (esMono) {
    const efecto = { C05: 'sombra', C22: 'borrosa', C29: 'foto' }[c.id] ?? 'foto'
    return { html: envolver(factura(c, 'C', r), efecto), tipo: 'png', ancho: 1000 }
  }
  if (c.id === 'C09')
    return { html: envolver(factura(c, 'B', r), 'escaneo'), tipo: 'png', ancho: 1000 }

  // De aca en adelante, PDF digital A4.
  let cuerpo
  if (c.id === 'C14') {
    // Certificado de obra: el total es el de la factura; las retenciones son informativas y vienen despues.
    cuerpo = factura(c, 'A', r, {
      extra: `<div class="nota"><b>Retenciones a practicar por el cliente (no descontadas de este comprobante):</b> Ret. IIBB Santa Fe 3 % ${pesos('9000')} — Ret. Ganancias ${pesos('6000')} — Neto a cobrar estimado ${pesos('285000')}</div>`,
    })
  } else if (c.id === 'C19') {
    cuerpo = factura(c, 'A', r, {
      antesDeTotales: `<div class="nota">Anticipo del 30 % sobre presupuesto N° 0417 por ${pesos('666666.67')}. Saldo pendiente a facturar contra entrega: ${pesos('466666.67')}.</div>`,
    })
  } else if (c.id === 'C18') {
    // Presupuesto primero, factura despues: el importe es el de la factura.
    const presupuesto = `<div class="hoja"><h1>PRESUPUESTO N° 2231</h1><div>${c.razonImpresa} — CUIT ${c.cuit}</div><div>Fecha: ${fechaAr('2026-07-09')} — Validez 10 dias</div><div>Para: ${CLIENTE.nombre}</div><table><tbody><tr><td>Vidrio laminado 3+3 puerta hall, colocacion y sellado</td><td class="n">${pesos('92000')}</td></tr></tbody></table><p class="nota">Este presupuesto no es comprobante fiscal.</p></div>`
    cuerpo = presupuesto + factura(c, 'B', r).replace('class="hoja"', 'class="hoja salto"')
  } else if (c.id === 'C11' || c.id === 'C27') {
    const filasAnexo = [
      ['Suma asegurada incendio edificio', pesos('480000000')],
      ['Suma asegurada RC', pesos('60000000')],
      ['Cristales', pesos('4500000')],
      ['Franquicia', '2 % del siniestro'],
      ['Vigencia', `${fechaAr(c.fecha)} al ${fechaAr(c.fecha).replace(/2026$/, '2027')}`],
    ]
    cuerpo =
      factura(c, 'A', r, {
        extra: `<div class="nota">Poliza N° ${Math.floor(r() * 9e6)} — Cuota ${c.id === 'C11' ? '1' : '3'} de 12. Ver anexo.</div>`,
      }) + anexo('ANEXO I — Condiciones particulares', filasAnexo)
  } else if (c.id === 'C13' || c.id === 'C30') {
    const dias = Array.from({ length: 12 }, (_, i) => [
      `Semana ${Math.floor(i / 3) + 1} — ${['lunes', 'miercoles', 'viernes'][i % 3]}`,
      'Limpieza integral palieres, hall y escaleras — 4 h',
    ])
    cuerpo = factura(c, 'A', r) + anexo('DETALLE DE SERVICIOS PRESTADOS', dias)
  } else if (c.id === 'C24') {
    const tarjetas = Array.from({ length: 12 }, (_, i) => [
      `Matafuego ABC 5 kg — N° serie ${41200 + i}`,
      `Recarga ${fechaAr(c.fecha)} — Vence ${fechaAr(c.fecha).replace(/2026$/, '2027')}`,
    ])
    cuerpo = factura(c, 'A', r) + anexo('TARJETAS DE RECARGA — DPS', tarjetas)
  } else if (c.id === 'C26') {
    cuerpo = factura(c, 'A', r, {
      extra: `<div class="nota"><b>Computo metrico etapa 1:</b> tablero general 1 u — cableado 2x6 mm 120 ml — bandeja portacable 40 ml — interruptores diferenciales 8 u — puesta a tierra 1 jabalina.</div>`,
    })
  } else if (c.id === 'C07') {
    cuerpo = factura(c, 'A', r, {
      extra: `<div class="nota">Liquidacion de servicio de personal — mes ${c.fecha.slice(5, 7)}/${c.fecha.slice(0, 4)}. Incluye aportes y contribuciones segun CCT 589/10. Legajo 0007 — categoria encargado permanente con vivienda.</div>`,
    })
  } else {
    cuerpo = factura(c, letraPyme, r)
  }
  return { html: `<style>${ESTILO_BASE}</style>${cuerpo}`, tipo: 'pdf' }
}

mkdirSync(SALIDA, { recursive: true })
const navegador = await chromium.launch()
const manifiesto = []
for (const fila of filas) {
  const { html, tipo, ancho } = construir(fila)
  const pagina = await navegador.newPage({
    viewport: { width: ancho ?? 900, height: tipo === 'png' ? 300 : 800 },
    deviceScaleFactor: tipo === 'png' ? 1.4 : 1,
  })
  await pagina.setContent(html)
  const archivo = join(SALIDA, `${fila.id}.${tipo}`)
  if (tipo === 'pdf')
    writeFileSync(archivo, await pagina.pdf({ format: 'A4', printBackground: true }))
  else await pagina.screenshot({ path: archivo, fullPage: true })
  await pagina.close()
  manifiesto.push({ id: fila.id, archivo: `${fila.id}.${tipo}` })
  console.log(`${fila.id} → ${archivo}`)
}
await navegador.close()
writeFileSync(join(SALIDA, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2) + '\n')
