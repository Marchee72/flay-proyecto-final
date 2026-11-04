# Quickstart: validar asambleas de consorcio

## Requisitos previos

- La base local corriendo (ver `CLAUDE.md`) y el `.env` completo.
- `npm run db:deploy` con la migración de asambleas aplicada, y `npm run db:drift` sin deriva.
- Para la prueba manual: `npm run semilla`. Como la semilla y las pruebas de integración no
  conviven (nota 1 de `CLAUDE.md`), primero se corren las pruebas y después se siembra.

## 1. Dominio (TDD, sin base)

```bash
npm run test:dominio -- asambleas
```

Lo que tiene que dar:

- **Quórum**:
  - no constituye antes de la hora;
  - constituye en primera convocatoria con coeficiente presente > 50 % y no lo hace con
    50,00000000 %;
  - desde `+30 min` constituye en segunda con cualquier porcentaje, siempre que haya al menos una
    unidad presente con voto.
- **Binario**: los tres umbrales con las dos bases.
  - Caso testigo: 4 unidades de coeficientes 40/30/20/10. Votan 40 positivo y 30 negativo; la de
    20 se abstiene; la de 10 está ausente.
    - Absoluta con base «presentes»: rechazado, porque 40 no supera 45 en coeficientes.
    - Si la de 30 también vota positivo: con base «presentes», aprobado (2 de 3 unidades y 70 de
      90). Con la regla «totalidad», queda **provisorio**: 70 supera 50 en coeficientes, pero 2 de
      4 unidades no supera la mitad.
  - Una unidad presente sin voto no integra la base.
  - En un empate exacto se rechaza.
- **Opción múltiple**:
  - gana la opción más votada si coincide en unidades y en coeficientes;
  - si los cómputos discrepan o hay empate en el primer lugar, `sin_decision`.
- **Provisoria**:
  - aprobada por los presentes y no por el total, queda `provisorio`;
  - sin oposiciones, al vencer queda `firme`;
  - con oposiciones que impiden el umbral, `caida`;
  - antes del vencimiento, sigue `provisoria`.
- **Tope de poderes**: el cuarto poder lanza `TopeDePoderes`.
- **Calendario**:
  - el enlace de Google trae `dates` en UTC y el texto codificado;
  - el `.ics` usa CRLF, escapa `,`, `;` y los saltos de línea, y repite el mismo `UID` en cada
    descarga.
- **Coeficientes**: ninguna función acepta `number`; todo pasa por `Decimal`.

## 2. Integración (contra la base local)

```bash
npm run test:integracion -- asambleas
```

Lo que tiene que dar:

- **Aislamiento (SC-005)**: un usuario de otro consorcio recibe `NoEncontrado` al ver, votar, firmar
  o descargar el `.ics`.
- **Convocatoria**:
  - rechaza una fecha anterior a la anticipación, con la fecha mínima en el mensaje;
  - con la asamblea convocada, modificar un punto falla, también por SQL directo, porque lo frena
    el disparador;
  - avisa a los usuarios y encola `correo_directo` para los propietarios sin cuenta con correo;
  - lista a los que no tienen ni cuenta ni correo.
- **Voto**:
  - el segundo voto de la misma unidad reemplaza al primero mientras el punto está abierto;
  - con el punto cerrado, un `UPDATE` directo de un voto falla;
  - votar un punto cerrado falla;
  - una unidad sin voto no vota.
- **Padrón congelado**: cambiar un coeficiente después de abrir no mueve el conteo.
- **Administración no invitada**: ve la asamblea, pero no abre, no dirige y no carga votos.
- **Firma**:
  - con una contraseña incorrecta, se rechaza;
  - la última firma deja un `DocumentoConsorcio` de tipo `acta` con su `hashSha256` y un trabajo
    `indexar_documento` encolado;
  - el `hashFirmado` de cada firma es igual a `hashContenido`.
- **Auditoría**: las operaciones quedan en la bitácora, acotadas a las filas de la corrida
  (nota 2 de `CLAUDE.md`).

## 3. Extremo a extremo (teléfono 390×844)

```bash
npm run test:e2e -- asambleas
npm run test:a11y
```

El recorrido:

1. Un miembro del consejo crea y convoca una asamblea con un punto binario y uno de opción
   múltiple.
2. Un propietario le da poder a su inquilino.
3. Con la hora simulada, quien dirige abre, acredita y constituye.
4. En otra sesión, el inquilino ve el punto en vivo y vota. En la pantalla de quien dirige, el voto
   aparece en ≤ 5 s (SC-001).
5. Quien dirige carga un voto manual, cierra los puntos y finaliza.
6. Se redactan los resúmenes, se designan los firmantes y firman los cuatro. El acta aparece en
   Documentación.

axe no informa violaciones A/AA en la vista en vivo ni en la firma.

## 4. Prueba manual en la demo

```bash
npm run dev
```

- En `/consorcios/<id>/asambleas` del consorcio de 12 unidades: crear, convocar y probar «Agregar a
  Google Calendar», que tiene que abrir el evento con fecha, lugar y orden del día.
- Abrir la vista en vivo en dos navegadores, uno con el viewport de un teléfono, y votar en uno
  mientras se mira el otro.

## 5. Antes del PR

```bash
npx prettier --write .
npm run verificar
npm run docs:versiones
npm audit --omit=dev --audit-level=high
```

Además, gitleaks según `CLAUDE.md`.
