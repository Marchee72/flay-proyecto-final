import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CalendarDays,
  MessageSquareWarning,
  Phone,
  Receipt,
  Siren,
  TriangleAlert,
  Wallet,
} from 'lucide-react'

import { fechaParaMostrar, importeParaMostrar } from '@/compartido/formato'
import { verResumenConsorcio } from '@/aplicacion/consorcios/resumen'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'

export const metadata: Metadata = { title: 'Resumen — Flay' }

/**
 * El tablero del consorcio (diseno 2026-09-13 § 4.2): que esta pasando en
 * este edificio. KPI arriba, avisos solo si aplican (RNF-10), las ultimas
 * cosas en listas cortas y los contactos al pie. Las acciones rapidas van a
 * su seccion; el boton no aparece si el rol no puede.
 */
export default async function ResumenPage({ params }: { params: Promise<{ consorcio: string }> }) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Resumen')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const base = `/consorcios/${activo.id}`

  let resumen
  try {
    resumen = await verResumenConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
  } catch (error) {
    return <AvisoDeError error={error} />
  }

  const administra = resumen.roles.includes('administrador')

  return (
    <>
      <h1>{activo.nombre}</h1>
      <p className="apagado">{activo.direccion}</p>

      {administra && (
        <div className="fila-acciones">
          <Link className="boton boton--primario" href={`${base}/gastos/nuevo`}>
            <Receipt className="icono" aria-hidden="true" />
            Cargar gasto
          </Link>
          <Link className="boton boton--fantasma" href={`${base}/pagos/nuevo`}>
            <Wallet className="icono" aria-hidden="true" />
            Registrar pago
          </Link>
          <Link className="boton boton--fantasma" href={`${base}/periodos`}>
            <CalendarDays className="icono" aria-hidden="true" />
            {resumen.periodoAbierto ? 'Liquidar' : 'Abrir período'}
          </Link>
        </div>
      )}

      <div className="fila-kpi">
        <div className="kpi">
          <span className="kpi__icono">
            <CalendarDays className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Período abierto</div>
            <div className="kpi__cifra">{resumen.periodoAbierto?.etiqueta ?? '—'}</div>
            <div className="kpi__detalle">
              {resumen.periodoAbierto
                ? `Vence el ${fechaParaMostrar(resumen.periodoAbierto.vencimiento)}`
                : 'Sin período abierto'}
            </div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi__icono">
            <Receipt className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Gastos del período</div>
            <div className="kpi__cifra cifra">{importeParaMostrar(resumen.gastosDelPeriodo)}</div>
            <div className="kpi__detalle">Acumulado hasta hoy</div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi__icono">
            <TriangleAlert className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Morosidad</div>
            <div className="kpi__cifra">
              {resumen.morosidad
                ? `${resumen.morosidad.unidadesEnMora} de ${resumen.morosidad.unidadesTotales}`
                : '0'}
            </div>
            <div className="kpi__detalle">
              {resumen.morosidad ? (
                <>
                  <span className="cifra">{importeParaMostrar(resumen.morosidad.deudaTotal)}</span>{' '}
                  vencidos
                </>
              ) : (
                'Sin unidades en mora'
              )}
            </div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi__icono">
            <MessageSquareWarning className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Reclamos abiertos</div>
            <div className="kpi__cifra">{resumen.reclamosAbiertos}</div>
            <div className="kpi__detalle">
              {resumen.reclamosCriticos > 0
                ? `${resumen.reclamosCriticos} críticos`
                : 'Ninguno crítico'}
            </div>
          </div>
        </div>
      </div>

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

      <div className="rejilla">
        <section className="tarjeta">
          <h2>Últimos gastos</h2>
          {resumen.ultimosGastos.length === 0 ? (
            <p className="apagado">Sin gastos cargados.</p>
          ) : (
            <ul className="lista-simple">
              {resumen.ultimosGastos.map((g) => (
                <li key={g.id}>
                  <Link href={`${base}/gastos/${g.id}`}>{g.descripcion || g.rubro}</Link>
                  <span className="cifra">{importeParaMostrar(g.importe)}</span>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href={`${base}/gastos`}>Ver todos los gastos</Link>
          </p>
        </section>

        <section className="tarjeta">
          <h2>Últimos pagos</h2>
          {resumen.ultimosPagos.length === 0 ? (
            <p className="apagado">Sin pagos registrados.</p>
          ) : (
            <ul className="lista-simple">
              {resumen.ultimosPagos.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.unidad} · {fechaParaMostrar(p.fecha)}
                  </span>
                  <span className="cifra">{importeParaMostrar(p.importe)}</span>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href={`${base}/pagos`}>Ver todos los pagos</Link>
          </p>
        </section>

        <section className="tarjeta">
          <h2>Reclamos sin resolver</h2>
          {resumen.reclamosSinResponder.length === 0 ? (
            <p className="apagado">Nada pendiente.</p>
          ) : (
            <ul className="lista-simple">
              {resumen.reclamosSinResponder.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/reclamos/${r.id}`}>{r.titulo}</Link>
                  <span
                    className={`etiqueta etiqueta--${r.urgencia === 'critica' ? 'vencido' : 'pendiente'}`}
                  >
                    {r.urgencia}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href={`${base}/reclamos`}>Ver todos los reclamos</Link>
          </p>
        </section>

        <section className="tarjeta">
          <h2>
            <Phone className="icono" aria-hidden="true" /> Contactos útiles
          </h2>
          {/* Apilado (nombre, rol, contacto): en una tarjeta angosta dos
              columnas parten el nombre y el correo desborda. */}
          <ul className="lista-simple lista-simple--apilada">
            {resumen.contactos.map((c) => (
              <li key={`${c.rol}-${c.correo}`}>
                <strong>{c.nombre}</strong>
                <span className="apagado">{c.rol}</span>
                <span>
                  {c.telefono ?? ''} {c.correo && <a href={`mailto:${c.correo}`}>{c.correo}</a>}
                </span>
              </li>
            ))}
            {resumen.proveedores.map((p) => (
              <li key={p.id}>
                <strong>{p.razonSocial}</strong>
                {p.rubro && <span className="apagado">{p.rubro}</span>}
                <span>
                  {p.telefono ?? ''} {p.correo && <a href={`mailto:${p.correo}`}>{p.correo}</a>}
                  {!p.telefono && !p.correo && <span className="apagado">sin contacto</span>}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <Link href={`${base}/proveedores`}>Ver proveedores</Link>
          </p>
        </section>
      </div>
    </>
  )
}
