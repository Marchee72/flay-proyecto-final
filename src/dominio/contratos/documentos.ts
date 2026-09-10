/**
 * Documento de expensa (`FR-016`, `FR-017`, research R-01).
 *
 * El dominio dice **que** lleva el documento y no como se dibuja: quien rendea
 * vive en infraestructura, igual que el almacen que despues lo guarda
 * (Principio III). Cambiar la biblioteca de PDF no toca este archivo.
 *
 * Todos los importes son **cadenas** ya redondeadas por el motor (medida 3 de
 * § 14.1): el generador no calcula nada, ni siquiera un subtotal. Si sumara,
 * el numero del papel podria diferir del de la base, que es exactamente el
 * defecto que la regla previene.
 */

/** Una liquidacion impaga y el interes que genero (`FR-025`, research R-07). */
export interface LineaDeInteres {
  /** `07/2026`: el periodo de la liquidacion que quedo impaga. */
  periodo: string
  capital: string
  tasaMensual: string
  meses: number
  importe: string
}

export interface ExpensaParaDocumento {
  consorcio: { nombre: string; direccion: string; localidad: string }
  /** `08/2026`: el periodo liquidado. */
  periodo: string
  /** `2026-09-10`, en fecha ISO: el generador no interpreta calendarios. */
  vencimiento: string
  unidad: { designacion: string; tipo: string }
  coeficienteAplicado: string
  importeOrdinario: string
  importeExtraordinario: string
  deudaAnterior: string
  interesMora: string
  /** Vacio cuando no hubo mora: no se dibuja una tabla sin filas. */
  desgloseInteres: LineaDeInteres[]
  saldoAFavorAplicado: string
  /** `0.00` cuando no hubo diferencia; se muestra solo si la hubo (RN-07). */
  ajusteRedondeo: string
  totalUnidad: string
}

export interface GeneradorDeDocumentos {
  expensa(datos: ExpensaParaDocumento): Promise<Uint8Array>
}
