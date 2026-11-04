# Asambleas de consorcio — diseño

## Contexto

Flay no tiene nada para asambleas: hoy la convocatoria, la asistencia, los votos y el acta se hacen en
papel por fuera del sistema. El equipo quiere que la asamblea entera viva en Flay y que **el acta del
sistema sea la oficial**. Es un **cambio de alcance**: `docs/entrega-1/04-alternativas-solucion.md:168`
excluye hoy «Asambleas, votaciones y actas con validez legal». Hay que documentarlo (RF/RN/CU nuevos) y
quitar esa exclusión, justificando la firma elegida (abajo).

Marco legal: CCyC arts. 2058–2064 y reglamento del cliente
(`datos-cliente/reglamento/reglamento-copropiedad.md` arts. 18–24): convocatoria con orden del día
preciso (tratar otro tema es nulo salvo unanimidad de todos presentes), mayoría doble por unidades y por
coeficientes, poder simple con tope por mandatario, moroso sin voto, acta redactada por secretario y
firmada por presidente + dos propietarios.

## Qué es (decidido por el usuario)

1. **Reunión presencial.** La gente debate en una sala física; Flay acompaña desde el teléfono.
2. **Organizador**: un miembro del consejo (rol `consejo`) o la administración. Si organiza el consejo,
   elige si invita a la administración.
3. **Convocatoria** con fecha, hora, lugar y orden del día (puntos cargados al crear). Aviso a los
   propietarios y **«agregar a Google Calendar»**: el evento (título, fecha/hora, lugar, orden del día y
   enlace a la asamblea en Flay) se agrega desde la pantalla de la asamblea y desde el aviso.
4. **Asistentes con voto**: propietarios, y otra persona (típicamente el inquilino) **solo con poder** del
   propietario. **El poder lo otorga el propietario mismo en Flay** a otro usuario del consorcio.
5. **Durante la reunión**: consejo o administración la abre, toma asistencia y se vota cada punto.
   **Cada uno vota desde su teléfono; quien dirige carga a mano** a quien no puede.
6. **Tipos de punto**: positivo / negativo / abstención, **o multiple choice** (opciones cargadas con el
   punto).
7. **Vista en vivo**: con la reunión abierta, la pantalla refleja en vivo todo lo que pasa: punto en
   tratamiento y sus opciones, asistencia y quórum, votos que van entrando (conteo por opción en unidades
   y coeficientes, y quién votó qué), resultado de cada punto al cerrarse y los puntos ya tratados. Un
   presente vota desde esa misma pantalla.
8. **Un voto se cambia solo con el punto abierto**: lo cambia quien representa a la unidad; quien
   dirige no pisa el voto propio de una unidad, y cerrado el punto ya nadie lo modifica.
9. **Regla de mayoría configurable por consorcio**: sobre los presentes (reglamento) o sobre la totalidad
   (CCyC 2060), en cuyo caso lo aprobado solo por mayoría de presentes queda **provisorio**, se notifica a
   los ausentes, pueden **oponerse en Flay durante 15 días** y luego queda firme o cae.
10. **Acta**: durante la reunión solo se registran asistencia y votos; **los resúmenes de cada punto se
    redactan después**. Firma: **firma electrónica en Flay** (cada firmante confirma con su sesión; Flay
    guarda quién, cuándo y el hash del PDF). No firma digital con certificado.
11. **Propietarios sin cuenta en Flay**: la convocatoria y el aviso a ausentes van también por correo a
    `Persona.correo`; la administración (o quien dirige, si la administración no está invitada) carga en su
    nombre el poder o la oposición recibidos en papel; quien dirige carga su voto a mano.
12. **Multiple choice gana la más votada** (pluralidad), contada por unidades y por coeficientes. Si una
    opción gana por unidades y otra por coeficientes, o hay empate, **no hay decisión**.
13. **Administración no invitada**: no recibe la convocatoria y no puede dirigir ni cargar votos, pero
    **ve** la asamblea y el acta como todo lo del consorcio.

## Decisiones del diseñador (a revisar)

- Configuración por consorcio, con defaults del reglamento: anticipación de convocatoria 15 días,
  máximo 3 unidades por apoderado, pierde el voto quien adeuda **más de 2** expensas (deuda calculada con
  lo existente en `src/aplicacion/pagos/estado-de-cuenta.ts` / `saldosDeUnidad`), regla de mayoría.
- **Voto por unidad**, nominal (no secreto). Condominio: vota quien se acreditó primero, y puede
  cambiar el voto mientras el punto está abierto.
- Cada punto declara su mayoría requerida: absoluta / dos tercios / unanimidad. Resultado por **doble
  cómputo** (unidades y coeficientes) sobre la base que dicte la regla del consorcio.
- Quórum en primera convocatoria: coeficientes presentes > 50 %. **Segunda convocatoria** a los 30 min
  (art. 20 del reglamento), sesiona con los presentes; lo decide el reloj al abrir.
- **Denominadores**: la abstención cuenta como presente que no suma. El moroso presente cuenta para el
  quórum pero no vota ni integra la base de votos. Con la regla «totalidad», la base son las unidades
  vigentes (`bajaDesde: null`) sin morosos.
- **Decisión provisoria** (regla «totalidad», solo puntos binarios): el silencio del ausente es
  conformidad; 15 días corridos desde el aviso; cae si votos en contra + oposiciones impiden la mayoría
  sobre la totalidad en doble cómputo. Las oposiciones van en tabla aparte (la asamblea finalizada sigue
  inmutable); el estado de cada decisión (`provisoria`/`firme`/`caida`) es derivado. El acta se firma sin
  esperar; consigna qué decisiones quedan provisorias.
- Los puntos multiple choice se deciden siempre por pluralidad entre los presentes y quedan firmes al
  cerrar (la regla «totalidad» no aplica a ellos).
- El poder vale para **una reunión**; tope por apoderado se valida al otorgar. Revocable hasta que abra la
  reunión.
- El orden del día es editable solo mientras la asamblea está en borrador; enviada la convocatoria, queda
  fijo.
- Al abrir, quien dirige registra **presidente y secretario** entre los presentes.
- Estados: `borrador → convocada → en_curso → finalizada → acta_firmada` (+ `cancelada` desde convocada).
  Máquina de estados en dominio, como `src/dominio/reclamos/estado.ts`.
- Al finalizar, asistencia, votos y resultados quedan inmutables (permisos y disparador como la bitácora).
- El **secretario** redacta los resúmenes después de la reunión (quien dirige también puede).
- Firmantes: **presidente, secretario y dos propietarios presentes** (art. 24 del reglamento), elegidos
  por quien dirige entre personas con usuario en Flay; plazo de 10 días (aviso).
  Con las cuatro firmas el PDF queda como `DocumentoConsorcio` tipo `acta` (`TipoDocumento.acta`), indexado
  para el asistente (RF-20) y visible a consorcistas.

## Qué se reutiliza

- Roles y autorización: `Rol.consejo` (`prisma/schema.prisma:205`), `conAutorizacion`
  (`src/aplicacion/autorizacion.ts:19`), aislamiento por `consorcioId` (`src/infraestructura/cliente-aislado.ts`).
- Propietarios/inquilinos vigentes: `src/infraestructura/repositorios/ocupaciones.ts`
  (`ocupantesVigentes`, `usuariosQueOcupan`). Coeficientes: `Unidad.coeficiente`, filtrar `bajaDesde: null`.
- Aviso de convocatoria, oposición y firma: `notificar` (`src/aplicacion/comunicacion/notificar.ts:31`),
  nuevos valores de `TipoNotificacion`.
- Vista en vivo: `EnVivo` (`src/app/(panel)/en-vivo.tsx`), refresco cada 3 s.
- PDF del acta: patrón de `src/infraestructura/documentos/expensa.tsx` + contrato en
  `src/dominio/contratos/documentos.ts` + trabajo de cola nuevo (`TipoTrabajo`), guardado con `ALMACEN`.
- Documento final: `cargarDocumento` (`src/aplicacion/comunicacion/documentos.ts:57`).
- Google Calendar: enlace de plantilla `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…
  &dates=…/…&location=…&details=…` (sin OAuth ni dependencia), en la pantalla y en el correo. Además un
  `.ics` generado a mano (texto plano) servido por una ruta, para Apple/Outlook. El correo no lleva
  adjunto (el puerto `Notificador` es solo texto): lleva los enlaces. Si la asamblea se reprograma o
  cancela, el aviso nuevo trae el enlace actualizado (la plantilla de Google no actualiza un evento ya
  guardado; integración con la API de Google Calendar queda fuera).
- Vista en vivo: `EnVivo` con refresco cada 3 s, montado solo mientras la asamblea está `en_curso`; cada
  refresco relee de la base el estado completo (punto activo, asistencia, conteo, resultados).
- Estructura de punta a punta: seguir reservas/reclamos (`src/aplicacion/reservas/`,
  `src/app/(panel)/consorcios/[consorcio]/reservas/`, `secciones.ts`, pruebas en `pruebas/{dominio,
  integracion,e2e}`).

## No-objetivos

- Asamblea virtual o híbrida, videollamada, grabación.
- Firma digital con certificado (Ley 25.506) — se justifica la firma electrónica en el doc.
- ~~Redacción del acta asistida por IA.~~ Se sumó después, respetando RN-14: ver
  `2026-11-03-acta-asistida-design.md`.
- Elegir al consejo o a autoridades permanentes desde Flay.

## Dominio con TDD (obligatorio, toca votos y coeficientes)

Funciones puras en `src/dominio/asambleas/`: quórum, habilitación para votar (moroso, poder, tope),
resultado de un punto (binario: doble mayoría, tres umbrales, base presentes/total; multiple choice:
pluralidad en doble cómputo, sin decisión si los cómputos discrepan o hay empate),
estado de la decisión provisoria tras 15 días y oposiciones. Coeficientes con `Prisma.Decimal`, nunca
`number`.

## Entregables y pasos

1. Escribir este diseño en `docs/superpowers/specs/2026-11-03-asambleas-design.md` y commitearlo en una
   rama nueva (no en `main`).
2. Plan: por la convención del repo (CLAUDE.md) la funcionalidad nueva sigue Spec Kit —
   `/speckit-specify` con este diseño como entrada → `/speckit-plan` → `/speckit-tasks`.
3. Documentación: RF nuevos en `docs/entrega-1/04-alternativas-solucion.md` (y quitar la exclusión),
   RN en `docs/entrega-3/07-analisis-de-datos.md` § 7.2, CU en `docs/entrega-3/12-diseno.md` § 4 y la
   matriz de trazabilidad, tabla de notificaciones.

## Verificación

- `npm run test:dominio`: quórum, doble mayoría en los tres umbrales, multiple choice, moroso, tope de
  poderes, provisoria → firme / caída.
- `npm run test:integracion`: aislamiento entre consorcios, voto firme al cerrar el punto (también para
  quien dirige), inmutabilidad tras finalizar, firma con hash.
- `npm run test:e2e` en teléfono 390×844: un presente entra, ve el punto en vivo y vota; quien dirige
  carga un voto manual.
- `npm run verificar` completo antes del PR, más `docs:versiones`, `npm audit` y gitleaks.
