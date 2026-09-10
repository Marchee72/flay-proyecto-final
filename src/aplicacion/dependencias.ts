import { argon2id } from '@/infraestructura/contrasenas/argon2'
import { almacenBlob } from '@/infraestructura/objetos/blob'
import { relojDelSistema } from '@/infraestructura/reloj'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

/**
 * Punto de composicion: donde las implementaciones concretas se atan a los
 * puertos, una sola vez (Principio III).
 *
 * Existe porque la presentacion **no puede** importar infraestructura (§12.1.2)
 * y los casos de uso reciben sus dependencias por parametro para poder probarse
 * con dobles. Sin este archivo, cada pantalla tendria que elegir el reloj y el
 * derivador, que es justo lo que la regla de dependencia evita.
 */
export const HABILITACIONES = repositorioHabilitaciones
export const RELOJ = relojDelSistema
export const DERIVADOR = argon2id
export const ALMACEN = almacenBlob
