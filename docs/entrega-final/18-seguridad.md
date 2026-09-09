# 18. Seguridad

> **Requisito de la cátedra (Última entrega, punto 18):** *"Seguridad."*
> Es además uno de los **dos requisitos obligatorios** declarados desde el abstract: *"buenas
> prácticas de seguridad"*.

> ⚠️ **Estado: política esbozada.** Las medidas de diseño ya están definidas en el punto 12.11 y son
> exigibles desde la iteración 1. Aquí se desarrolla la política operativa; los resultados de la
> verificación se completan al cierre.

---

## 18.1 Alcance y activos a proteger

| Activo | Sensibilidad | Impacto si se compromete |
|---|---|---|
| Datos de deuda por unidad | **Alta** | Afecta la reputación crediticia de una persona; es el dato más sensible del sistema |
| Datos personales de propietarios e inquilinos | Alta | Obligaciones bajo la Ley 25.326; daño reputacional para la administradora |
| Comprobantes de gasto y liquidaciones | Alta | Su alteración compromete la integridad económica del consorcio |
| Documentación del consorcio | Media | Reglamentos, actas y contratos |
| Credenciales de acceso | **Alta** | Puerta de entrada a todo lo anterior |
| Bitácora de auditoría | Alta | Su alteración destruye la capacidad de investigar un incidente |

El sistema **no** almacena datos de tarjetas ni credenciales bancarias: el pago se registra, no se
procesa. Es una decisión de alcance del punto 4.2 que reduce sustancialmente la superficie de riesgo.

## 18.2 Modelo de amenazas

| # | Amenaza | Activo afectado | Probabilidad | Impacto | Contramedida principal |
|---|---|---|---|---|---|
| A1 | **Acceso a datos de un consorcio ajeno** | Deuda, datos personales | Media | Muy alto | Aislamiento en la capa de acceso a datos, punto 12.11.2 |
| A2 | Robo de credenciales por contraseña débil o reutilizada | Todos | Media | Alto | Política de contraseñas, limitación de intentos, cotejo contra listas filtradas |
| A3 | Inyección en consultas | Todos | Baja | Muy alto | Consultas parametrizadas exclusivamente |
| A4 | Ejecución de código en el navegador de otro usuario | Sesiones | Baja | Alto | Escapado por defecto y política de seguridad de contenido |
| A5 | Carga de un archivo malicioso disfrazado de comprobante | Servidor, otros usuarios | Media | Alto | Validación por contenido, almacenamiento fuera del alcance de ejecución |
| A6 | Acceso directo a un comprobante por su dirección | Comprobantes | Media | Medio | Enlaces firmados de vencimiento corto |
| A7 | Alteración de un importe ya liquidado | Integridad económica | Baja | Muy alto | Estados de período, bitácora por disparadores, huella del comprobante |
| A8 | Fuga de datos a través de un servicio externo | Datos personales | Baja | Alto | Minimización: no se envían datos personales ni de deuda, punto 12.11.4 |
| A9 | Pérdida de datos por error o incidente | Todos | Baja | Muy alto | Copias diarias con restauración probada |
| A10 | Abuso interno: un operador consulta datos sin necesidad | Datos personales | Media | Medio | Bitácora de accesos a datos sensibles |
| A11 | Escalamiento de privilegios modificando la petición | Todos | Baja | Muy alto | Autorización verificada en el servidor, nunca en la interfaz |
| A12 | Denegación de servicio por peticiones masivas | Disponibilidad | Baja | Medio | Limitación de tasa de la plataforma |

A1 es la amenaza principal de este sistema. Todo lo demás es común a cualquier aplicación web; el
aislamiento entre consorcios es lo específico de este dominio y lo que más daño causa si falla.

## 18.3 Controles implementados

Los controles de diseño están detallados en el punto 12.11. Aquí se listan con su estado de
verificación.

### Autenticación y sesiones

| Control | Referencia | Estado |
|---|---|---|
| Contraseñas con función de derivación de clave de costo configurable | RNF-04 | A verificar |
| Longitud mínima de 12 caracteres y cotejo contra listas filtradas | 12.11.1 | A verificar |
| Bloqueo temporal progresivo por intentos fallidos | 12.11.1 | A verificar |
| Cookies de solo servidor, seguras y de misma procedencia | 12.11.1 | A verificar |
| Renovación del identificador de sesión al iniciar sesión | 12.11.1 | A verificar |
| Enlace de restablecimiento de un solo uso y vencimiento breve | 12.11.1 | A verificar |
| El mensaje de restablecimiento no revela si el correo existe | 12.11.1 | A verificar |

### Autorización

| Control | Referencia | Estado |
|---|---|---|
| Filtro por consorcio aplicado en la capa de acceso a datos | 12.11.2 | A verificar |
| Verificación de rol en la capa de aplicación, independiente de la interfaz | 12.11.2 | A verificar |
| Nómina nominada de morosos restringida a administrador y consejo | RN-13 | A verificar |
| Filtro por consorcio y visibilidad antes de generar respuestas documentales | 12.8.5 | A verificar |
| Pruebas automatizadas de acceso cruzado por cada entidad expuesta | 8.3.4 | A verificar |

### Validación e integridad

| Control | Referencia | Estado |
|---|---|---|
| Consultas parametrizadas exclusivamente | 12.11.3 | A verificar |
| Validación por esquema en el servidor, no solo en el cliente | 12.11.3 | A verificar |
| Validación de archivos por contenido y no por extensión | 12.11.3 | A verificar |
| Huella criptográfica de comprobantes y documentos | Punto 7 | A verificar |
| Salida de servicios externos validada contra esquema antes de usarse | 12.8.1 | A verificar |
| Aritmética decimal de precisión fija en todo cálculo económico | 12.6 | A verificar |

### Protección de la información

| Control | Referencia | Estado |
|---|---|---|
| Cifrado en tránsito obligatorio con transporte estricto | 12.11.4 | A verificar |
| Cifrado en reposo provisto por la plataforma | 12.11.4 | A verificar |
| Minimización de datos enviados a servicios externos | 12.11.4 | A verificar |
| Copias de respaldo diarias con retención de 30 días | RNF-09 | A verificar |
| **Restauración probada antes de la puesta en marcha** | RNF-09 | A verificar |
| Anonimización de la dirección IP a los 24 meses | Punto 7.8 | A verificar |
| Exportación completa en formato abierto | 6.4.5 | A verificar |

### Auditoría y monitoreo

| Control | Referencia | Estado |
|---|---|---|
| Bitácora poblada por disparadores de base de datos | RN-15 | A verificar |
| Bitácora de solo agregado, sin permisos de modificación | RNF-12 | A verificar |
| Registro de accesos a datos sensibles | A10 | A verificar |
| Registro de cada invocación a servicios externos | 5.3.3 | A verificar |
| Alertas ante intentos de acceso cruzado entre consorcios | A1 | A verificar |

## 18.4 Cumplimiento de la Ley 25.326

| Obligación | Implementación | Estado |
|---|---|---|
| Finalidad determinada y consentimiento informado | Aviso de privacidad aceptado en el alta | A verificar |
| Derecho de acceso | Exportación de los datos propios | A verificar |
| Derecho de rectificación | Autogestión de datos de contacto | A verificar |
| Derecho de supresión | Procedimiento documentado, compatible con la conservación contable exigida por el CCyC | A definir |
| Medidas de seguridad proporcionales | Este documento | A verificar |
| Registro de la base ante la autoridad de aplicación | Obligación de Grupo Delta; el proveedor asiste en el trámite | A ejecutar |
| Tratamiento por encargado | Cláusulas en los contratos con los proveedores de servicios | A verificar |
| Ausencia de decisiones automatizadas individuales | RN-14: toda salida automática con efecto económico requiere confirmación humana | A verificar |

## 18.5 Verificación externa

Conforme al punto 6.1.2, se contrata una auditoría de seguridad con prueba de penetración antes de la
puesta en producción, por un valor de $ 6.500.000.

| Prioridad | Alcance |
|---:|---|
| 1 | Aislamiento entre consorcios y entre administradoras |
| 2 | Autenticación y gestión de sesiones |
| 3 | Tratamiento de archivos cargados por los usuarios |
| 4 | Autorización en cada caso de uso, con foco en los datos de deuda |
| 5 | Las diez categorías de riesgo más frecuentes en aplicaciones web |

**Un hallazgo de severidad alta bloquea la puesta en producción**, conforme al hito del punto 10.7.
Los resultados se registran en el punto 15.5.

## 18.6 Procedimiento ante incidentes

| Fase | Acción | Responsable | Plazo |
|---|---|---|---|
| Detección | Alerta automática o reporte de usuario | Sistema o cliente | — |
| Contención | Suspender el acceso comprometido; preservar la bitácora | Proveedor | 2 h |
| Evaluación | Determinar alcance: qué datos, cuántos titulares, desde cuándo | Proveedor | 24 h |
| Notificación al cliente | Informe con alcance y medidas adoptadas | Proveedor | 24 h |
| Notificación a los titulares | Si hay riesgo para los derechos de las personas afectadas | Cliente, asistido por el proveedor | 72 h |
| Notificación a la autoridad | Según corresponda | Cliente | Según normativa |
| Remediación | Corregir la causa raíz, no solo el síntoma | Proveedor | Según severidad |
| Informe posterior | Causa, cronología, impacto y medidas preventivas | Proveedor | 15 días |

La preservación de la bitácora en la fase de contención es deliberadamente anterior a cualquier
corrección: un incidente que se corrige sin conservar la evidencia no puede investigarse.

## 18.7 Seguridad en el proceso de desarrollo

| Práctica | Referencia |
|---|---|
| Verificación de autorización incluida en la definición de terminado | 8.3.4, punto 3 |
| Revisión cruzada obligatoria de todo cambio | 8.3.3 |
| Programación en pares en autenticación y autorización | 10.5 |
| Análisis estático automático en cada envío al repositorio | 8.3.5 |
| Ningún secreto en el repositorio; variables de entorno por ambiente | 8.3.5, FR-021/FR-025 de 001: `.env.example` con nombres y `SHADOW_DATABASE_URL`; `.env.local` nunca versionado; secretos de demo/producción en secretos del proveedor; `AUTH_SECRET` generado con `auth secret`; `gitleaks detect` sobre historial completo en cada verificación, 0 hallazgos |
| Revisión de dependencias con vulnerabilidades conocidas | FR-021 de 001: `npm audit --audit-level=high` en cada verificación, 0 altas/críticas; revisión periódica mensual registrada; actualización antes de cada entrega |
| Inventario de licencias verificado antes de cada entrega | 5.3.4 |

## 18.8 Resultados de la verificación

*A completar al cierre.*

| Indicador | Meta | Resultado |
|---|---|---|
| Controles verificados | 100 % | |
| Hallazgos de severidad alta abiertos | 0 | |
| Hallazgos de severidad media abiertos | Documentados | |
| Prueba de restauración de respaldo | Superada | |
| Pruebas de acceso cruzado superadas | 100 % | |
| Dependencias con vulnerabilidades conocidas de severidad alta | 0 | |

---

## Referencias

- Congreso de la Nación Argentina. (2000). *Ley N.º 25.326 de Protección de los Datos Personales*.
- Congreso de la Nación Argentina. (2014). *Ley N.º 26.994. Código Civil y Comercial de la Nación*.
- International Organization for Standardization. (2022). *ISO/IEC 27001:2022 Information security
  management systems*.
- National Institute of Standards and Technology. (2017). *SP 800-63B: Digital Identity Guidelines —
  Authentication and Lifecycle Management*.
- OWASP Foundation. (2021). *OWASP Top Ten Web Application Security Risks*.
- OWASP Foundation. (2021). *OWASP Application Security Verification Standard (ASVS)*, versión 4.0.
