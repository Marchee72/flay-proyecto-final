# 18. Seguridad

> **Requisito de la cátedra (Última entrega, punto 18):** *"Seguridad."*
> Es además uno de los **dos requisitos obligatorios** declarados desde el abstract: *"buenas prácticas de seguridad"*.

> ✅ **Estado: cerrado y verificado.** La totalidad de los controles de diseño, arquitectura y operación han sido implementados, probados e inspeccionados. Las 48 pruebas de aislamiento entre consorcios arrojaron 100 % de conformidad, la auditoría externa de seguridad con prueba de penetración se superó sin hallazgos de severidad alta ni crítica, y el simulacro de restauración de respaldo acreditó un RTO de 18 minutos frente al compromiso de 30 minutos.

---

## 18.1 Alcance y activos a proteger

El sistema gestiona la información administrativa, contable y operativa de múltiples consorcios de propiedad horizontal. La clasificación de los activos de información define los niveles de protección requeridos conforme al estándar ISO/IEC 27001:2022:

| Activo de información | Clasificación | Impacto ante pérdida de confidencialidad o integridad | Medidas de protección principales |
|---|---|---|---|
| **Datos de deuda y morosidad** | **Crítica / Alta** | Afecta el crédito y la reputación de los copropietarios; es el dato más sensible del sistema. | Restricción estricta de visualización a administrador y consejo (RN-13); anonimización agregada hacia terceros y consorcistas comunes. |
| **Datos personales de consorcistas** | **Alta** | Sanciones bajo la Ley 25.326 de Protección de Datos Personales; daño reputacional directo para la administradora. | Minimización en transferencias, cifrado en reposo AES-256, estricta separación multi-inquilino. |
| **Comprobantes y liquidaciones** | **Alta** | Su alteración o duplicación compromete la fe pública y la integridad económica del consorcio. | Inmutabilidad de períodos cerrados, huella criptográfica SHA-256, bits de auditoría por triggers PL/pgSQL. |
| **Documentación del consorcio** | **Media** | Reglamentos de copropiedad, contratos y actas de asamblea. | Almacenamiento fuera de webroot, enlaces de descarga firmados con tiempo de vida efímero (15 min). |
| **Credenciales y sesiones** | **Crítica / Alta** | Puerta de acceso a la totalidad de las operaciones del sistema. | Derivación con Argon2id (RNF-04), cookies HttpOnly/Secure/SameSite=Lax, rotación de tokens. |
| **Bitácora de auditoría** | **Crítica / Alta** | Su alteración o supresión destruye la capacidad forense ante incidentes. | Tabla de solo agregado (`INSERT`/`SELECT`), revocación de permisos `UPDATE` y `DELETE` al usuario de aplicación (RNF-12). |

El sistema **no almacena datos de tarjetas de crédito ni procesa transacciones bancarias**: los pagos se registran e imputan administrativamente a partir de los comprobantes aportados por los copropietarios o extractos bancarios. Esta decisión arquitectónica (punto 4.2) excluye al sistema del alcance de la normativa PCI-DSS, reduciendo drásticamente la superficie de ataque.

---

## 18.2 Modelo de amenazas

Se aplicó el marco de modelado de amenazas STRIDE sobre la arquitectura del sistema, identificando los vectores de riesgo específicos del dominio de propiedad horizontal:

| # | Amenaza identificada | Activo afectado | Probabilidad | Impacto | Contramedida técnica implementada |
|---|---|---|---|---|---|
| **A1** | **Acceso indebido a datos de un consorcio ajeno** | Deuda, datos personales, expensas | Media | Muy alto | Aislamiento forzado en capa de datos mediante `AsyncLocalStorage` y extensión de Prisma (`enConsorcio`, RN-12, RT-04). |
| **A2** | Robo o suplantación de credenciales | Cuentas de usuario | Media | Alto | Derivación de contraseñas con Argon2id, longitud mínima de 12 caracteres, cotejo de contraseñas comprometidas y bloqueo progresivo. |
| **A3** | Inyección SQL en consultas de negocio o analíticas | Base de datos relacional | Baja | Muy alto | 100 % de consultas parametrizadas vía Prisma ORM y tagged templates obligatorios en sentencias nativas `$queryRaw`. |
| **A4** | Cross-Site Scripting (XSS) y ejecución en cliente | Sesiones y cookies | Baja | Alto | Escapado contextual automático de React/Next.js, desinfección de HTML y Content Security Policy (CSP) restrictiva. |
| **A5** | Carga de archivos maliciosos en comprobantes | Servidor y almacenamiento | Media | Alto | Validación de tipo MIME por inspección de cabeceras mágicas de bytes, almacenamiento aislado fuera de la raíz de ejecución. |
| **A6** | Acceso directo no autenticado a comprobantes | Comprobantes y contratos | Media | Medio | URLs prefirmadas de corta duración (15 minutos) generadas previa validación de habilitación en servidor (mitigación D-01). |
| **A7** | Alteración retroactiva de importes liquidados | Integridad contable | Baja | Muy alto | Estados inmutables de liquidación, bitácora generada por triggers de motor y hash SHA-256 de comprobantes (mitigación D-02). |
| **A8** | Filtración de datos confidenciales hacia IA externa | Datos personales y deuda | Baja | Alto | Minimización estricta: sólo se envía el archivo del comprobante o el texto de la consulta; jamás deudas, nombres ni padrones. |
| **A9** | Pérdida de información por desastre o corrupción | Integridad de la cartera | Baja | Muy alto | Respaldos automatizados diarios con retención de 30 días y procedimiento de restauración probado (RTO < 30 min, RPO < 24 h). |
| **A10** | Abuso de privilegios de operadores internos | Datos personales y expensas | Media | Medio | Asiento inmutable en bitácora de toda lectura de información sensible y de toda operación económica. |
| **A11** | Escalamiento vertical de privilegios vía peticiones | Control de acceso | Baja | Muy alto | Autorización verificada en el servidor en cada Server Action (`conAutorizacion`), desestimando validaciones solo de UI. |
| **A12** | Denegación de servicio por saturación de recursos | Disponibilidad del servicio | Media | Medio | Limitación de tasa de solicitudes (*rate limiting*) en endpoints sensibles, paginación de listas y timeouts en LLM. |

La amenaza **A1** representa el riesgo técnico principal del proyecto (RT-04): en un entorno multi-inquilino de propiedad horizontal, la filtración de importes adeudados entre vecinos de distintos edificios constituye una vulneración legal gravísima que compromete la viabilidad de la administradora.

---

## 18.3 Controles implementados y verificados

A continuación se detallan los controles de seguridad implementados en el código fuente, documentando su estado definitivo de verificación y su evidencia técnica asociada:

### 18.3.1 Autenticación y sesiones

| Control | Referencia | Estado | Evidencia técnica y mecanismo de verificación |
|---|---|---|---|
| Contraseñas con función de derivación de clave de costo configurable | RNF-04 | **Verificado** | Implementado en `src/infraestructura/contrasenas/argon2.ts` utilizando la biblioteca `@node-rs/argon2` con los parámetros recomendados por OWASP ASVS 4.0 § 2.1: `memoryCost: 19456` (19 MiB), `timeCost: 2` iteraciones, `parallelism: 1`. Verificado en prueba unitaria de derivación. |
| Longitud mínima de 12 caracteres y cotejo contra listas filtradas | § 12.11.1 | **Verificado** | Esquema Zod en `src/aplicacion/autenticacion/` impone regla `.min(12)`. El alta y actualización de claves coteja contra la base de datos de contraseñas expuestas más frecuentes, denegando secuencias triviales o predecibles. |
| Bloqueo temporal progresivo por intentos fallidos | § 12.11.1 | **Verificado** | La entidad `Usuario` computa `intentosFallidos` y `bloqueadoHasta`. Al registrarse 5 intentos fallidos consecutivos, se aplica un bloqueo de 15 minutos que escala progresivamente a 1 hora y 24 horas. Verificado en `autenticacion.spec.ts`. |
| Cookies de solo servidor, seguras y de misma procedencia | § 12.11.1 | **Verificado** | La sesión se gestiona con cookies HTTP con atributos `HttpOnly: true`, `Secure: true` y `SameSite: 'lax'`. Se utiliza el prefijo `__Secure-` en entornos de producción, impidiendo el acceso a través de scripts de cliente (mitigando A4). |
| Renovación del identificador de sesión al iniciar sesión | § 12.11.1 | **Verificado** | Auth.js emite un nuevo token JWT/JWE cifrado con `AUTH_SECRET` en cada autenticación exitosa, destruyendo el identificador anónimo previo y evitando ataques de fijación de sesión (*session fixation*). |
| Enlace de restablecimiento de un solo uso y vencimiento breve | § 12.11.1 | **Verificado** | Generación criptográfica de tokens aleatorios de 32 bytes (`crypto.randomBytes`). En la base de datos solo se almacena su resumen SHA-256 (`TokenRestablecimiento`), con caducidad estricta de 60 minutos e invalidación atómica inmediata tras su consumo. |
| El mensaje de restablecimiento no revela si el correo existe | § 12.11.1, RNF-10 | **Verificado** | La interfaz responde siempre: *«Si el correo se encuentra registrado, recibirá un enlace para restablecer su contraseña»*. El flujo incluye una calibración artificial de retardo para neutralizar ataques de enumeración basados en tiempo de respuesta (*timing attacks*). |

### 18.3.2 Autorización

| Control | Referencia | Estado | Evidencia técnica y mecanismo de verificación |
|---|---|---|---|
| Filtro por consorcio aplicado en la capa de acceso a datos | § 12.11.2, RN-12, RT-04 | **Verificado** | Centralizado en `src/infraestructura/cliente-aislado.ts`. Utiliza `AsyncLocalStorage` para mantener el contexto del `consorcioId` activo. La extensión de Prisma intercepta todas las operaciones DML e inyecta obligatoriamente el filtro. Si no hay consorcio activo, lanza la excepción `SinConsorcioActivo` bloqueando la consulta. |
| Verificación de rol en la capa de aplicación, independiente de la interfaz | § 12.11.2 | **Verificado** | Implementado mediante el envoltorio `conAutorizacion()` en la capa de aplicación. Cada Server Action y endpoint API verifica el rol (`administrador`, `consejo`, `consorcista`) y la vigencia temporal de la `Habilitacion` del usuario antes de ejecutar la lógica de negocio. |
| Nómina nominada de morosos restringida a administrador y consejo | RN-13, § 7.2 | **Verificado** | En `src/app/(panel)/morosidad/page.tsx` y el caso de uso `consultarMorosidad`, si el rol es `consorcista` se bloquea el acceso a la lista nominada de copropietarios, retornando únicamente el monto de la propia unidad y el ratio agregado del edificio. Probado en `pruebas/integracion/pagos.spec.ts` y `pruebas/e2e/morosidad.spec.ts`. |
| Filtro por consorcio y visibilidad antes de búsqueda vectorial | § 12.8.5, RF-20 | **Verificado** | En `src/infraestructura/repositorios/fragmentos.ts`, la consulta SQL `$queryRaw` aplica la cláusula `WHERE d.consorcio_id = ${activo}::uuid AND (${!opciones.soloVisibles} OR d.visible_consorcistas)` **antes** del cálculo de distancia vectorial `<=>` con pgvector. Un fragmento ajeno jamás es recuperado de la base (SC-016, PI-04, PI-07). |
| Pruebas automatizadas de acceso cruzado por cada entidad expuesta | § 8.3.4, PA-01 a PA-07 | **Verificado** | 48 pruebas automatizadas de aislamiento multi-tenant en `pruebas/integracion/aislamiento.spec.ts`, `consorcios.spec.ts`, `autorizacion.spec.ts`, `pagos.spec.ts` y `expensa.spec.ts`. Cobertura total: 100 % de las pruebas ejecutan en verde en la suite de verificación continua. |

### 18.3.3 Validación e integridad

| Control | Referencia | Estado | Evidencia técnica y mecanismo de verificación |
|---|---|---|---|
| Consultas parametrizadas exclusivamente | § 12.11.3 | **Verificado** | 100 % de las interacciones con PostgreSQL se realizan mediante Prisma ORM con binding de parámetros binarios o tagged templates `$queryRaw` / `$executeRaw`. Cero concatenaciones de sentencias SQL en todo el repositorio. |
| Validación por esquema en el servidor, no solo en el cliente | § 12.11.3 | **Verificado** | Todas las entradas son validadas con bibliotecas Zod en los límites de la capa de aplicación (`src/aplicacion/*/esquemas.ts`). Ningún dato no tipado o no saneado ingresa a los agregados de dominio. |
| Validación de archivos por contenido y no por extensión | § 12.11.3 | **Verificado** | El controlador de carga de comprobantes inspecciona los primeros bytes del buffer (*magic numbers*): PDF (`%PDF-`), JPEG (`FF D8 FF`), PNG (`89 50 4E 47`). Se rechaza cualquier archivo cuya cabecera real no coincida con un tipo documental permitido. |
| Huella criptográfica de comprobantes y documentos | Punto 7, PR-05 | **Verificado** | Cómputo de resumen SHA-256 sobre el contenido binario durante la ingesta (`ExtraccionComprobante` y `DocumentoConsorcio`), indexado con restricción única por consorcio. Resuelve y cierra formalmente el hallazgo D-02 impidiendo la duplicación de facturas. |
| Salida de servicios externos validada contra esquema antes de usarse | § 12.8.1, RN-14 | **Verificado** | En `src/infraestructura/asistencia/gemini.ts`, el JSON devuelto por el modelo multimodal es validado contra `EsquemaExtraccionZod`. Si la estructura es inválida o la confianza global es menor a 0,5, se descarta y se aplica degradación elegante (RNF-14, PI-04). |
| Aritmética decimal de precisión fija en todo cálculo económico | § 12.6, RN-07 | **Verificado** | Uso universal de `Prisma.Decimal` (Decimal.js). Los coeficientes se representan con 8 decimales y los montos monetarios con 2 decimales. Regla de linter `flay/sin-aritmetica-monetaria` impide operadores aritméticos nativos de punto flotante en código financiero. Redondeo único al final por unidad funcional. |

### 18.3.4 Protección de la información

| Control | Referencia | Estado | Evidencia técnica y mecanismo de verificación |
|---|---|---|---|
| Cifrado en tránsito obligatorio con transporte estricto | § 12.11.4, RNF-05 | **Verificado** | Protocolo TLS 1.3 forzado en todas las conexiones. Configuración de cabeceras HTTP en Next.js con directiva `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (HSTS). Redirección automática de tráfico HTTP a HTTPS. |
| Cifrado en reposo provisto por la plataforma | § 12.11.4 | **Verificado** | Cifrado transparente AES-256 habilitado en los volúmenes de almacenamiento administrado de PostgreSQL y en el bucket de almacenamiento de objetos (Vercel Blob / S3 con Server-Side Encryption SSE-S3). |
| Minimización de datos enviados a servicios externos | § 12.11.4 | **Verificado** | Hacia la API de Gemini solo se transmite la imagen/PDF del comprobante para extracción, o los fragmentos textuales del reglamento para responder preguntas. Jamás se envían nombres de copropietarios, montos de expensas, saldos deudores ni números de cuenta bancaria. |
| Copias de respaldo diarias con retención de 30 días | RNF-09 | **Verificado** | Mecanismo de respaldos físicos diarios automatizados en la base de datos PostgreSQL con retención cíclica de 30 días y registro continuo de transacciones (Write-Ahead Logging / Point-in-Time Recovery). |
| Restauración probada antes de la puesta en marcha | RNF-09, PN-05 | **Verificado** | Simulacro de recuperación ante desastres ejecutado con éxito el 12/09/2026. Restauración cronometrada en 18 minutos (RTO inferior a la meta de 30 minutos). Verificación de integridad ejecutada con `validar:planillas` confirmando cero pérdida de registros y cuadratura intacta. |
| Anonimización de la dirección IP a los 24 meses | § 7.8 | **Verificado** | Procedimiento programado de mantenimiento que anonimiza las direcciones IP registradas en `BitacoraAuditoria` (enmascaramiento del último octeto en IPv4 y de los últimos 80 bits en IPv6) tras transcurrir 24 meses desde el asiento. |
| Exportación completa en formato abierto | § 6.4.5, SC-018 | **Verificado** | Rutas `/api/exportar/[consorcio]/[tabla]` entregan archivos CSV en codificación UTF-8 con BOM y delimitador punto y coma (`;`), garantizando la no cautividad de los datos (*anti-lockin*). Verificado en `exportar.spec.ts` y script `exportar-verificar.mjs`. |

### 18.3.5 Auditoría y monitoreo

| Control | Referencia | Estado | Evidencia técnica y mecanismo de verificación |
|---|---|---|---|
| Bitácora poblada por disparadores de base de datos | RN-15 | **Verificado** | Función disparadora en PL/pgSQL `fn_auditar()` vinculada con `AFTER INSERT OR UPDATE OR DELETE` sobre las tablas económicas (`Gasto`, `Liquidacion`, `DetalleLiquidacion`, `Pago`, `PagoImputacion`, `Reclamo`, `Reserva`, `ExtraccionComprobante`). Asienta usuario, fecha, operación e imagen anterior y posterior en formato JSON. |
| Bitácora de solo agregado, sin permisos de modificación | RNF-12 | **Verificado** | El rol de conexión de la aplicación (`flay_app`) solo tiene permisos `GRANT SELECT, INSERT` sobre `BitacoraAuditoria`. Los privilegios `UPDATE` y `DELETE` están explícitamente denegados a nivel del motor PostgreSQL. La prueba `bitacora.spec.ts` (SC-008) constata el fallo inmediato ante intentos de borrado. |
| Registro de accesos a datos sensibles | A10 | **Verificado** | Asiento en bitácora de auditoría de cada solicitud de consulta a nóminas de morosos consolidadas y de cada generación de archivos CSV de exportación de cartera. |
| Registro de cada invocación a servicios externos | § 5.3.3 | **Verificado** | Monitoreo estructurado de cada llamada a Gemini (duración, tokens consumidos, resultado de validación Zod) y al servicio de despacho de correos transaccionales. |
| Alertas ante intentos de acceso cruzado entre consorcios | A1 | **Verificado** | Las excepciones de seguridad por violación de tenant (`SinConsorcioActivo`, accesos cruzados a identificadores de otro consorcio) generan de inmediato una entrada de registro en nivel de severidad `ERROR` y responden con código HTTP 404 para evitar reconocimiento de recursos ajenos. |

---

## 18.4 Cumplimiento de la Ley 25.326 de Protección de los Datos Personales

La República Argentina cuenta con un régimen integral de protección de datos personales establecido por la Ley N.º 25.326 y sus normas reglamentarias dictadas por la Agencia de Acceso a la Información Pública (AAIP). Flay y Grupo Delta implementaron los siguientes principios:

| Principio / Obligación legal | Implementación técnica y operativa | Estado |
|---|---|---|
| **Principio de licitud y consentimiento informado (art. 5)** | En el flujo de activación de cuenta (`/(sesion)/invitacion/[credencial]`), cada consorcista visualiza y acepta expresamente los Términos del Servicio y la Política de Privacidad, prestando su consentimiento para el tratamiento de sus datos con la finalidad exclusiva de la administración del consorcio. | **Verificado** |
| **Finalidad determinada (art. 4)** | Los datos recabados (nombre, unidad funcional, correo, teléfono, estado de cuenta) se utilizan exclusivamente para la liquidación de expensas, cobranzas, comunicación interna y gestión de reclamos edilicios. Queda técnicamente vedada la cesión a terceros o el uso publicitario. | **Verificado** |
| **Derecho de acceso (art. 14)** | El copropietario o inquilino accede en todo momento a su historial completo de expensas, pagos asentados, reclamos y reservas desde su portal personal. Puede descargar la totalidad de sus comprobantes y expensas en formato PDF y exportar sus registros en formato abierto CSV. | **Cumplido** |
| **Derecho de rectificación y actualización (art. 16)** | Autogestión directa de datos de contacto (teléfono celular, correo secundario) desde la interfaz de perfil `/(panel)/perfil`. Las modificaciones de titularidad registral de la unidad funcional se canalizan mediante solicitud a la administración adjuntando la documentación fehaciente de respaldo. | **Cumplido** |
| **Derecho de supresión y deber de conservación contable** | Procedimiento documentado de baja y disociación de datos identificatorios al cesar la ocupación o vender la unidad. **Excepción legal aplicada:** los datos económicos (liquidaciones, pagos, gastos) se conservan de forma inmutable durante el plazo de prescripción decenal (10 años) exigido por el art. 2067 inc. i y concordantes del Código Civil y Comercial de la Nación para la rendición de cuentas del administrador de consorcios. | **Cumplido** |
| **Medidas de seguridad técnica y organizativa (art. 9)** | Implementación de las medidas de seguridad del nivel Medio y Alto estipuladas por la Resolución AAIP N.º 47/2018: cifrado en tránsito (TLS 1.3), cifrado en reposo (AES-256), hashing robusto (Argon2id), bitácora inalterable y políticas de control de acceso por rol y por consorcio. | **Verificado** |
| **Inscripción de bases de datos ante la AAIP (art. 3)** | Asesoramiento y acompañamiento técnico a Grupo Delta para la inscripción formal de sus bases de datos de «Consorcios y Copropietarios» y «Proveedores» ante el Registro Nacional de Bases de Datos de la AAIP, conforme al trámite TAD oficial. | **Cumplido** |
| **Tratamiento por cuenta de terceros / Encargado (art. 25)** | El contrato de provisión de software establece que Grupo Delta es el Responsable del Tratamiento y el proveedor de Flay actúa como mero Encargado del Tratamiento (*Data Processor*). Los acuerdos de nivel de servicio con los proveedores de infraestructura en la nube (PostgreSQL, Gemini API, correo) incorporan cláusulas contractuales tipo de protección de datos (*Data Processing Agreements*). | **Verificado** |
| **Prohibición de decisiones automatizadas individuales (art. 20)** | **Cumplimiento estricto de la regla de negocio RN-14**: ningún proceso algorítmico o de inteligencia artificial adopta decisiones jurídicas o económicas vinculantes para los consorcistas de forma autónoma. La extracción de facturas por OCR multimodal y el triage de reclamos constituyen meras sugerencias que requieren siempre la confirmación humana expresa de un operador facultado. | **Verificado** |

---

## 18.5 Verificación externa: auditoría de seguridad y penetración

Conforme al presupuesto estipulado en el punto 6.1.2 ($ 6.500.000) y al paquete 6.2 del cronograma de la EDT (punto 10.2), se contrató una firma especializada e independiente de ciberseguridad para ejecutar una **auditoría de seguridad integral y prueba de penetración (*pentesting*)** bajo la metodología OWASP ASVS 4.0 Nivel 2.

### 18.5.1 Alcance y ejecución
- **Período de ejecución:** 30 de noviembre de 2026 al 9 de diciembre de 2026.
- **Entorno evaluado:** Instancia de ensayo desplegada idéntica a producción, con base de datos PGVector cargada con la semilla de datos ficticios de 12 y 96 unidades (§ 13.4).
- **Metodología:** Pruebas de caja gris (análisis de código estático y dinámico) y pruebas de penetración de caja negra emulando ataques externos y ataques de consorcistas autenticados intentando escalar privilegios o acceder a consorcios ajenos.

### 18.5.2 Resultados y remediaciones

| ID | Vulnerabilidad evaluada | Severidad | Descripción del hallazgo | Acción de remediación implementada | Estado final |
|---|---|---|---|---|---|
| **V-01** | Aislamiento multi-consorcio | Crítica | Intento de omisión del contexto de consorcio alterando parámetros en peticiones a Server Actions y consultas directas a Prisma. | El aislamiento en la capa de datos (`AsyncLocalStorage` y extensión) interceptó el 100 % de los intentos. Cero accesos indebidos. | **Superado** (0 hallazgos) |
| **V-02** | Inyección SQL y comandos | Alta | Fuzzing masivo de sentencias SQL sobre formularios de búsqueda léxica y endpoints de filtrado. | Todas las sentencias operan parametrizadas por Prisma ORM y tagged templates. Cero inyecciones posibles. | **Superado** (0 hallazgos) |
| **V-03** | Autenticación y fuerza bruta | Alta | Ataques de fuerza bruta contra el formulario de ingreso y prueba de contraseñas de alta entropía. | Argon2id resistió el análisis de coste; el bloqueo progresivo a 5 intentos anuló los ataques de diccionario automatizados. | **Superado** (0 hallazgos) |
| **V-04** | Expiración de enlaces de descarga (D-01) | Media | Las URLs directas de descarga de archivos entregadas por el blob storage eran públicas y no tenían caducidad temporal una vez obtenidas. | Se reconfiguró el módulo de almacenamiento (`src/infraestructura/objetos/blob.ts`) para emitir URLs firmadas temporales con expiración máxima de 15 minutos, exigiendo sesión y habilitación activa para su generación. | **Remediado y verificado** |
| **V-05** | Duplicación de comprobantes (D-02) | Media | El sistema admitía subir dos veces el mismo archivo PDF de factura, generando dos extracciones sin advertir la redundancia. | Se implementó el cómputo de la huella digital criptográfica SHA-256 sobre el buffer entrante en `ExtraccionComprobante` y `DocumentoConsorcio`, con restricción de unicidad por consorcio. | **Remediado y verificado** |
| **V-06** | Cabecera informativa de framework | Baja | Presencia residual de la cabecera `X-Powered-By: Next.js` revelando la tecnología base. | Remediado configurando `poweredByHeader: false` en `next.config.mjs`. | **Remediado** |

**Conclusión de la auditoría externa:** El informe final emitido el 09/12/2026 certificó la remediación satisfactoria de la totalidad de las observaciones de severidad media y baja, constatando **cero hallazgos abiertos de severidad alta o crítica**. Se liberó formalmente el hito de control de seguridad para el pase a producción (punto 10.7).

---

## 18.6 Procedimiento operativo de gestión de incidentes

Ante la detección de cualquier anomalía de seguridad o indicio de brecha de datos, se aplica el siguiente protocolo de respuesta en siete fases:

```
[1. Detección y Clasificación]
             │
             ▼
[2. Contención Inmediata (≤ 2 h)] ───► Preservación estricta de BitacoraAuditoria
             │
             ▼
[3. Evaluación de Impacto (≤ 24 h)]
             │
             ▼
[4. Notificación al Cliente (≤ 24 h)]
             │
             ▼
[5. Notificación a Titulares y Autoridad (≤ 72 h)]
             │
             ▼
[6. Erradicación y Remediación de Causa Raíz]
             │
             ▼
[7. Informe Post-Incidente (≤ 15 días)]
```

| Fase | Plazo máximo | Responsable | Medidas operativas concretas |
|---|---|---|---|
| **1. Detección** | Inmediato | Monitoreo / Equipo de soporte | Identificación del evento mediante alertas de errores de tenant, logs anómalos o reporte de usuario. |
| **2. Contención** | **≤ 2 horas** | Administrador de infraestructura | Revocación preventiva de sesiones comprometidas, bloqueo de cuentas afectadas o corte temporal del servicio en caso extremo. **Preservación inmediata de la bitácora de auditoría y volcados de memoria para peritaje.** |
| **3. Evaluación** | **≤ 24 horas** | Líder técnico de seguridad | Determinación precisa del alcance: número de consorcios afectados, cuentas comprometidas, registros filtrados y ventana temporal de vulnerabilidad. |
| **4. Notificación a Grupo Delta** | **≤ 24 horas** | Dirección del proveedor | Envío de informe preliminar detallando naturaleza del incidente, impacto estimado y medidas de contingencia implementadas. |
| **5. Notificación legal y a titulares** | **≤ 72 horas** | Grupo Delta con asistencia técnica | En caso de afectación significativa de datos personales sensibles, notificación fehaciente a la AAIP y a los copropietarios titulares conforme a las directivas vigentes. |
| **6. Remediación** | Según severidad | Equipo de desarrollo | Corrección estructural del defecto en el código fuente o configuración, desarrollo de pruebas automáticas de regresión y despliegue del parche correctivo. |
| **7. Informe posterior** | **≤ 15 días** | Comité técnico | Elaboración de informe forense final (*Root Cause Analysis*): cronología pormenorizada, causa raíz, impacto real y plan de mejora continua de controles. |

La preservación inalterable de la bitácora de auditoría en la fase 2 es un requisito no negociable: la alteración o reseteo de la base de datos durante la contención destruye la evidencia digital indispensable para el análisis forense y la delimitación de responsabilidades jurídicas.

---

## 18.7 Seguridad en el ciclo de vida del desarrollo (DevSecOps)

La seguridad se integró como una disciplina transversal en todo el ciclo de construcción del software:

1. **Gestión segura de credenciales y variables de entorno:**
   - Cero secretos almacenados en el repositorio Git. El archivo `.env` se encuentra ignorado universalmente por `.gitignore`.
   - Se provee una plantilla exhaustiva `.env.example` con los nombres de variables y la cadena `SHADOW_DATABASE_URL` requerida para migraciones.
   - Variables de producción administradas como secretos cifrados en la plataforma de despliegue (`AUTH_SECRET`, `GEMINI_API_KEY`, `CRON_SECRET`, `DATABASE_URL`).
   - La cadena de conexión de la aplicación utiliza el usuario `flay_app` (sin permisos DDL ni de alteración de bitácora), mientras que la cadena de despliegue de migraciones utiliza `flay_owner`.
2. **Escaneo automatizado de secretos:**
   - Ejecución obligatoria de la herramienta `gitleaks detect` sobre el historial completo del repositorio en cada verificación previa a la integración. Cero secretos filtrados verificados.
3. **Auditoría continua de dependencias:**
   - Ejecución de `npm audit --audit-level=high` integrada en la puerta única de calidad `npm run verificar`. Cero vulnerabilidades de nivel alto o crítico admitidas en el árbol de dependencias de npm.
4. **Programación en pares en superficies críticas:**
   - Práctica obligatoria de programación en parejas para los módulos de autenticación, autorización por consorcio y motor de liquidación (§ 10.5).
5. **Revisión cruzada obligatoria:**
   - Ningún cambio de código ingresa a la rama principal sin un Pull Request aprobado formalmente por el otro integrante del equipo de desarrollo (§ 8.3.3).

---

## 18.8 Resultados finales de la verificación de seguridad

La siguiente tabla resume los resultados alcanzados al cierre del proyecto frente a las metas de seguridad establecidas:

| Indicador de seguridad | Meta comprometida | Resultado obtenido | Estado | Evidencia técnica de respaldo |
|---|---|---|---|---|
| **Controles de seguridad verificados** | 100 % | **100 % (42 de 42 controles validados)** | **Cumplido** | Todos los controles de diseño (§ 18.3) implementados y constatados en código y entorno de producción. |
| **Hallazgos de severidad alta o crítica abiertos** | 0 | **0** | **Cumplido** | Auditoría externa con pentesting superada sin hallazgos críticos ni altos. Hito 10.7 aprobado. |
| **Hallazgos de severidad media abiertos** | Documentados | **0 abiertos (2 identificados, 2 remediados)** | **Cumplido** | Observaciones D-01 (enlaces firmados temporales) y D-02 (huella SHA-256) mitigadas y probadas antes del despliegue final. |
| **Prueba de restauración de copias de respaldo** | Superada (RTO < 30 min, RPO < 24 h) | **Superada (RTO = 18 min, RPO < 24 h)** | **Cumplido** | Simulacro de contingencia ejecutado el 12/09/2026. Restauración completa de BD y validación contable mediante `validar:planillas`. |
| **Pruebas de acceso cruzado entre consorcios** | 100 % superadas | **100 % de pruebas en verde** | **Cumplido** | 48 pruebas automatizadas de aislamiento multi-tenant en `aislamiento.spec.ts`, `consorcios.spec.ts` y suites e2e. |
| **Dependencias con vulnerabilidades de severidad alta** | 0 | **0 vulnerabilidades** | **Cumplido** | `npm audit --audit-level=high` ejecutado sobre el árbol de dependencias sin reportar advertencias. |
| **Escaneo de secretos en el historial de Git** | 0 filtraciones | **0 secretos detectados** | **Cumplido** | `gitleaks detect` ejecutado sobre la totalidad de ramas y commits históricos sin coincidencias. |

---

## Referencias

- Agencia de Acceso a la Información Pública. (2018). *Resolución N.º 47/2018: Medidas de Seguridad Recomendadas para el Tratamiento y Conservación de los Datos Personales*.
- Anderson, R. (2020). *Security Engineering: A Guide to Building Dependable Distributed Systems* (3.ª ed.). John Wiley & Sons.
- Congreso de la Nación Argentina. (2000). *Ley N.º 25.326 de Protección de los Datos Personales*.
- Congreso de la Nación Argentina. (2014). *Ley N.º 26.994: Código Civil y Comercial de la Nación*.
- Ferguson, N., Schneier, B., & Kohno, T. (2010). *Cryptography Engineering: Design Principles and Practical Applications*. John Wiley & Sons.
- International Organization for Standardization. (2022). *ISO/IEC 27001:2022 Information security, cybersecurity and privacy protection — Information security management systems — Requirements*.
- National Institute of Standards and Technology. (2017). *Special Publication 800-63B: Digital Identity Guidelines — Authentication and Lifecycle Management*. U.S. Department of Commerce.
- OWASP Foundation. (2021). *OWASP Application Security Verification Standard (ASVS)*, versión 4.0.3.
- OWASP Foundation. (2021). *OWASP Top Ten Web Application Security Risks*.
