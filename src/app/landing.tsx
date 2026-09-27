import Link from 'next/link'
import {
  ArrowRight,
  CircleCheck,
  FileText,
  LogIn,
  MessageSquareWarning,
  ShieldCheck,
} from 'lucide-react'

/**
 * La portada sin sesion (rediseño 013): que es Flay, para quien, como
 * funciona y una sola accion, Ingresar, repetida. Las garantias son las del
 * sistema de verdad —aislamiento, bitacora, confirmacion humana—, no
 * testimonios inventados. Las cifras de la vista previa son un ejemplo.
 */
export function Landing() {
  return (
    <div className="landing">
      <section className="landing__heroe">
        <nav className="landing__nav" aria-label="Principal">
          <span className="marca">FLAY</span>
          <div className="landing__enlaces">
            <a href="#como">Cómo funciona</a>
            <a href="#administracion">Para la administración</a>
            <a href="#vecinos">Para los vecinos</a>
            <Link className="boton boton--lima" href="/ingresar">
              <LogIn className="icono" aria-hidden="true" />
              Ingresar
            </Link>
          </div>
        </nav>

        <div className="landing__heroe-cuerpo">
          <div className="landing__propuesta">
            <span className="landing__sello">Tu consorcio online</span>
            <h1>
              Las expensas, los reclamos y el edificio,{' '}
              <span className="landing__acento">al día y a la vista.</span>
            </h1>
            <p>
              Flay es el sistema de la administración de tu consorcio. Liquida las expensas al
              centavo, ordena cada reclamo con su historial y le deja a cada vecino ver lo suyo
              desde el teléfono.
            </p>
            <div className="landing__acciones">
              <Link className="boton boton--lima boton--grande" href="/ingresar">
                Ingresar
                <ArrowRight className="icono" aria-hidden="true" />
              </Link>
              <a className="boton boton--sobre-oscuro boton--grande" href="#como">
                Ver cómo funciona
              </a>
            </div>
          </div>

          <div className="landing__vista" aria-hidden="true">
            <div className="landing__expensa">
              <div className="landing__expensa-cabeza">
                <div>
                  <span>Expensa 07/2026 · Unidad 1A</span>
                  <strong className="cifra">$ 283.687,58</strong>
                </div>
                <span className="etiqueta etiqueta--propietario">Vence el 10/08</span>
              </div>
              <ul>
                <li>
                  <span>Mantenimiento de ascensores</span>
                  <span className="cifra">$ 399.693,16</span>
                </li>
                <li>
                  <span>Seguro del edificio</span>
                  <span className="cifra">$ 213.613,99</span>
                </li>
                <li>
                  <span>Reparaciones menores</span>
                  <span className="cifra">$ 161.239,43</span>
                </li>
              </ul>
              <div className="landing__expensa-acciones">
                <span>
                  <FileText className="icono" />
                  Descargar PDF
                </span>
                <span>Ver gastos</span>
              </div>
            </div>
            <div className="landing__aviso">
              <span className="aviso-tono aviso-tono--ambar">
                <MessageSquareWarning className="icono" />
              </span>
              <span>
                <small>Ahora</small>
                <strong>Tu reclamo pasó a «En curso»</strong>
                <span>Luz de emergencia de la escalera</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing__publicos">
        <div className="landing__publico" id="administracion">
          <span className="landing__rotulo">Para la administración</span>
          <h2>Cerrar el mes sin planillas.</h2>
          <Punto titulo="Liquidación por coeficiente, exacta">
            Cada importe se calcula con decimales fijos y el redondeo queda a la vista en su propio
            campo.
          </Punto>
          <Punto titulo="Carga asistida de comprobantes">
            Subís la factura, el sistema propone proveedor, rubro e importe, y vos confirmás antes
            de que sea un gasto.
          </Punto>
          <Punto titulo="Reclamos con responsable e historial">
            Prioridad, estado y cada cambio registrado, en una bandeja que cruza todos tus
            edificios.
          </Punto>
          <Punto titulo="Indicadores que se leen de un vistazo">
            Morosidad, gasto por rubro y desvíos contra el promedio de cada consorcio.
          </Punto>
        </div>
        <div className="landing__publico landing__publico--vecinos" id="vecinos">
          <span className="landing__rotulo">Para los vecinos</span>
          <h2>Todo lo del edificio, en el teléfono.</h2>
          <Punto titulo="Tu expensa y de qué se compone">
            El PDF de cada período con los gastos por rubro, y el estado de cuenta de tu unidad.
          </Punto>
          <Punto titulo="Reclamos que no se pierden">
            Lo cargás en un minuto y te avisamos cada vez que cambia de estado.
          </Punto>
          <Punto titulo="Reservas de los espacios comunes">
            Salón, quincho o terraza, con las reglas del reglamento aplicadas solas.
          </Punto>
          <Punto titulo="Preguntale al reglamento">
            Escribís la duda y la respuesta llega con la cita del artículo que la sostiene.
          </Punto>
        </div>
      </section>

      <section className="landing__como" id="como">
        <span className="landing__rotulo">Cómo funciona</span>
        <h2>Del gasto a la expensa, en tres pasos.</h2>
        <ol>
          <li>
            <strong>La administración carga los gastos del mes</strong>
            <span>
              A mano o subiendo el comprobante. El período se abre solo con el primer gasto.
            </span>
          </li>
          <li>
            <strong>Flay liquida y emite cada expensa</strong>
            <span>
              Prorrateo por coeficiente, intereses de mora y un PDF por unidad con el detalle de
              gastos.
            </span>
          </li>
          <li>
            <strong>Cada vecino la ve y la sigue</strong>
            <span>Con aviso en el momento, desde la computadora o el teléfono.</span>
          </li>
        </ol>
      </section>

      <section className="landing__garantias">
        <div>
          <span className="landing__escudo">
            <ShieldCheck className="icono" aria-hidden="true" />
          </span>
          <h2>La plata no se toca sin que alguien lo confirme.</h2>
          <p>
            Tres reglas que el sistema garantiza en la base de datos, no en la buena voluntad del
            código.
          </p>
        </div>
        <ul>
          <li>
            <strong>Cada consorcio ve solo lo suyo</strong>
            <span>
              El aislamiento se aplica en un único lugar del acceso a datos: no depende de que cada
              pantalla se acuerde de filtrar.
            </span>
          </li>
          <li>
            <strong>Todo cambio económico queda registrado</strong>
            <span>Una bitácora que la aplicación no puede borrar ni editar.</span>
          </li>
          <li>
            <strong>La inteligencia artificial propone, una persona decide</strong>
            <span>
              Lo que lee un servicio automático nunca se convierte en gasto sin confirmación humana.
            </span>
          </li>
        </ul>
      </section>

      <section className="landing__cierre">
        <div>
          <h2>¿Tu administración ya usa Flay?</h2>
          <p>Entrá con el correo con el que te invitaron.</p>
        </div>
        <Link className="boton boton--primario boton--grande" href="/ingresar">
          Ingresar
          <ArrowRight className="icono" aria-hidden="true" />
        </Link>
      </section>

      <footer className="landing__pie">
        <span className="marca">FLAY</span>
        <span>Proyecto Final · Ingeniería en Sistemas de Información · UTN FRRo · 2026</span>
      </footer>
    </div>
  )
}

function Punto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="landing__punto">
      <CircleCheck className="icono" aria-hidden="true" />
      <div>
        <strong>{titulo}</strong>
        <span>{children}</span>
      </div>
    </div>
  )
}
