import { expect, it } from 'vitest'

import { mismoNombre } from '@/compartido/nombres'

it('ignora tildes, mayúsculas y espacios de más', () => {
  expect(mismoNombre('ana  ÁLVAREZ ', 'Ana Alvarez')).toBe(true)
  expect(mismoNombre('Pedro Hermano', 'Ana Alvarez')).toBe(false)
})
