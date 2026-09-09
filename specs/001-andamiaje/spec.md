# Especificación de etapa: Andamiaje del proyecto

**Feature Branch**: `001-andamiaje`

**Created**: 2026-09-08

**Status**: Draft

**Input**: Etapa 0 del plan de construcción de Flay. De repositorio de documentación a aplicación
desplegada que todavía no hace nada de negocio. Es la etapa que **no figura en el cronograma
académico** como fase propia: el punto 10 la contiene dentro del paquete 3.1 «Cimientos: proyecto,
esquema, migraciones e integración continua» (34 h) de la iteración 1. Esta especificación la
extrae, la ordena y la vuelve ejecutable.

> **Convención de códigos.** `FR-nnn` numera los requisitos **locales de esta especificación**.
> Los códigos del proyecto se citan siempre con su prefijo original: `RF-nn` (requerimiento
> funcional, punto 4), `RNF-nn` (no funcional, punto 4), `RN-nn` (**regla de negocio**, § 7.2),
> `RT-nn` (riesgo técnico, punto 11) y `CU-nn` (caso de uso, § 12.4). El punto 11 también usa el
> prefijo `RN-` para sus seis riesgos de negocio; para evitar la colisión, en todo el plan de
> construcción se escribe **«regla RN-nn (§ 7.2)»** y **«riesgo RN-nn (§ 11.2)»**, nunca `RN-nn`
> a secas.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Un integrante clona el repositorio y tiene el entorno corriendo (Priority: P1)

Un integrante del equipo (o el docente evaluador) clona el repositorio en una máquina limpia, sigue
la secuencia de comandos del `README` sin tomar ninguna decisión, y en menos de treinta minutos
tiene la aplicación levantada contra una base de datos con el esquema aplicado y la batería de
verificación en verde.

**Why this priority**: sin esto no existe la primera línea de código de ningún `RF-nn`. Es la
precondición de las tres iteraciones y de la propiedad colectiva del código que exige § 8.3.3.

**Independent Test**: en una máquina sin el proyecto, ejecutar la secuencia de FR-003 a FR-017 y
comprobar que `npm run verificar` termina en verde y que `http://localhost:3000/api/salud`
responde `200`.

**Acceptance Scenarios**:

1. **Given** una máquina con Node.js 22 LTS, Git y Docker y nada más, **When** se ejecuta la
   secuencia documentada de principio a fin sin intervención, **Then** la aplicación arranca, el
   esquema está aplicado y `npm run verificar` termina con código de salida 0.
2. **Given** el entorno ya instalado, **When** se ejecuta `npm run test:dominio` con la variable
   `DATABASE_URL` **sin definir**, **Then** las pruebas del dominio pasan igual, porque el dominio
   no conoce la infraestructura (Principio III).
3. **Given** el repositorio recién clonado, **When** se busca un secreto en el historial y en el
   árbol de trabajo, **Then** no aparece ninguno y todo archivo `.env*` distinto de `.env.example`
   está ignorado (hueco H-04, § 18.7).

---

### User Story 2 — La verificación automática rechaza lo que viola la constitución (Priority: P1)

Un integrante abre una solicitud de incorporación que viola un principio: importa infraestructura
desde el dominio, o escribe `a + b` sobre dos importes, o pasa un `number` como dinero. La
verificación automática del repositorio la rechaza antes de que ningún humano la revise.

**Why this priority**: los principios I, II y III sólo son exigibles si algo los verifica en cada
envío. Escritos y no verificados, se erosionan en la primera semana de apuro. Esta historia es la
sede de las medidas 2 y 4 de contención del incumplimiento del criterio C3 de § 14.1.

**Independent Test**: existen tres archivos de fixture bajo `pruebas/fixtures-negativas/` que
**deben** fallar; una prueba ejecuta el verificador sobre cada uno y afirma que falla con el
mensaje esperado.

**Acceptance Scenarios**:

1. **Given** un archivo en `src/dominio/` que importa `@/infraestructura/...`, **When** corre
   `npm run lint`, **Then** falla con la regla `no-restricted-imports` y nombra la capa violada.
2. **Given** una función del dominio cuya firma pública acepta `number` para un importe, **When**
   corre `npm run typecheck` sobre la fixture negativa, **Then** el compilador la rechaza
   (medida 2 de § 14.1).
3. **Given** una expresión `importeA + importeB` sobre dos valores de tipo `Decimal`, **When**
   corre `npm run lint`, **Then** la regla `flay/sin-aritmetica-monetaria` la marca como error
   (medida 4 de § 14.1).
4. **Given** una solicitud de incorporación con cualquiera de esos tres defectos, **When** el
   flujo de verificación corre en el repositorio remoto, **Then** la comprobación queda en rojo y
   la incorporación queda bloqueada.

---

### User Story 3 — Un envío a la rama principal queda desplegado sin intervención (Priority: P1)

Se integra un cambio a la rama principal. Sin que nadie ejecute nada, el entorno de demostración
queda actualizado y accesible por una dirección estable.

**Why this priority**: la condición 6 de la definición de terminado (§ 8.3.4) exige despliegue en
el entorno de demostración para **cada** requerimiento. Si el despliegue es manual, esa condición
se incumple sistemáticamente o consume tiempo en cada uno de los 26 `RF-nn`.

**Independent Test**: cambiar el campo `version` que devuelve `/api/salud`, integrarlo y comprobar
que la dirección pública lo refleja sin ninguna acción manual.

**Acceptance Scenarios**:

1. **Given** un cambio integrado a la rama principal, **When** termina la verificación en verde,
   **Then** el entorno de demostración sirve el cambio en menos de 10 minutos y `/api/salud`
   devuelve `200` con la nueva versión.
2. **Given** una verificación en rojo, **When** termina el flujo, **Then** **no** hay despliegue.
3. **Given** una migración pendiente en el cambio integrado, **When** se despliega, **Then** la
   migración se aplica con `prisma migrate deploy` antes de servir tráfico, y ningún cambio de
   esquema se hizo a mano sobre la base.

---

### User Story 4 — La bitácora de auditoría existe y no se puede alterar (Priority: P2)

El mecanismo de auditoría (regla RN-15 § 7.2, RNF-12, `RF-26`) queda construido en esta etapa: la
tabla, la función de disparador genérica y los permisos revocados. Las tablas económicas se le
enganchan en las etapas siguientes.

**Why this priority**: es transversal y su costo es bajo (11 h del paquete 3.7). Construirlo ahora
significa que cada tabla económica nace auditada; construirlo después obliga a volver sobre todo lo
escrito. No es P1 porque no bloquea a las historias 1 a 3.

**Independent Test**: conectarse con el usuario de aplicación e intentar `INSERT`, `UPDATE` y
`DELETE` sobre la bitácora; los tres deben ser rechazados por la base.

**Acceptance Scenarios**:

1. **Given** una tabla de prueba con el disparador `fn_auditar` instalado, **When** se inserta,
   modifica y borra una fila, **Then** la bitácora contiene tres asientos con usuario, momento,
   operación, tabla, clave e imagen anterior y posterior.
2. **Given** el usuario de base de datos de la aplicación, **When** intenta `UPDATE` o `DELETE`
   sobre la bitácora, **Then** la base responde `permission denied` (RNF-12).
3. **Given** el usuario de la aplicación, **When** intenta `INSERT` sobre la bitácora, **Then**
   también es rechazado: la bitácora se puebla **sólo** por disparador, nunca desde el código.

---

### User Story 5 — Los pendientes de documentación que bloquean la construcción quedan cerrados (Priority: P2)

Se cierran, dentro de esta etapa, los huecos H-01 a H-04 y H-10 del análisis de insumos: plataforma
y proveedores concretos, versiones fijadas en la tabla de § 14.1, estándares mínimos de § 14.4 y
política de secretos de § 18.7.

**Why this priority**: § 14.4 está previsto «al cerrar la iteración 1» y § 18.7 dice «a definir».
Un estándar escrito al final no gobierna el código ya escrito, y una política de secretos definida
después del primer envío llega tarde por definición.

**Independent Test**: buscar la cadena «A fijar» en la tabla de bibliotecas de § 14.1 y las marcas
«a definir» de § 18.7: no debe quedar ninguna dentro del alcance de esta etapa.

**Acceptance Scenarios**:

1. **Given** la tabla de bibliotecas de § 14.1, **When** se cierra esta etapa, **Then** las diez
   filas tienen versión exacta, tomada del archivo de bloqueo de dependencias y no de memoria.
2. **Given** § 14.4, **When** se cierra esta etapa, **Then** están escritos los cinco estándares
   mínimos: nomenclatura, carpetas por capa, representación del dinero, formato de errores
   (RNF-10) y registro de eventos.
3. **Given** § 18.7, **When** se cierra esta etapa, **Then** están definidas la gestión de secretos
   por ambiente y la revisión periódica de dependencias, y ambas tienen una comprobación automática
   que las hace exigibles.

---

### Edge Cases

- **La base local no tiene `pgvector`.** El contenedor de desarrollo se fija a una imagen que ya la
  incluye; la primera migración ejecuta `CREATE EXTENSION IF NOT EXISTS vector` y falla
  ruidosamente, con un mensaje que nombra la imagen correcta, si la extensión no está disponible.
- **El proveedor administrado no permite `CREATE EXTENSION` al usuario de aplicación.** La
  extensión se habilita una vez desde la consola del proveedor con el usuario propietario; el paso
  está en la secuencia y la migración es idempotente (`IF NOT EXISTS`).
- **La verificación tarda más que el presupuesto.** El presupuesto es de 10 minutos; si se excede,
  la etapa no está terminada. Las pruebas del dominio corren primero y sin base de datos, para que
  el defecto más probable falle en el primer minuto.
- **Dos migraciones creadas en ramas paralelas.** Se detecta con `prisma migrate diff` dentro de la
  verificación: una divergencia entre el esquema y el historial de migraciones deja la comprobación
  en rojo.
- **Un secreto llega al historial.** El análisis de secretos corre sobre el historial completo, no
  sólo sobre el cambio; un hallazgo bloquea la incorporación y obliga a rotar la credencial.
- **La región elegida deja de tener capa gratuita.** La aplicación es portable a cualquier
  alojamiento con Node.js (§ 14.1); el único punto de acoplamiento real es el almacenamiento de
  objetos, que se consume tras una interfaz del dominio desde el primer día.

---

## Requirements *(mandatory)*

### Functional Requirements

Esta sección es **ejecutable**: los comandos van en orden y no exigen ninguna decisión de quien los
sigue. Se ejecutan desde la raíz del repositorio, en PowerShell sobre Windows.

#### Bloque A — Decisiones de plataforma (cierra el hueco H-01)

- **FR-001**: La etapa **DEBE** registrar las cinco piezas de plataforma con proveedor, región y
  capa antes de ejecutar ningún comando. Quedan fijadas así:

  | Pieza | Proveedor | Región | Capa | Fundamento |
  |---|---|---|---|---|
  | Alojamiento de la aplicación | Vercel | `gru1` (San Pablo) | Hobby | Soporte de primera clase para Next.js (criterio C4 de § 14.1); región más próxima a Rosario con capa gratuita (§ 5.5.4) |
  | Base de datos | Neon PostgreSQL con `pgvector` | `aws-sa-east-1` (San Pablo) | Free | `NUMERIC`, restricciones de exclusión, disparadores e índice vectorial en un único motor (§ 14.1) |
  | Almacenamiento de objetos | Vercel Blob | Misma cuenta | Hobby | Comprobantes (`RF-05`) y documentación (`RF-19`); se consume tras una interfaz del dominio |
  | Correo transaccional | Resend | — | Free | Necesario ya en la etapa 1 (`002-nucleo`) para la invitación de usuario (hueco H-06), aunque el despachador general llegue en la etapa 3 (`004-servicios`) |
  | Verificación y despliegue | GitHub Actions | — | Público | Verificación automática en cada envío (§ 8.3.5) |

  > **Estas cinco elecciones son la resolución propuesta del hueco H-01 y requieren ratificación
  > explícita del equipo antes de contratar (I-12).** No reabren § 14.1: aquel punto fija lenguaje, motor
  > de base, mapeador y bibliotecas, y **no** fija proveedor de plataforma. Los datos personales
  > quedan bajo Ley 25.326 (RNF-13): la región elegida y las cláusulas del contrato son la
  > condición de verificación de § 5.5.4.
  >
  > **Paso 0 — Ratificación (I-12).** Antes del Bloque B, el equipo ratifica FR-001 en la reunión
  > de arranque con ambos integrantes presentes; se registra en el acta qué piezas se ratifican y
  > cuáles se cambian, incluyendo las cláusulas de Ley 25.326 de § 5.5.4. Regla por defecto: la
  > propuesta rige si no hay objeción en esa reunión. Sin acta de ratificación, el Bloque B no arranca.

- **FR-002**: Los entornos **DEBEN** ser tres, conforme a § 8.3.5: **desarrollo local**
  (contenedor), **demostración** (desplegado automáticamente desde la rama principal) y
  **producción** (desplegado manualmente desde una etiqueta). Producción no se contrata en esta
  etapa; su definición sí queda escrita.

#### Bloque B — Secuencia ejecutable

- **FR-003**: Verificar los prerrequisitos y fijar el runtime (M-06). Las versiones son exactas y no se eligen:

  ```powershell
  node --version    # debe imprimir v22.x  (Node.js 22 LTS)
  npm --version     # debe imprimir 10.x o superior
  git --version
  docker --version  # para la base de datos local
  ```

  El runtime queda fijado en `engines` de `package.json` + `.nvmrc` + `setup-node` del flujo FR-018,
  para que desarrollo y verificación usen el mismo Node.

- **FR-004**: Generar el proyecto en un directorio temporal y trasladarlo a la raíz con versión
  **fijada** del generador (M-06). El repositorio
  ya contiene `docs/`, `CLAUDE.md` y `.specify/`, y el generador exige un directorio vacío:

  ```powershell
  npx --yes create-next-app@15.3.4 .tmp-flay --typescript --eslint --app --src-dir --no-tailwind --use-npm --import-alias "@/*" --skip-install
  Get-ChildItem -Path .tmp-flay -Force | Move-Item -Destination . -Force
  Remove-Item .tmp-flay -Recurse -Force
  npm install
  ```

  La versión del generador queda fijada (no `latest`) y se registra en el acta del Paso 0 (M-06).

  Si el generador ofreciera alguna opción no cubierta por las banderas, la respuesta es **no** en
  todos los casos: esta etapa no agrega nada que § 14.1 no haya comprometido.

- **FR-005**: Instalar exactamente las dependencias de § 14.1, sin agregar ninguna otra, con
  **versiones exactas fijadas antes de instalar** (I-03). Las versiones se toman de la tabla de
  § 14.1 —que el Paso 0 deja sin celdas «A fijar»— y FR-023 las verifica contra `package-lock.json`,
  no las descubre después:

  ```powershell
  npm install prisma @prisma/client zod next-auth @node-rs/argon2 decimal.js @react-pdf/renderer recharts
  npm install --save-dev vitest @vitest/coverage-v8 @playwright/test prettier eslint-config-prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
  npx playwright install --with-deps chromium
  ```

- **FR-006**: Crear la estructura de carpetas por capa. Es la materialización del Principio III y
  de § 12.1.2, y es también el estándar de carpetas que § 14.4 debe registrar:

  ```powershell
  New-Item -ItemType Directory -Force -Path src/app, src/aplicacion, src/dominio, src/dominio/contratos, src/infraestructura, src/compartido, prisma/migrations, pruebas/dominio, pruebas/integracion, pruebas/e2e, pruebas/fixtures-negativas, reglas-eslint
  ```

  | Carpeta | Capa | Qué puede importar |
  |---|---|---|
  | `src/app` | Presentación | `src/aplicacion`, `src/compartido` |
  | `src/aplicacion` | Aplicación | `src/dominio`, `src/infraestructura`, `src/compartido` |
  | `src/dominio` | Dominio | `src/dominio`, `src/compartido` y **nada más** |
  | `src/infraestructura` | Infraestructura | `src/dominio/contratos`, `src/compartido` |
  | `src/compartido` | Transversal | nada del proyecto |

- **FR-007**: Levantar la base de datos local con la imagen que ya incluye `pgvector`, fijada por
  etiqueta exacta:

  ```powershell
  if (-not (docker ps -a --format "{{.Names}}" | Select-String -Quiet "^flay-db$")) {
    docker run -d --name flay-db -p 5432:5432 -e POSTGRES_PASSWORD=flay_local -e POSTGRES_DB=flay pgvector/pgvector:pg17
  }
  ```

  Guarda idempotente (M-06): re-ejecutar no falla si el contenedor ya existe.

- **FR-008**: Crear `.env.example` con **nombres** de variable y ningún valor, y `.env.local` con
  los valores locales. `.env.local` **DEBE** estar ignorado antes de existir:

  ```powershell
  if (-not (Select-String -Quiet -Pattern '^\.env$' .gitignore)) { Add-Content .gitignore ".env" }
  if (-not (Select-String -Quiet -Pattern '^\.env\.\*$' .gitignore)) { Add-Content .gitignore ".env.*" }
  if (-not (Select-String -Quiet -Pattern '^\!\/\.env\.example$' .gitignore)) { Add-Content .gitignore "!.env.example" }
  Set-Content .env.example "DATABASE_URL=`nAUTH_SECRET=`nBLOB_READ_WRITE_TOKEN=`nRESEND_API_KEY=`nSHADOW_DATABASE_URL="
  if (-not (Test-Path .env.local)) { Set-Content .env.local "DATABASE_URL=postgresql://postgres:flay_local@localhost:5432/flay`nSHADOW_DATABASE_URL=postgresql://postgres:flay_local@localhost:5432/flay_shadow" }
  ```

  Guarda idempotente (M-06): no duplica líneas de `.gitignore` ni sobrescribe `.env.local` con
  secretos al re-ejecutarse. `SHADOW_DATABASE_URL` queda definido aquí (I-01) con default local.

  El valor de `AUTH_SECRET` se genera con `npx --yes auth secret` y **nunca** se escribe en un
  archivo versionado.

- **FR-009**: Definir el esquema inicial de Prisma y generar la **primera migración versionada**.
  Contiene únicamente lo transversal; ninguna entidad de negocio nace en esta etapa:

  ```powershell
  npx prisma init --datasource-provider postgresql
  # editar prisma/schema.prisma segun FR-010, luego:
  npx prisma migrate dev --name inicial
  ```

- **FR-010**: La migración `inicial` **DEBE** contener, en este orden, y define los dos roles
  de base (I-02):

  0. Roles: `flay_owner` (propietario, crea extensiones y esquema, corre migraciones) y `flay_app`
     (usuario de aplicación, DML sobre tablas de negocio, sin DDL). Local se crean al levantar el
     contenedor; en demostración el propietario es el rol administrador del proveedor y `flay_app`
     el rol de la cadena de conexión de la aplicación. La aplicación **siempre** se conecta como
     `flay_app`; el propietario solo se usa para `db:deploy`.
  1. `CREATE EXTENSION IF NOT EXISTS vector;` — índice vectorial de `RF-20`.
  2. `CREATE EXTENSION IF NOT EXISTS btree_gist;` — restricciones de exclusión de las reglas RN-09
     y RN-10 (§ 7.2), que las etapas 2 y 4 necesitan.
  3. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — identificadores universalmente únicos generados
     en la base (§ 12.3).
  4. La tabla `BitacoraAuditoria` y la función de disparador genérica `fn_auditar()`, declarada
     `SECURITY DEFINER`.
  5. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "BitacoraAuditoria" FROM flay_app;`
     — RNF-12. Sin marcador (I-02): el rol es siempre `flay_app`.

- **FR-011**: Configurar el aislamiento por consorcio en **un solo punto** (Principio I, regla
  RN-12 § 7.2, riesgo RT-04): una extensión del cliente de Prisma en
  `src/infraestructura/cliente-aislado.ts` que inyecta el filtro por consorcio en toda consulta
  sobre un modelo que declare `consorcioId`, y que **falla en tiempo de ejecución** si se la invoca
  sin contexto de consorcio. En esta etapa se entrega el mecanismo y su prueba; los modelos llegan
  en la etapa 2. Ninguna consulta del código de negocio usa el cliente crudo de Prisma: su
  importación se restringe fuera de `src/infraestructura`.

- **FR-012**: Configurar ESLint con las tres reglas que hacen exigible la constitución,
  más el cierre del acoplamiento directo (I-04):

  | Regla | Principio | Mecanismo |
  |---|---|---|
  | Frontera de capas | III | `no-restricted-imports` con zonas, según la tabla de FR-006 |
  | Sin dependencias directas en dominio | III | Zona que prohíbe en `src/dominio/**` las importaciones de `@prisma/client`, `next-auth`, SDKs de almacenamiento/correo y entorno web (`next/*`); el dominio solo expone puertos en `src/dominio/contratos` (repositorios, reloj, etc.) |
  | Sin aritmética monetaria | II, medida 4 de § 14.1 | Regla propia `flay/sin-aritmetica-monetaria` en `reglas-eslint/`, con verificación de tipos (`parserOptions.project`): marca todo operador `+ - * / %`, `+=` y unario cuyo operando sea de tipo `Decimal` |
  | Sin cliente crudo | I | `no-restricted-imports` sobre el cliente de Prisma fuera de `src/infraestructura` |

- **FR-013**: Configurar Prettier y hacer que ESLint no discuta con él
  (`eslint-config-prettier`), con `.editorconfig` que fuerce `end_of_line = lf`, coherente con el
  `.gitattributes` ya presente en el repositorio.

- **FR-014**: Configurar Vitest con **dos proyectos separados**, y esa separación es la prueba viva
  del Principio III:

  | Proyecto | Alcance | Base de datos | Entorno |
  |---|---|---|---|
  | `dominio` | `pruebas/dominio/**` | **Ninguna.** Corre con `DATABASE_URL` sin definir | `node` |
  | `integracion` | `pruebas/integracion/**` | Base local o de servicio | `node` |

- **FR-015**: Configurar Playwright con dos proyectos de dispositivo —escritorio y teléfono
  (`390×844`)— para que RNF-01 (condición 4 de la definición de terminado) se verifique con una
  prueba y no con una opinión. Instalar `@axe-core/playwright` y exponer el guion `test:a11y`
  que exige 0 infracciones A/AA en pantallas del consorcista (I-09, RNF-11).

- **FR-016**: Definir los guiones de `package.json`. `verificar` es la puerta única; el flujo del
  repositorio no invoca otra cosa. Incluye `medir:p95` como arnés de RNF-06 (I-07) y `test:a11y` (I-09):

  | Guion | Comando |
  |---|---|
  | `dev` | `next dev` |
  | `build` | `next build` |
  | `lint` | `eslint .` |
  | `format:check` | `prettier --check .` |
  | `typecheck` | `tsc --noEmit` |
  | `test:dominio` | `vitest run --project dominio` |
  | `test:integracion` | `vitest run --project integracion` |
  | `test:e2e` | `playwright test` |
  | `test:a11y` | `playwright test --project=a11y` (axe-core, 0 infracciones A/AA, I-09) |
  | `medir:p95` | `node scripts/medir-p95.mjs` (arnés RNF-06: entorno, semilla de volumen y percentil fijados, I-07) |
  | `db:deploy` | `prisma migrate deploy` |
  | `db:drift` | `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $env:SHADOW_DATABASE_URL --exit-code` |
  | `verificar` | `format:check` → `lint` → `typecheck` → `test:dominio` → `db:deploy` → `db:drift` → `test:integracion` → `build` → `test:e2e`, en ese orden |

  El orden no es cosmético: lo que no necesita base de datos corre primero, para que el defecto más
  probable falle en el primer minuto.

- **FR-017**: Crear la ruta de salud `src/app/api/salud/route.ts`, que devuelve `200` con
  `{ estado, version, migracion }`. Es lo único que la aplicación hace al cerrar esta etapa, y es
  lo que las pruebas de extremo a extremo y la comprobación de despliegue verifican.

- **FR-018**: Crear el flujo de verificación `.github/workflows/verificacion.yml`, disparado en
  cada envío y en cada solicitud de incorporación, con un servicio `pgvector/pgvector:pg17` y
  variable `SHADOW_DATABASE_URL` apuntando a una base sombra del propio servicio (I-01), que
  ejecuta `npm ci` y `npm run verificar`. **DEBE** completar en menos de 10 minutos.

- **FR-019**: Crear el flujo de despliegue con cableado explícito (M-09): al integrar a la rama principal, y sólo con la
  verificación en verde, aplicar `npm run db:deploy` contra la base de demostración y publicar la
  aplicación. Secretos desde los secretos del repositorio/entorno de demo (nunca versionados);
  orden migrar-antes-de-servir con verificación de `/api/salud`; si la migración falla, el deploy
  queda bloqueado con alerta y sin rollback manual sobre la base. Ninguna acción manual. Producción se despliega desde una etiqueta, con aprobación
  manual (§ 8.3.5).

- **FR-020**: Configurar la protección de la rama principal: prohibido el envío directo,
  incorporación sólo por solicitud con **revisión aprobada del otro integrante** y verificación en
  verde (§ 8.3.5, condición 1 de § 8.3.4).

- **FR-021**: Agregar al flujo de verificación el análisis de secretos sobre el historial completo
  (`gitleaks detect --no-git=false`) y la revisión de dependencias
  (`npm audit --audit-level=high`). Un hallazgo deja la comprobación en rojo. Cierra los huecos
  H-04 y H-10 y las marcas «a definir» de § 18.7.

- **FR-022**: Crear las cuatro fixtures negativas de `pruebas/fixtures-negativas/` y la prueba que
  afirma que **cada una falla**: importación cruzada de capa, `number` como dinero, aritmética
  sobre `Decimal`, e importación directa de proveedor en dominio (`@prisma/client` en
  `src/dominio/`, I-04). Un verificador que no se prueba a sí mismo no es un verificador.

#### Bloque C — Cierre documental

- **FR-023**: Completar la columna «Versión» de las diez filas de la tabla de bibliotecas de
  `docs/entrega-final/14-codificacion.md` § 14.1 con los valores **leídos de `package-lock.json`**,
  no de memoria. Cierra el hueco H-02.
- **FR-024**: Escribir § 14.4 con los cinco estándares mínimos: nomenclatura en español,
  organización de carpetas por capa (tabla de FR-006), representación del dinero (`Prisma.Decimal`
  en el dominio, cadena en la serialización hacia la interfaz), formato de mensajes de error
  conforme a RNF-10, y formato del registro de eventos. Cierra el hueco H-03.
- **FR-025**: Escribir § 18.7 con la gestión de secretos por ambiente y la periodicidad de la
  revisión de dependencias, remitiendo a FR-021 como su comprobación. Cierra el hueco H-04.
- **FR-026**: Registrar en `CLAUDE.md` los comandos de compilación, análisis y pruebas, tal como
  ese archivo mismo lo exige mientras dice «no hay build, lint ni tests todavía».
- **FR-027**: Verificar y registrar el estado real de los tres hitos con fecha ya cumplida —
  prototipo de interfaz 2.5 (24/07/2026), prueba de concepto 5.1 (semana del 24/08/2026) y demo de
  iteración 1 (04/09/2026)— y consignarlo en `docs/entrega-final/13-prototipo.md` § 13.2. Cierra la
  parte verificable del hueco H-09.

### Key Entities

Esta etapa crea **una sola entidad**, y es transversal:

- **`BitacoraAuditoria`**: asiento inmutable de toda operación que modifica un dato económico
  (regla RN-15 § 7.2, `RF-26`, RNF-12). Atributos: identificador único, momento, usuario que
  originó la operación, tabla afectada, clave de la fila, tipo de operación, imagen anterior e
  imagen posterior. Se puebla exclusivamente por disparador de base de datos; el usuario de
  aplicación no tiene permisos de inserción, actualización ni borrado sobre ella.

Ninguna entidad de negocio (`Consorcio`, `Unidad`, `Gasto`, …) se crea en esta etapa. Todas
aparecen en la etapa 2.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En una máquina limpia, la secuencia de FR-003 a FR-017 se completa en **menos de 30
  minutos** sin que quien la ejecuta tome ninguna decisión ni consulte a nadie.
- **SC-002**: `npm run test:dominio` termina en verde con la variable `DATABASE_URL` **sin
  definir**. Es la verificación operativa del Principio III y la precondición del desarrollo
  guiado por pruebas de la etapa 3.
- **SC-003**: Las **cuatro** fixtures negativas fallan, cada una con su mensaje propio: importación
  cruzada de capa, `number` como dinero, aritmética sobre `Decimal` e importación directa de
  proveedor en dominio. Cero falsos verdes.
- **SC-004**: `npm run verificar` termina en verde localmente y en el repositorio remoto, y el
  flujo remoto completo dura **menos de 10 minutos** medidos sobre tres ejecuciones consecutivas.
- **SC-005**: `npm run db:deploy` sobre una base vacía aplica el esquema completo, y
  `npm run db:drift` devuelve código de salida 0: cero divergencia entre esquema e historial de
  migraciones. Cero cambios manuales sobre la base en cualquier entorno.
- **SC-006**: Conectado con el usuario de aplicación, `INSERT`, `UPDATE` y `DELETE` sobre
  `BitacoraAuditoria` devuelven `permission denied` **en los tres casos**, y una operación sobre la
  tabla de prueba con disparador deja exactamente un asiento con imagen anterior y posterior.
- **SC-007**: Un envío a la rama principal con verificación en verde deja el entorno de
  demostración actualizado en **menos de 10 minutos** y `GET /api/salud` devuelve `200` con la
  versión nueva, **sin ninguna acción manual**. Con verificación en rojo, cero despliegues.
- **SC-008**: `gitleaks detect --no-git=false` sobre el historial completo reporta **0 hallazgos**,
  y `npm audit --audit-level=high` reporta **0 vulnerabilidades altas o críticas**.
- **SC-009**: La tabla de bibliotecas de § 14.1 tiene **0 celdas** con el texto «A fijar», y cada
  versión coincide carácter por carácter con `package-lock.json`.
- **SC-010**: § 14.4 tiene los **5** estándares mínimos escritos y § 18.7 tiene **0** marcas «a
  definir» en gestión de secretos y revisión de dependencias.
- **SC-011**: La prueba de extremo a extremo de `/api/salud` pasa en los **2** proyectos de
  Playwright, y en el de teléfono (`390×844`) la página no produce desplazamiento horizontal
  (RNF-01).
- **SC-012**: Un intento de envío directo a la rama principal es rechazado por el servidor, y una
  solicitud de incorporación sin revisión aprobada del otro integrante no puede integrarse
  (§ 8.3.5).
- **SC-013**: El aislamiento FR-011 falla sin contexto de consorcio y las suites del mecanismo
  pasan sobre modelos de prueba (M-10). La etapa que entrega el mecanismo lo mide: no se difiere a 002.

### Cierre contra la definición de terminado (§ 8.3.4)

| # | Condición | Cómo la cierra esta etapa |
|---|---|---|
| 1 | Integrado y revisado por el otro integrante | FR-020 lo vuelve imposible de omitir: el servidor rechaza el envío directo |
| 2 | Pruebas y verificación automática en verde | SC-004; la etapa **es** la construcción de esa verificación |
| 3 | Autorización por rol y consorcio verificada | Esta etapa **no expone ningún dato de negocio**. Entrega el mecanismo de aislamiento en un solo punto (FR-011) y su prueba; la condición se verifica sobre datos reales desde la etapa 2 |
| 4 | Opera en teléfono (RNF-01) | SC-011: el proyecto de Playwright de teléfono existe y pasa desde el primer día |
| 5 | Mensajes de error comprensibles (RNF-10) | FR-024 fija el formato antes de que exista el primer mensaje |
| 6 | Desplegado en demostración y accesible | SC-007 |
| 7 | Registra en bitácora si toca datos económicos | SC-006: el mecanismo existe y es inviolable antes de que exista el primer dato económico |
| 8 | Documentación actualizada | FR-023 a FR-027 |

---

## Assumptions

- **Las cinco elecciones de plataforma de FR-001 son una propuesta de esta etapa y requieren
  ratificación explícita del equipo antes de contratar.** § 14.1 fija lenguaje, motor de base,
  mapeador y bibliotecas, y no fija proveedor de plataforma; el hueco H-01 quedó abierto y esta
  etapa lo cierra con la combinación de menor costo y mayor cercanía regional. Si el equipo elige
  otra, cambian FR-001, FR-019 y FR-021, y **nada más**: la aplicación es portable a cualquier
  alojamiento con Node.js (§ 14.1) y el único acoplamiento real es el almacenamiento de objetos,
  que se consume tras una interfaz del dominio.
- El equipo trabaja sobre Windows con PowerShell; los comandos están escritos para ese entorno. El
  flujo de verificación corre sobre Linux, y por eso `.gitattributes` fuerza `eol=lf` y
  `.editorconfig` lo repite (FR-013).
- Docker está disponible en las máquinas de desarrollo. Es el modo de tener `pgvector` local sin
  instalación manual de extensiones.
- La capa gratuita alcanza para el uso académico y demostrativo. § 14.1 ya deja asentado que un uso
  comercial exigiría plan pago, con costo previsto en el punto 6.
- Las 34 h del paquete 3.1 del punto 10 son el presupuesto de esta etapa. **No** se suman a las
  770 h comprometidas: se extraen de las 221 h de la iteración 1, que quedan en 187 h de trabajo
  sobre requerimientos (ver `plan-etapas.md` § 5).
- Esta etapa no implementa ningún `RF-nn` funcional. Su valor es que las cuatro condiciones más
  olvidadas de § 8.3.4 —verificación en verde, teléfono, despliegue y auditoría— pasan a estar
  garantizadas por construcción en cada requerimiento posterior.
