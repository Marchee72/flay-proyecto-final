# Quickstart — 001-andamiaje

1. Prerrequisitos: `node --version` (v22.x), `npm --version` (10.x+), `git --version`, `docker --version`.
2. Acta Paso 0: ratificar plataforma + versiones §14.1 + cláusulas Ley 25.326.
3. `npx --yes create-next-app@15.3.4 .tmp-flay ...` → mover → `npm install` (versiones §14.1).
4. `docker run` idempotente `flay-db` (`pgvector/pgvector:pg17`); `.env.example` (+`SHADOW_DATABASE_URL`) y `.env.local` si no existe; `npx auth secret` nunca versionado.
5. `npx prisma migrate dev --name inicial` (vector, btree_gist, pgcrypto, bitácora + `fn_auditar`, `REVOKE` a `flay_app`).
6. `npm run verificar` en verde (<10 min en CI): 4 fixtures fallan (SC-003), `test:dominio` sin `DATABASE_URL` (SC-002), `db:deploy`+`db:drift`=0 (SC-005), bitácora 3× denied (SC-006), `/api/salud` 200 en 2 proyectos + 390 px sin scroll (SC-011), SC-013 aislamiento.
7. Integrar a main → demo actualizado <10 min con nueva `version` (SC-007); en rojo, 0 deploys.
