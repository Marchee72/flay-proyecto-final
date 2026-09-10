import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'

import { importeParaMostrar, coeficienteParaMostrar } from '@/compartido/formato'
import type {
  ExpensaParaDocumento,
  GeneradorDeDocumentos,
  LineaDeInteres,
} from '@/dominio/contratos/documentos'

/**
 * El documento de expensa, rendeado en el servidor (`FR-017`, research R-01).
 *
 * Es infraestructura por dos razones: nombra la biblioteca y **produce bytes**.
 * Lo unico que hace con los importes es formatearlos —de cadena a cadena, con
 * `@/compartido/formato`— porque el papel tiene que decir exactamente lo que
 * dice la base. Ningun subtotal se recalcula aca (medida 3 de § 14.1).
 *
 * `Helvetica` es la tipografia incorporada: no se descarga nada al generar, que
 * con 96 documentos seguidos es la diferencia entre minutos y decenas de
 * minutos (SC-007).
 */

const estilos = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  apagado: { color: '#555555', marginBottom: 2 },
  bloque: { marginTop: 16 },
  subtitulo: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  filaConLinea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
  },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  celdaAncha: { width: '40%' },
  celda: { width: '20%', textAlign: 'right' },
  pie: { marginTop: 24, fontSize: 8, color: '#777777' },
})

function Renglon({ concepto, importe }: { concepto: string; importe: string }) {
  return (
    <View style={estilos.filaConLinea}>
      <Text>{concepto}</Text>
      <Text>{importeParaMostrar(importe)}</Text>
    </View>
  )
}

/**
 * El desglose del interes, fila por liquidacion impaga (`FR-025`).
 *
 * Sin esto, explicarle el importe a un propietario a los treinta dias es
 * imposible: el total solo no reconstruye que estaba impago al emitir
 * (research R-07, RNF-10).
 */
function DesgloseDeInteres({ lineas }: { lineas: LineaDeInteres[] }) {
  if (lineas.length === 0) return null

  return (
    <View style={estilos.bloque}>
      <Text style={estilos.subtitulo}>Intereses por mora</Text>
      <View style={estilos.fila}>
        <Text style={estilos.celdaAncha}>Periodo impago</Text>
        <Text style={estilos.celda}>Capital</Text>
        <Text style={estilos.celda}>Tasa</Text>
        <Text style={estilos.celda}>Meses</Text>
        <Text style={estilos.celda}>Interes</Text>
      </View>
      {lineas.map((linea) => (
        <View key={`${linea.periodo}-${linea.capital}`} style={estilos.filaConLinea}>
          <Text style={estilos.celdaAncha}>{linea.periodo}</Text>
          <Text style={estilos.celda}>{importeParaMostrar(linea.capital)}</Text>
          <Text style={estilos.celda}>{linea.tasaMensual} %</Text>
          <Text style={estilos.celda}>{linea.meses}</Text>
          <Text style={estilos.celda}>{importeParaMostrar(linea.importe)}</Text>
        </View>
      ))}
    </View>
  )
}

export function Expensa({ datos }: { datos: ExpensaParaDocumento }) {
  return (
    <Document
      title={`Expensa ${datos.periodo} - ${datos.unidad.designacion}`}
      author={datos.consorcio.nombre}
      language="es-AR"
    >
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>Expensas {datos.periodo}</Text>
        <Text style={estilos.apagado}>
          {datos.consorcio.nombre} - {datos.consorcio.direccion}, {datos.consorcio.localidad}
        </Text>

        <View style={estilos.bloque}>
          <View style={estilos.fila}>
            <Text>Unidad</Text>
            <Text>
              {datos.unidad.designacion} ({datos.unidad.tipo})
            </Text>
          </View>
          <View style={estilos.filaConLinea}>
            <Text>Coeficiente aplicado</Text>
            <Text>{coeficienteParaMostrar(datos.coeficienteAplicado)} %</Text>
          </View>
          <View style={estilos.filaConLinea}>
            <Text>Vencimiento</Text>
            <Text>{datos.vencimiento}</Text>
          </View>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.subtitulo}>Detalle del periodo</Text>
          <Renglon concepto="Expensas ordinarias" importe={datos.importeOrdinario} />
          <Renglon concepto="Expensas extraordinarias" importe={datos.importeExtraordinario} />
          <Renglon concepto="Deuda anterior" importe={datos.deudaAnterior} />
          <Renglon concepto="Intereses por mora" importe={datos.interesMora} />
          <Renglon concepto="Saldo a favor aplicado" importe={datos.saldoAFavorAplicado} />
          {datos.ajusteRedondeo !== '0.00' && (
            <Renglon concepto="Ajuste por redondeo" importe={datos.ajusteRedondeo} />
          )}

          <View style={estilos.total}>
            <Text>Total a pagar</Text>
            <Text>{importeParaMostrar(datos.totalUnidad)}</Text>
          </View>
        </View>

        <DesgloseDeInteres lineas={datos.desgloseInteres} />

        {datos.ajusteRedondeo !== '0.00' && (
          <Text style={estilos.pie}>
            El ajuste por redondeo es la diferencia de centavos del prorrateo, asignada a la unidad
            de mayor coeficiente y declarada aparte (regla RN-07).
          </Text>
        )}

        <Text style={estilos.pie}>
          Documento generado por Flay. Los importes estan expresados en pesos.
        </Text>
      </Page>
    </Document>
  )
}

export const generadorPdf: GeneradorDeDocumentos = {
  async expensa(datos: ExpensaParaDocumento): Promise<Uint8Array> {
    return renderToBuffer(<Expensa datos={datos} />)
  },
}
