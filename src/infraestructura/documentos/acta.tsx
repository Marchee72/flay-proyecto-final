import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
// Explícito: fuera de Next (las pruebas) el transformador no inyecta el runtime de JSX.
import React from 'react'

import type { ActaParaDocumento, GeneradorDeDocumentos } from '@/dominio/contratos/documentos'

import { NOTO_SANS_REGULAR_BASE64 } from './tipografia'

/**
 * El acta de asamblea en PDF (016, RF-32, research R-09). Como la expensa: no
 * calcula nada, dibuja cadenas que ya vienen formateadas. La hoja de firmas va
 * solo en el PDF final, con la huella del contenido que se firmó.
 */
Font.register({
  family: 'Noto Sans',
  src: `data:font/ttf;base64,${NOTO_SANS_REGULAR_BASE64}`,
})

const estilos = StyleSheet.create({
  pagina: { padding: 40, fontSize: 10, fontFamily: 'Noto Sans', color: '#1a1a1a', lineHeight: 1.4 },
  titulo: { fontSize: 16, marginBottom: 2 },
  apagado: { color: '#555555' },
  bloque: { marginTop: 14 },
  subtitulo: { fontSize: 12, marginBottom: 6 },
  punto: { marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#cccccc' },
  fila: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e5e5',
  },
  c1: { width: '18%' },
  c2: { width: '18%', textAlign: 'right', paddingRight: 8 },
  c3: { width: '20%' },
  c4: { width: '44%' },
  v1: { width: '30%' },
  v2: { width: '70%' },
  k1: { width: '50%' },
  k2: { width: '20%', textAlign: 'right' },
  k3: { width: '30%', textAlign: 'right' },
  resultado: { marginTop: 6 },
  firma: { marginTop: 10, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#1a1a1a' },
  pie: { marginTop: 24, fontSize: 8, color: '#777777' },
})

function Acta({ datos }: { datos: ActaParaDocumento }) {
  return (
    <Document title={`Acta — ${datos.titulo}`} language="es">
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>Acta de asamblea {datos.tipo.toLowerCase()}</Text>
        <Text>{datos.consorcio.nombre}</Text>
        <Text style={estilos.apagado}>
          {datos.consorcio.direccion}, {datos.consorcio.localidad}
        </Text>

        <View style={estilos.bloque}>
          <Text>
            En {datos.lugar}, el {datos.fecha}, se reunió la asamblea «{datos.titulo}», que sesionó
            en {datos.convocatoria} convocatoria con {datos.quorum} de los coeficientes presentes.
          </Text>
          <Text>
            Presidió {datos.presidente}. Actuó como secretario/a {datos.secretario}.
          </Text>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.subtitulo}>Asistencia</Text>
          <View style={estilos.fila}>
            <Text style={estilos.c1}>Unidad</Text>
            <Text style={estilos.c2}>Coeficiente</Text>
            <Text style={estilos.c3}>Estado</Text>
            <Text style={estilos.c4}>Representada por</Text>
          </View>
          {datos.asistencia.map((a) => (
            <View key={a.designacion} style={estilos.fila} wrap={false}>
              <Text style={estilos.c1}>{a.designacion}</Text>
              <Text style={estilos.c2}>{a.coeficiente}</Text>
              <Text style={estilos.c3}>{a.estado}</Text>
              <Text style={estilos.c4}>{a.representante}</Text>
            </View>
          ))}
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.subtitulo}>Orden del día</Text>
          {datos.puntos.map((p) => (
            <View key={p.orden} style={estilos.punto}>
              <Text style={estilos.subtitulo}>
                {p.orden}. {p.titulo}
              </Text>
              {p.descripcion && <Text style={estilos.apagado}>{p.descripcion}</Text>}
              <Text style={estilos.apagado}>{p.modalidad}</Text>
              <Text style={estilos.bloque}>{p.resumen}</Text>

              <View style={estilos.bloque}>
                <View style={estilos.fila}>
                  <Text style={estilos.k1}>Opción</Text>
                  <Text style={estilos.k2}>Unidades</Text>
                  <Text style={estilos.k3}>Coeficientes</Text>
                </View>
                {p.conteo.map((c) => (
                  <View key={c.opcion} style={estilos.fila} wrap={false}>
                    <Text style={estilos.k1}>{c.opcion}</Text>
                    <Text style={estilos.k2}>{c.unidades}</Text>
                    <Text style={estilos.k3}>{c.coeficiente}</Text>
                  </View>
                ))}
              </View>

              {p.votos.length > 0 && (
                <View style={estilos.bloque}>
                  <Text style={estilos.apagado}>Votos por unidad</Text>
                  {p.votos.map((v) => (
                    <View key={v.designacion} style={estilos.fila} wrap={false}>
                      <Text style={estilos.v1}>{v.designacion}</Text>
                      <Text style={estilos.v2}>{v.eleccion}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={estilos.resultado}>
                Resultado: {p.resultado}. {p.estado}
              </Text>
            </View>
          ))}
        </View>

        {datos.hojaDeFirmas && (
          <View style={estilos.bloque} break>
            <Text style={estilos.subtitulo}>Firmas</Text>
            <Text style={estilos.apagado}>
              Firmado electrónicamente en Flay (Ley 25.506, art. 5). Cada firmante confirmó su
              identidad con su contraseña sobre el contenido de huella SHA-256:
            </Text>
            <Text>{datos.hojaDeFirmas.huellaContenido}</Text>
            {datos.hojaDeFirmas.firmas.map((f) => (
              <View key={`${f.rol}-${f.nombre}`} style={estilos.firma} wrap={false}>
                <Text>{f.nombre}</Text>
                <Text style={estilos.apagado}>
                  {f.rol} — firmó el {f.momento}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={estilos.pie}>Documento generado por Flay.</Text>
      </Page>
    </Document>
  )
}

export const generadorActa: Pick<GeneradorDeDocumentos, 'acta'> = {
  async acta(datos: ActaParaDocumento): Promise<Uint8Array> {
    return renderToBuffer(<Acta datos={datos} />)
  },
}
