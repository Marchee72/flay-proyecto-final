import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, CalendarDays, Circle, FileText, Receipt, Siren, Users } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar, plural } from '@/compartido/formato'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { misExpensas, type EstadoPagoExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { listarPeriodos, type PeriodoDelConsorcio } from '@/aplicacion/periodos/periodos'

import { conConsorcio } from '../../../con-consorcio'
import { EstadoDelPeriodo } from '../../../estado-periodo'
import { Filtros } from '../../../filtros'
import { TablaDesplazable } from '../../../tabla-desplazable'

export const metadata: Metadata = { title: 'Expensas — Flay' }

/**
 * Expensas (`CU-06`, `RF-08`). **Dos pantallas segun para que se entra.**
 *
 * Quien administra -administrador y consejo- viene con dos preguntas: como
 * viene el mes que todavia no se emitio y como quedo el ultimo que si. Las dos
 * se contestan arriba, en sendas tarjetas, y abajo esta la historia completa:
 * una fila por periodo **con su estado**, emitido o no. La expensa unidad por
 * unidad es el detalle de cada una y se abre desde la liquidacion.
 *
 * El consorcista viene a ver **la suya**: una fila por expensa de las unidades
 * que ocupa, con como viene de cobro y el documento para descargar.
 *
 * La diferencia no es solo de lectura: `misExpensas` pide una URL firmada por
 * expensa, y sobre las 96 unidades del consorcio grande eso son cientos de
 * firmas por carga para una tabla que nadie lee entera. Para quien administra
 * no se lo llama.
 */
export default async function ExpensasPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  const { consorcio: consorcioId } = await params
  const { periodo } = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Expensas')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    // Los roles primero: deciden que se consulta. `rolesEn` esta cacheado por
    // pedido, asi que preguntarlo antes no cuesta una consulta mas.
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
    const administra = roles.includes('administrador')
    const esDeLaAdministracion = administra || roles.includes('consejo')

    const [periodos, unidades] = await Promise.all([
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      esDeLaAdministracion
        ? Promise.resolve([])
        : misExpensas(ALMACEN, HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])

    // El mes que todavia no se emitio: el mas nuevo sin liquidacion vigente.
    // La lista ya viene del mas nuevo al mas viejo.
    const enCurso = periodos.find((periodo) => !periodo.liquidacion && periodo.estado !== 'anulado')
    // La ultima emitida es la primera con liquidacion, por el mismo orden.
    // `flatMap` en vez de `filter` para que el tipo sepa que la liquidacion
    // esta: con `filter` sigue siendo opcional y hay que afirmarlo en cada uso.
    const [ultimaEmitida] = periodos.flatMap((periodo) =>
      periodo.liquidacion ? [{ ...periodo, liquidacion: periodo.liquidacion }] : [],
    )

    if (esDeLaAdministracion) {
      return (
        <>
          <h1>Expensas</h1>
          <p className="apagado">
            Cómo viene el mes y cómo quedó el anterior. El detalle por unidad está dentro de cada
            liquidación.
          </p>

          {/* Las dos preguntas de la pantalla, una al lado de la otra; se
              apilan solas en teléfono (RNF-01). */}
          <div className="par-de-tarjetas">
            <PeriodoEnCurso periodo={enCurso} consorcioId={activo.id} administra={administra} />
            <UltimaLiquidada periodo={ultimaEmitida} consorcioId={activo.id} />
          </div>

          {periodos.length === 0 ? (
            <div className="vacio">
              <FileText aria-hidden="true" />
              <p>Todavía no hay períodos. El primero nace con el primer gasto que cargues.</p>
            </div>
          ) : (
            <div className="tabla-desplazable">
              <table>
                <caption>{plural(periodos.length, 'período', 'períodos')}</caption>
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Vence</th>
                    <th scope="col" className="numero">
                      Total emitido
                    </th>
                    <th scope="col" className="numero">
                      Gastos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((periodo) => {
                    const etiqueta = `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`

                    return (
                      <tr key={periodo.id}>
                        <td className="principal">
                          {/* Emitido, se entra por la liquidación; sin emitir,
                              por el período, que es donde se lo cierra y liquida.
                              El consejo no tiene esa pantalla, así que ve el mes
                              sin enlace en vez de un enlace que lo rebota. */}
                          {periodo.liquidacion ? (
                            <Link
                              href={`/consorcios/${activo.id}/liquidaciones/${periodo.liquidacion.id}`}
                            >
                              {etiqueta}
                            </Link>
                          ) : administra ? (
                            <Link href={`/consorcios/${activo.id}/periodos/${periodo.id}`}>
                              {etiqueta}
                            </Link>
                          ) : (
                            etiqueta
                          )}
                        </td>
                        <td>
                          <EstadoDelPeriodo estado={periodo.estado} />
                        </td>
                        {/* Sin emitir no hay ni vencimiento ni total. El guión
                            sostiene la columna en escritorio; en teléfono, donde
                            las celdas se encadenan con «·», `sin-dato` las saca
                            en vez de dejar dos guiones sueltos. */}
                        <td className={periodo.liquidacion ? undefined : 'sin-dato apagado'}>
                          {periodo.liquidacion
                            ? fechaParaMostrar(periodo.liquidacion.vencimiento)
                            : '—'}
                        </td>
                        <td
                          className={`numero cifra${periodo.liquidacion ? '' : ' sin-dato apagado'}`}
                        >
                          {periodo.liquidacion
                            ? importeParaMostrar(periodo.liquidacion.totalGeneral)
                            : '—'}
                        </td>
                        <td className="numero cifra">
                          <Link href={`/consorcios/${activo.id}/gastos?periodo=${periodo.id}`}>
                            {periodo.gastos}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )
    }

    // Una sola tabla: doce tarjetas con una fila cada una es mucho
    // desplazamiento para poco dato.
    const todas = unidades.flatMap((unidad) =>
      unidad.expensas.map((expensa) => ({ unidad, expensa })),
    )
    // El filtro se aplica sobre lo ya cargado: son las expensas que el usuario
    // puede ver, y son pocas por unidad.
    const periodosEmitidos = [
      ...new Map(todas.map((f) => [f.expensa.periodoId, f.expensa.periodo])),
    ]
    const filas = periodo ? todas.filter((f) => f.expensa.periodoId === periodo) : todas

    return (
      <>
        <h1>Expensas</h1>
        <p className="apagado">Tus liquidaciones emitidas, con el documento de cada una.</p>

        <PeriodoEnCurso periodo={enCurso} consorcioId={activo.id} administra={administra} />

        {todas.length > 0 && (
          <Filtros>
            <form method="get" className="fila-de-filtros">
              <div className="campo">
                <label htmlFor="periodo">Período</label>
                <select id="periodo" name="periodo" defaultValue={periodo ?? ''}>
                  <option value="">Todos</option>
                  {periodosEmitidos.map(([id, etiqueta]) => (
                    <option key={id} value={id}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <button className="boton boton--fantasma" type="submit">
                Filtrar
              </button>
            </form>
          </Filtros>
        )}

        {unidades.length === 0 ? (
          <div className="vacio">
            <Users aria-hidden="true" />
            <p>No hay unidades a tu nombre en este consorcio.</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="vacio">
            <FileText aria-hidden="true" />
            <p>
              {todas.length === 0
                ? 'Todavía no hay liquidaciones emitidas.'
                : 'No hay expensas de ese período.'}
            </p>
          </div>
        ) : (
          <TablaDesplazable>
            <table>
              <caption>
                {plural(filas.length, 'liquidación', 'liquidaciones')} en{' '}
                {plural(unidades.length, 'unidad', 'unidades')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Unidad</th>
                  <th scope="col">Período</th>
                  <th scope="col">Vence</th>
                  <th scope="col" className="numero">
                    Total
                  </th>
                  <th scope="col">Estado</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Gastos</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ unidad, expensa }) => (
                  <tr key={expensa.detalleId}>
                    <td>{unidad.designacion}</td>
                    <td>
                      <Link href={`/consorcios/${activo.id}/expensas/${expensa.detalleId}`}>
                        {expensa.periodo}
                      </Link>
                    </td>
                    <td>{fechaParaMostrar(expensa.vencimiento)}</td>
                    <td className="numero cifra">{importeParaMostrar(expensa.totalUnidad)}</td>
                    <td>
                      <EstadoDeCobro estado={expensa.estadoPago} saldo={expensa.saldo} />
                    </td>
                    <td>
                      {expensa.direccion ? (
                        <a href={expensa.direccion} download>
                          Descargar
                        </a>
                      ) : (
                        <span className="ayuda">En generación</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/consorcios/${activo.id}/gastos?periodo=${expensa.periodoId}`}>
                        Ver gastos
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaDesplazable>
        )}
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }
}

/**
 * El mes que todavia no se emitio: es la pregunta que trae a esta pantalla
 * -«cómo viene este mes»- y antes solo se contestaba en el Resumen (`RF-07`,
 * `CU-03`).
 *
 * **La tarjeta esta siempre**, aunque no haya periodo abierto. Antes
 * desaparecia justo cuando no habia nada cargado, que es cuando mas falta hace
 * decir que sigue: el periodo no se abre a mano, nace con el primer gasto.
 *
 * El acumulado lo ve cualquier rol, igual que los gastos del consorcio; emitir
 * es del administrador, asi que el enlace a la revision es el unico que depende
 * del rol.
 */
function PeriodoEnCurso({
  periodo,
  consorcioId,
  administra,
}: {
  periodo: PeriodoDelConsorcio | undefined
  consorcioId: string
  administra: boolean
}) {
  if (!periodo) {
    return (
      <section className="tarjeta tarjeta--oscura" aria-label="Período en curso">
        <h2>
          <CalendarDays className="icono" aria-hidden="true" />
          Período en curso
        </h2>
        <p className="apagado">
          No hay ninguno abierto. El próximo nace solo, con el primer gasto que se le impute.
        </p>
        <div className="fila-acciones">
          <Link className="boton boton--fantasma" href={`/consorcios/${consorcioId}/gastos`}>
            {administra ? 'Cargar un gasto' : 'Ver gastos'}
          </Link>
        </div>
      </section>
    )
  }

  const etiqueta = `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`

  return (
    <section className="tarjeta tarjeta--oscura" aria-label={`Período en curso ${etiqueta}`}>
      <h2>
        <CalendarDays className="icono" aria-hidden="true" />
        Período en curso · {etiqueta}
      </h2>
      <p className="apagado">
        {periodo.estado === 'abierto'
          ? 'Todavía admite gastos; cuando esté todo cargado se liquida.'
          : 'Cerrado: no entran más gastos y está listo para liquidar.'}
      </p>

      <div className="resumen" role="list" aria-label="Lo cargado hasta ahora">
        <div className="resumen__item" role="listitem">
          <span className="resumen__rotulo">Gastos cargados</span>
          <span className="resumen__valor cifra">{periodo.gastos}</span>
        </div>
        <div className="resumen__item" role="listitem">
          <span className="resumen__rotulo">Acumulado</span>
          <span className="resumen__valor cifra">{importeParaMostrar(periodo.gastado)}</span>
        </div>
      </div>

      <div className="fila-acciones">
        <Link
          className="boton boton--fantasma"
          href={`/consorcios/${consorcioId}/gastos?periodo=${periodo.id}`}
        >
          Ver gastos
        </Link>
        {administra && (
          <Link
            className="boton boton--primario"
            href={`/consorcios/${consorcioId}/periodos/${periodo.id}`}
          >
            Revisar y liquidar
          </Link>
        )}
      </div>
    </section>
  )
}

/**
 * Lo ultimo emitido, al lado del mes en curso: es contra esto que se compara lo
 * que se esta acumulando. Sale de la misma lista de periodos, sin una consulta
 * mas.
 */
function UltimaLiquidada({
  periodo,
  consorcioId,
}: {
  periodo:
    | (PeriodoDelConsorcio & { liquidacion: NonNullable<PeriodoDelConsorcio['liquidacion']> })
    | undefined
  consorcioId: string
}) {
  if (!periodo) {
    return (
      <section className="tarjeta" aria-label="Última liquidación">
        <h2>
          <Receipt className="icono" aria-hidden="true" />
          Última liquidación
        </h2>
        <p className="apagado">Todavía no se emitió ninguna.</p>
      </section>
    )
  }

  const etiqueta = `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`

  return (
    <section className="tarjeta" aria-label={`Última liquidación ${etiqueta}`}>
      <h2>
        <Receipt className="icono" aria-hidden="true" />
        Última liquidación · {etiqueta}
      </h2>
      <p className="apagado">Vence el {fechaParaMostrar(periodo.liquidacion.vencimiento)}.</p>

      <div className="resumen" role="list" aria-label="Lo emitido">
        <div className="resumen__item" role="listitem">
          <span className="resumen__rotulo">Total emitido</span>
          <span className="resumen__valor cifra">
            {importeParaMostrar(periodo.liquidacion.totalGeneral)}
          </span>
        </div>
        <div className="resumen__item" role="listitem">
          <span className="resumen__rotulo">Gastos</span>
          <span className="resumen__valor cifra">{periodo.gastos}</span>
        </div>
      </div>

      <div className="fila-acciones">
        <Link
          className="boton boton--primario"
          href={`/consorcios/${consorcioId}/liquidaciones/${periodo.liquidacion.id}`}
        >
          Ver liquidación
        </Link>
        <Link className="boton boton--fantasma" href={`/consorcios/${consorcioId}/morosidad`}>
          Ver morosidad
        </Link>
      </div>
    </section>
  )
}

/**
 * Como viene de cobro **esa** expensa, para quien la debe. «Liquidado» en cada
 * fila no le dice nada -todas lo estan-; lo que pregunta es si la pago.
 *
 * Color + icono + palabra, nunca color solo (guía §3.2). El saldo va en el
 * `title` y no en la pastilla para que la columna no se desarme en teléfono.
 */
const ETIQUETA_COBRO: Record<
  EstadoPagoExpensa,
  { texto: string; clase: string; Icono: typeof Circle }
> = {
  pagada: { texto: 'Pagada', clase: 'etiqueta--rendido', Icono: BadgeCheck },
  vencida: { texto: 'Vencida', clase: 'etiqueta--vencido', Icono: Siren },
  pendiente: { texto: 'Pendiente', clase: 'etiqueta--pendiente', Icono: Circle },
}

function EstadoDeCobro({ estado, saldo }: { estado: EstadoPagoExpensa; saldo: string }) {
  const { texto, clase, Icono } = ETIQUETA_COBRO[estado]

  return (
    <span
      className={`etiqueta ${clase}`}
      title={
        estado === 'pagada' ? 'Sin saldo pendiente' : `Falta pagar ${importeParaMostrar(saldo)}`
      }
    >
      <Icono className="icono" aria-hidden="true" />
      {texto}
    </span>
  )
}
