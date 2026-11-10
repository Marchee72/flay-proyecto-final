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

/** Un cargo sobre una liquidacion impaga arrastrada (`FR-025`, research R-07). */
export interface LineaDeInteres {
  /** `07/2026`: el periodo de la liquidacion que quedo impaga. */
  periodo: string
  /** El recargo mas alto (una vez) o la mora (una por liquidacion), decision 2026-11-10. */
  tipo: 'mora' | 'recargo'
  capital: string
  tasaMensual: string
  meses: number
  importe: string
}

/** Un gasto del periodo, tal como lo cargo el administrador (`RF-10`). */
export interface LineaDeGasto {
  /** `05/08/2026`, ya en formato de pantalla. */
  fecha: string
  proveedor: string | null
  descripcion: string
  importe: string
}

/**
 * Los gastos del consorcio en el periodo, de una clasificacion (RN-04),
 * agrupados por rubro. El subtotal lo suma la aplicacion y el total es el de
 * la liquidacion: el papel rinde cuentas sin que el generador sume nada.
 */
export interface GastosDeClasificacion {
  clasificacion: 'ordinario' | 'extraordinario'
  rubros: { rubro: string; subtotal: string; lineas: LineaDeGasto[] }[]
  total: string
}

export interface ExpensaParaDocumento {
  consorcio: { nombre: string; direccion: string; localidad: string }
  /** `08/2026`: el periodo liquidado. */
  periodo: string
  /** `10/09/2026`, ya en formato de pantalla: el generador no interpreta calendarios. */
  vencimiento: string
  unidad: { designacion: string; tipo: string }
  /**
   * Los vencimientos escalonados (`RF-08`), con el monto a pagar hasta cada
   * fecha. Un solo elemento cuando no hay escalonamiento. Fechas e importes ya
   * en formato de pantalla; el generador no calcula nada.
   */
  vencimientos: { fecha: string; recargoPorcentaje: string; monto: string }[]
  coeficienteAplicado: string
  /** Vacio si el periodo no tuvo gastos; una entrada por clasificacion con gastos. */
  gastos: GastosDeClasificacion[]
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

/**
 * Acta de asamblea (016, RF-32, `contracts/contratos.md` § Documento PDF). Como
 * la expensa: todo llega **ya formateado como cadena** y el generador no
 * calcula nada; el resultado y su conteo los fijó el dominio al cerrar cada
 * punto. La hoja de firmas va solo en el PDF final, con la huella del
 * contenido que firmaron.
 */
export interface ActaParaDocumento {
  consorcio: { nombre: string; direccion: string; localidad: string }
  titulo: string
  /** `Ordinaria` / `Extraordinaria`. */
  tipo: string
  /** `25/11/2026 19:00`, hora de Argentina. */
  fecha: string
  lugar: string
  /** `primera` o `segunda` convocatoria, en palabras. */
  convocatoria: string
  presidente: string
  secretario: string
  /** `90.00 %` de los coeficientes. */
  quorum: string
  asistencia: {
    designacion: string
    coeficiente: string
    estado: string
    representante: string
  }[]
  puntos: {
    orden: number
    titulo: string
    descripcion: string | null
    modalidad: string
    resumen: string
    votos: { designacion: string; eleccion: string }[]
    conteo: { opcion: string; unidades: string; coeficiente: string }[]
    resultado: string
    estado: string
  }[]
  hojaDeFirmas?: {
    huellaContenido: string
    firmas: { nombre: string; rol: string; momento: string }[]
  }
}

export interface GeneradorDeDocumentos {
  expensa(datos: ExpensaParaDocumento): Promise<Uint8Array>
  acta(datos: ActaParaDocumento): Promise<Uint8Array>
}
