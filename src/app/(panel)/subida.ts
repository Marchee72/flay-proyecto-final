/**
 * PUT directo del navegador al almacen con la URL prefirmada del permiso.
 *
 * Reemplaza al cliente de `@vercel/blob`: la `credencial` que devuelve el
 * permiso ahora es una URL prefirmada (R2/S3) y la subida es un PUT plano. Se
 * usa `XMLHttpRequest` y no `fetch` porque es la unica forma de reportar el
 * progreso de la subida (`subida-directa.tsx`).
 */
export function subirAlAlmacen(
  url: string,
  archivo: File,
  alProgreso?: (cargado: number, total: number) => void,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    // Debe coincidir con el `Content-Type` que el permiso dejo firmado.
    xhr.setRequestHeader('Content-Type', archivo.type)
    if (alProgreso) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) alProgreso(e.loaded, e.total)
      }
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolver() : rechazar(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => rechazar(new Error('Fallo de red en la subida'))
    xhr.send(archivo)
  })
}
