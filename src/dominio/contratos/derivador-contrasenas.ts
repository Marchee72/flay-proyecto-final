/**
 * Derivacion de contrasenas (FR-001, RNF-04). El dominio no conoce la
 * biblioteca ni los parametros: los fija la infraestructura, que es donde se
 * ajustan contra el presupuesto de tiempo de la plataforma.
 */
export interface DerivadorDeContrasenas {
  derivar(contrasenaEnClaro: string): Promise<string>
  verificar(contrasenaEnClaro: string, claveDerivada: string): Promise<boolean>
}
