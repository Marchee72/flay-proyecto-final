import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Megaphone,
  Phone,
  Pin,
  Plus,
  Siren,
  TriangleAlert,
  Wallet,
} from 'lucide-react'

import { importe } from '@/compartido/dinero'
import { fechaParaMostrar, importeParaMostrar } from '@/compartido/formato'
import { listarNovedades } from '@/aplicacion/comunicacion/novedades'
import { verResumenConsorcio } from '@/aplicacion/consorcios/resumen'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { DescartarNovedad } from '../../comunicacion/descartar-novedad'
import { UrgenciaDeReclamo } from './reclamos/etiquetas'
import { AvisoDeError, conConsorcio } from '../../con-consorcio'

export const metadata: Metadata = { title: 'Resumen — Flay' }

/** Tonos de la barra de rubros: de oscuro a claro, distinguibles por claridad. */
const TONOS = ['#16191d', '#4f575f', '#5e9a2e', '#a5d66f', '#cfe6b3', '#d5d9d0']
/** Cuantos rubros se nombran; el resto va junto. */
const VISIBLES = 5
/** Cuantas novedades entran en el resumen antes de mandar a la seccion. */
const NOVEDADES = 3

const URGENCIA: Record<string, { texto: string; clase: string; sube: boolean }> = {
  critica: { texto: 'Crítica', clase: 'urgencia--urgente', sube: true },
  alta: { texto: 'Alta', clase: 'urgencia--alta', sube: true },
  media: { texto: 'Media', clase: 'urgencia--ordinaria', sube: false },
  baja: { texto: 'Baja', clase: 'urgencia--ordinaria', sube: false },
}

/**
 * El tablero del consorcio (rediseño 013, guia §7.4): lo que esta pasando en
 * este edificio. Las novedades vigentes arriba, porque son lo primero que un
 * vecino tiene que ver; despues el periodo abierto con sus gastos por rubro,
 * el estado de cobro, lo emitido mes a mes y las listas cortas. Las acciones
 * rapidas van a la cabecera; el boton no aparece si el rol no puede.
 */
export default async function ResumenPage({ params }: { params: Promise<{ consorcio: string }> }) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Resumen')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const base = `/consorcios/${activo.id}`

  let resumen
  let novedades
  try {
    const datos = { usuarioId, consorcioId: activo.id }
    ;[resumen, novedades] = await Promise.all([
      verResumenConsorcio(HABILITACIONES, RELOJ, datos),
      // Las vigentes que le tocan y no descarto: lo primero que ve cada uno.
      listarNovedades(HABILITACIONES, RELOJ, { ...datos, soloVigentes: true }),
    ])
  } catch (error) {
    return <AvisoDeError error={error} />
  }

  const administra = resumen.roles.includes('administrador')
  const soloLoPropio = !resumen.roles.some((r) => r === 'administrador' || r === 'consejo')

  // Rubros: los primeros por nombre y el resto junto, con su parte del total.
  const total = importe(resumen.gastosDelPeriodo)
  const nombrados = resumen.rubrosDelPeriodo.slice(0, VISIBLES)
  const resto = resumen.rubrosDelPeriodo
    .slice(VISIBLES)
    .reduce((suma, r) => suma.plus(importe(r.importe)), importe('0'))
  const rubros = [
    ...nombrados.map((r) => ({ rubro: r.rubro, importe: importe(r.importe) })),
    ...(resto.isZero()
      ? []
      : [
          {
            rubro: `${resumen.rubrosDelPeriodo.length - VISIBLES} rubros más`,
            importe: resto,
          },
        ]),
  ].map((r, i) => ({
    ...r,
    tono: TONOS[i]!,
    parte: total.isZero() ? '0' : r.importe.div(total).times(100).toFixed(2),
  }))

  // Cobro: las unidades al dia sobre el padron vigente.
  const enMora = resumen.morosidad?.unidadesEnMora ?? 0
  const alDia = Math.max(0, resumen.unidades - enMora)
  const circunferencia = importe('314.16')
  const arco = resumen.unidades ? circunferencia.times(alDia).div(resumen.unidades).toFixed(2) : '0'

  // Emitido: barras en proporcion al mes mas alto.
  const maximo = resumen.emitidoPorMes.reduce(
    (mayor, m) => (importe(m.importe).greaterThan(mayor) ? importe(m.importe) : mayor),
    importe('0'),
  )

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h1>Resumen</h1>
          <p className="apagado">
            {activo.direccion}
            {resumen.periodoAbierto && ` · período abierto ${resumen.periodoAbierto.etiqueta}`}
          </p>
        </div>
        {administra && (
          <div className="cabecera-pagina__acciones">
            <Link className="boton boton--fantasma" href={`${base}/pagos?abrir=1`}>
              <Wallet className="icono" aria-hidden="true" />
              Registrar pago
            </Link>
            <Link className="boton boton--fantasma" href={`${base}/periodos`}>
              <CalendarDays className="icono" aria-hidden="true" />
              {resumen.periodoAbierto ? 'Liquidar' : 'Períodos'}
            </Link>
            <Link className="boton boton--primario" href={`${base}/gastos?abrir=1`}>
              <Plus className="icono" aria-hidden="true" />
              Cargar gasto
            </Link>
          </div>
        )}
      </div>

      {novedades.length > 0 && (
        <section className="tarjeta novedades-inicio" aria-labelledby="titulo-novedades">
          <div className="tablero__fila">
            <h2 id="titulo-novedades" className="tablero__titulo">
              <Megaphone className="icono" aria-hidden="true" /> Novedades
            </h2>
            <Link className="enlace-seco" href={`${base}/novedades`}>
              {novedades.length > NOVEDADES ? `Ver las ${novedades.length}` : 'Ver todas'}
            </Link>
          </div>
          {novedades.slice(0, NOVEDADES).map((n) => (
            <article key={n.id} className={`novedad novedad-fila novedad--${n.severidad}`}>
              <div className="novedad-fila__texto">
                <h3>
                  {n.fijada && <Pin className="icono" aria-label="Fijada" />}
                  {n.titulo}
                  <UrgenciaDeReclamo urgencia={n.severidad} />
                </h3>
                <p>{n.cuerpo}</p>
                <span className="kpi__detalle">
                  {fechaParaMostrar(n.publicadaEn)}
                  {n.destinatario && ` · ${n.destinatario}`}
                </span>
              </div>
              <DescartarNovedad consorcioId={activo.id} novedadId={n.id} />
            </article>
          ))}
        </section>
      )}

      {resumen.padron && !resumen.padron.cuadra && (
        <p className="aviso aviso--problema" role="alert">
          <Siren className="icono" aria-hidden="true" />
          <span>
            Los coeficientes del padrón no cierran: no se puede liquidar hasta corregirlos.{' '}
            <Link href={`${base}/unidades`}>Ver unidades</Link>.
          </span>
        </p>
      )}
      {resumen.padron?.unidades === 0 && (
        <p className="aviso aviso--atencion" role="status">
          <TriangleAlert className="icono" aria-hidden="true" />
          <span>
            Todavía no hay unidades cargadas.{' '}
            <Link href={`${base}/unidades`}>Cargar el padrón</Link>.
          </span>
        </p>
      )}

      <div className="tablero">
        <section className="tarjeta tablero__ancho" aria-label="Período abierto">
          <div className="tablero__cabeza">
            <div className="tablero__dato">
              <span className="kpi__rotulo">Período abierto</span>
              <span className="kpi__cifra">{resumen.periodoAbierto?.etiqueta ?? '—'}</span>
              <span className="kpi__detalle">
                {resumen.periodoAbierto
                  ? `Vence el ${fechaParaMostrar(resumen.periodoAbierto.vencimiento)}`
                  : 'Sin período abierto'}
              </span>
            </div>
            <div className="tablero__dato tablero__dato--derecha">
              <span className="kpi__rotulo">Gastos del período</span>
              <span className="cifra-grande">{importeParaMostrar(resumen.gastosDelPeriodo)}</span>
              <span className="kpi__detalle">
                {resumen.rubrosDelPeriodo.length} rubros · acumulado hasta hoy
              </span>
            </div>
          </div>
          {rubros.length > 0 && (
            <>
              <div
                className="barra-rubros"
                role="img"
                aria-label={`Por rubro: ${rubros.map((r) => `${r.rubro} ${r.parte.replace('.', ',')} %`).join(', ')}`}
              >
                {rubros.map((r) => (
                  <span key={r.rubro} style={{ width: `${r.parte}%`, background: r.tono }} />
                ))}
              </div>
              <ul className="leyenda-rubros">
                {rubros.map((r) => (
                  <li key={r.rubro}>
                    <i style={{ background: r.tono }} aria-hidden="true" />
                    <span>{r.rubro}</span>
                    <span className="cifra">{importeParaMostrar(r.importe.toFixed(2))}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link className="boton boton--fantasma tablero__boton" href={`${base}/gastos`}>
            Ver gastos
            <ArrowUpRight className="icono" aria-hidden="true" />
          </Link>
        </section>

        <section className="tarjeta tarjeta--oscura tablero__angosto" aria-labelledby="t-cobro">
          <h2 id="t-cobro" className="tablero__titulo">
            Estado de cobro
          </h2>
          <div className="cobro">
            <svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              role="img"
              aria-label={`${alDia} de ${resumen.unidades} unidades al día`}
            >
              <circle cx="60" cy="60" r="50" fill="none" stroke="#2a2f35" strokeWidth="12" />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="#a5d66f"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${arco} 314.16`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="60" textAnchor="middle" className="cobro__cifra">
                {alDia}
              </text>
              <text x="60" y="80" textAnchor="middle" className="cobro__de">
                de {resumen.unidades}
              </text>
            </svg>
            <div className="cobro__texto">
              <strong>unidades al día</strong>
              <span>
                {resumen.morosidad ? (
                  <>
                    {resumen.morosidad.unidadesEnMora} con deuda vencida por{' '}
                    <b className="cifra">{importeParaMostrar(resumen.morosidad.deudaTotal)}</b>
                  </>
                ) : (
                  'Ninguna con deuda vencida'
                )}
              </span>
            </div>
          </div>
          <Link className="boton tablero__boton boton--sobre-oscuro" href={`${base}/morosidad`}>
            Ver morosidad
            <ArrowUpRight className="icono" aria-hidden="true" />
          </Link>
        </section>

        <section className="tarjeta tablero__medio" aria-labelledby="t-emitido">
          <div className="tablero__fila">
            <h2 id="t-emitido" className="tablero__titulo">
              Emitido por mes
            </h2>
            <span className="kpi__detalle">en millones de pesos</span>
          </div>
          {resumen.emitidoPorMes.length === 0 ? (
            <p className="apagado">Todavía no hay liquidaciones emitidas.</p>
          ) : (
            <ol className="barras" aria-label="Total emitido en cada liquidación">
              {resumen.emitidoPorMes.map((m, i) => {
                const valor = importe(m.importe)
                const alto = maximo.isZero() ? '0' : valor.div(maximo).times(100).toFixed(0)
                const millones = valor.div(1_000_000).toFixed(2).replace('.', ',')
                return (
                  <li key={m.etiqueta}>
                    <span className="barras__valor cifra">{millones}</span>
                    <span
                      className={
                        i === resumen.emitidoPorMes.length - 1
                          ? 'barras__barra barras__barra--ultima'
                          : 'barras__barra'
                      }
                      style={{ height: `${alto}%` }}
                    />
                    <span className="barras__mes">{m.etiqueta.slice(0, 2)}</span>
                    <span className="oculto">
                      {m.etiqueta}: {importeParaMostrar(m.importe)}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section className="tarjeta tablero__medio" aria-labelledby="t-reclamos">
          <div className="tablero__fila">
            <h2 id="t-reclamos" className="tablero__titulo">
              Reclamos sin resolver
            </h2>
            <Link className="enlace-seco" href={`${base}/reclamos`}>
              Ver todos
            </Link>
          </div>
          {resumen.reclamosSinResponder.length === 0 ? (
            <p className="apagado">Nada pendiente.</p>
          ) : (
            <ul className="lista-simple">
              {resumen.reclamosSinResponder.map((r) => {
                const urgencia = URGENCIA[r.urgencia] ?? URGENCIA.media!
                const Flecha = urgencia.sube ? ArrowUp : ArrowDown
                return (
                  <li key={r.id}>
                    <span className="lista-simple__doble">
                      <Link href={`${base}/reclamos/${r.id}`}>{r.titulo}</Link>
                      <span className={`urgencia ${urgencia.clase}`}>
                        <Flecha className="icono" aria-hidden="true" />
                        {urgencia.texto}
                      </span>
                    </span>
                    <span className="kpi__detalle">{fechaParaMostrar(r.fechaApertura)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="tarjeta tablero__medio" aria-labelledby="t-pagos">
          <div className="tablero__fila">
            <h2 id="t-pagos" className="tablero__titulo">
              {soloLoPropio ? 'Mis últimos pagos' : 'Últimos pagos'}
            </h2>
            <Link className="enlace-seco" href={`${base}/pagos`}>
              Ver todos
            </Link>
          </div>
          {resumen.ultimosPagos.length === 0 ? (
            <p className="apagado">Sin pagos registrados.</p>
          ) : (
            <ul className="lista-simple">
              {resumen.ultimosPagos.map((p) => (
                <li key={p.id}>
                  <span className="lista-simple__doble">
                    <strong>Unidad {p.unidad}</strong>
                    <span className="kpi__detalle">{fechaParaMostrar(p.fecha)}</span>
                  </span>
                  <span className="cifra">{importeParaMostrar(p.importe)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta tablero__mitad" aria-labelledby="t-gastos">
          <div className="tablero__fila">
            <h2 id="t-gastos" className="tablero__titulo">
              Últimos gastos
            </h2>
            <Link className="enlace-seco" href={`${base}/gastos`}>
              Ver todos
            </Link>
          </div>
          {resumen.ultimosGastos.length === 0 ? (
            <p className="apagado">Sin gastos cargados.</p>
          ) : (
            <ul className="lista-simple">
              {resumen.ultimosGastos.map((g) => (
                <li key={g.id}>
                  <span className="lista-simple__doble">
                    <Link href={`${base}/gastos/${g.id}`}>{g.descripcion || g.rubro}</Link>
                    <span className="kpi__detalle">
                      {g.rubro} · {fechaParaMostrar(g.fecha)}
                    </span>
                  </span>
                  <span className="cifra">{importeParaMostrar(g.importe)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta tablero__mitad" aria-labelledby="t-contactos">
          <div className="tablero__fila">
            <h2 id="t-contactos" className="tablero__titulo">
              <Phone className="icono" aria-hidden="true" /> Contactos útiles
            </h2>
            <Link className="enlace-seco" href={`${base}/proveedores`}>
              Proveedores
            </Link>
          </div>
          {/* Apilado (nombre, rol, contacto): en una tarjeta angosta dos
              columnas parten el nombre y el correo desborda. */}
          <ul className="lista-simple lista-simple--apilada">
            {resumen.contactos.map((c) => (
              <li key={`${c.rol}-${c.correo}`}>
                <strong>{c.nombre}</strong>
                <span className="kpi__detalle">
                  {c.rol}
                  {c.telefono && ` · ${c.telefono}`}
                </span>
                {c.correo && <a href={`mailto:${c.correo}`}>{c.correo}</a>}
              </li>
            ))}
            {resumen.proveedores.slice(0, 4).map((p) => (
              <li key={p.id}>
                <strong>{p.razonSocial}</strong>
                <span className="kpi__detalle">
                  {p.rubro ?? 'Proveedor'}
                  {p.telefono && ` · ${p.telefono}`}
                </span>
                {p.correo && <a href={`mailto:${p.correo}`}>{p.correo}</a>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
