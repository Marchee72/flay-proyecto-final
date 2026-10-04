-- RF-15: el espacio comun se puede deshabilitar y rehabilitar. Cada tramo
-- deshabilitado queda registrado (reforma, suspension, etc.) para el calendario
-- de uso. El estado vigente sigue en `EspacioComun.activo`; esta tabla es la
-- historia. Nace con DML para flay_app por los privilegios por defecto del
-- esquema (ver 20260909000000_inicial).

-- CreateTable
CREATE TABLE "SuspensionEspacio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "desde" TIMESTAMPTZ(6) NOT NULL,
    "hasta" TIMESTAMPTZ(6),
    "motivo" TEXT NOT NULL,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspensionEspacio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuspensionEspacio_consorcio_id_espacio_id_desde_idx" ON "SuspensionEspacio"("consorcio_id", "espacio_id", "desde");

-- AddForeignKey
ALTER TABLE "SuspensionEspacio" ADD CONSTRAINT "SuspensionEspacio_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspensionEspacio" ADD CONSTRAINT "SuspensionEspacio_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "EspacioComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
