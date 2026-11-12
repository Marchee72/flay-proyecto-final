import { describe, expect, it } from 'vitest'

import { valoresDe } from '@/app/valores-de-formulario'

describe('valores de un formulario para devolverlos tras un rechazo (RNF-10)', () => {
  it('descarta la clave de la acción, las sensibles y los archivos', () => {
    const datos = new FormData()
    datos.set('importe', '0')
    datos.set('descripcion', 'x')
    datos.set('$ACTION_KEY', 'k')
    datos.set('contrasena', 's')
    datos.set('archivo', new File([], 'a'))

    expect(valoresDe(datos, ['contrasena'])).toEqual({ importe: '0', descripcion: 'x' })
  })
})
