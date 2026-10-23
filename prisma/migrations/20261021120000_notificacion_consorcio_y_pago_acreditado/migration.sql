-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'pago_acreditado';

-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN "consorcio_id" UUID;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
