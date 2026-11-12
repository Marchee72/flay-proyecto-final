import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  altaProveedor,
  CuitDeProveedorRepetido,
  CuitInvalido,
  editarProveedor,
  ProveedorIncompleto,
  listarProveedores,
} from '@/aplicacion/proveedores/proveedores'
import { RolInsuficiente } from '@/compartido/errores'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/** Proveedores sin duplicar (`RF-05`): el CUIT se normaliza antes de la clave unica. */

const RELOJ = relojFijo('2026-09-26T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let otroConsorcioId: string
let administrador: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'Rioja 12')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(administrador, otroConsorcioId, 'administrador')
})

afterEach(limpiar)

const alta = (cuit: string, enConsorcio = consorcioId) =>
  altaProveedor(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: enConsorcio,
    razonSocial: 'Ascensores Rosario',
    cuit,
  })

describe('alta de proveedor', () => {
  it('el mismo CUIT tipeado distinto es el mismo proveedor', async () => {
    await alta('20123456789')
    await expect(alta('20-12345678-9')).rejects.toBeInstanceOf(CuitDeProveedorRepetido)
    await expect(alta(' 20 12345678 9 ')).rejects.toBeInstanceOf(CuitDeProveedorRepetido)

    const lista = await listarProveedores(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(lista.map((p) => p.cuit)).toEqual(['20-12345678-9'])
  })

  it('otro consorcio puede tener al mismo proveedor', async () => {
    await alta('20-12345678-9')
    await expect(alta('20-12345678-9', otroConsorcioId)).resolves.toHaveProperty('proveedorId')
  })

  it('un CUIT que no tiene 11 digitos se rechaza con un mensaje claro', async () => {
    await expect(alta('20-1234-9')).rejects.toBeInstanceOf(CuitInvalido)
  })

  it('dos altas simultaneas del mismo CUIT dejan una y la otra recibe el mensaje', async () => {
    const resultados = await Promise.allSettled([alta('30-71234567-0'), alta('30712345670')])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rechazo = resultados.find((r) => r.status === 'rejected')
    expect(rechazo?.status === 'rejected' && rechazo.reason).toBeInstanceOf(CuitDeProveedorRepetido)
  })
})

describe('edicion de proveedor', () => {
  it('editar cambia la razon social y deja el CUIT', async () => {
    const { proveedorId } = await alta('20-12345678-9')
    await editarProveedor(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      proveedorId,
      razonSocial: '  Ascensores del Litoral ',
      telefono: '341 555 0101',
      correo: 'ventas@litoral.example',
    })

    const [proveedor] = await listarProveedores(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(proveedor).toMatchObject({
      razonSocial: 'Ascensores del Litoral',
      cuit: '20-12345678-9',
      telefono: '341 555 0101',
      correo: 'ventas@litoral.example',
    })
  })

  it('una razon social vacia se rechaza', async () => {
    const { proveedorId } = await alta('20-12345678-9')
    await expect(
      editarProveedor(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        proveedorId,
        razonSocial: '   ',
      }),
    ).rejects.toBeInstanceOf(ProveedorIncompleto)
  })

  it('un consorcista no puede editar', async () => {
    const { proveedorId } = await alta('20-12345678-9')
    const vecino = (await crearUsuario('Vera')).id
    await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
    await expect(
      editarProveedor(repo, RELOJ, {
        usuarioId: vecino,
        consorcioId,
        proveedorId,
        razonSocial: 'Otro nombre',
      }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })
})
