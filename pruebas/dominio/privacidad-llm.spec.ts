import { describe, expect, it } from 'vitest'

import {
  CLAVES_PII,
  redactarContactoEnTexto,
  sanitizarParaModelo,
} from '@/dominio/asistencia/privacidad'

describe('redactarContactoEnTexto (RF-27, RNF-13)', () => {
  it('redacta correos electrónicos en texto libre', () => {
    expect(redactarContactoEnTexto('Escribir a juan.perez@ejemplo.com por la pérdida')).toBe(
      'Escribir a [correo omitido] por la pérdida',
    )
  })

  it('redacta CUIL/CUIT de persona física y DNI con formato', () => {
    expect(redactarContactoEnTexto('Titular CUIL 20-38123456-7 y DNI 38.123.456')).toBe(
      'Titular CUIL [documento omitido] y DNI [documento omitido]',
    )
    expect(redactarContactoEnTexto('Documento 27-30111222-4')).toBe('Documento [documento omitido]')
    expect(redactarContactoEnTexto('DNI: 38123456')).toBe('DNI: [documento omitido]')
  })

  it('redacta teléfonos argentinos con o sin prefijo internacional', () => {
    expect(redactarContactoEnTexto('Llamar al +54 9 341 555-0199 urgente')).toBe(
      'Llamar al [teléfono omitido] urgente',
    )
    expect(redactarContactoEnTexto('Tel: 0341-4551234 o 15 6123-4567')).toBe(
      'Tel: [teléfono omitido] o [teléfono omitido]',
    )
  })

  it('preserva importes, fechas ISO, designaciones, facturas y CUIT jurídico', () => {
    const seguro =
      'Unidad 3° B (Cochera 12): factura 0001-00004512 de CUIT 30-71234567-9 por $ 145.320,50 el 2026-11-19T15:00:00-03:00'
    expect(redactarContactoEnTexto(seguro)).toBe(seguro)
  })
})

describe('sanitizarParaModelo (RF-27, RNF-13)', () => {
  it('reemplaza URLs firmadas por null', () => {
    const entrada = {
      comprobante: 'https://r2.ejemplo.com/bucket/factura.pdf?sig=abc',
      otra: 'http://localhost:3000/descarga',
      direccion: 'Bv. Oroño 1234',
    }
    expect(sanitizarParaModelo(entrada)).toEqual({
      comprobante: null,
      otra: null,
      direccion: 'Bv. Oroño 1234',
    })
  })

  it('elimina recursivamente todas las claves reservadas de PII en objetos y arreglos', () => {
    expect(CLAVES_PII.has('correo')).toBe(true)
    expect(CLAVES_PII.has('ocupantes')).toBe(true)
    expect(CLAVES_PII.has('solicitante')).toBe(true)

    const entrada = {
      consorcio: { nombre: 'Edificio Mitre', direccion: 'Mitre 456' },
      unidades: [
        {
          id: 'u-1',
          designacion: '3° B',
          saldo: '45000.00',
          ocupantes: [
            { nombre: 'Zulema Canario', correo: 'zulema@ejemplo.test', telefono: '3415550199' },
          ],
          titular: 'Zulema Canario',
          personaId: 'p-1',
          usuarioId: 'usr-1',
        },
      ],
      reclamo: {
        id: 'r-1',
        titulo: 'Humedad en techo',
        descripcion: 'Contactar a zulema@ejemplo.test o al +54 9 341 555-0199',
        autor: 'Zulema Canario',
        responsable: 'Admin Demo',
        responsableId: 'usr-admin',
        creadoPor: 'usr-1',
      },
      reserva: {
        id: 'res-1',
        espacio: 'SUM',
        solicitante: 'Zulema Canario',
        reservadoPor: 'usr-1',
        fecha: new Date('2026-11-20T15:00:00Z'),
      },
      proveedor: {
        razonSocial: 'Plomería Rosario SRL',
        cuit: '30-71234567-9',
        correo: 'ventas@plomeria.test',
        telefono: '0341-4551234',
      },
    }

    const salida = sanitizarParaModelo(entrada) as Record<string, unknown>
    expect(salida).toEqual({
      consorcio: { nombre: 'Edificio Mitre', direccion: 'Mitre 456' },
      unidades: [
        {
          id: 'u-1',
          designacion: '3° B',
          saldo: '45000.00',
        },
      ],
      reclamo: {
        id: 'r-1',
        titulo: 'Humedad en techo',
        descripcion: 'Contactar a [correo omitido] o al [teléfono omitido]',
      },
      reserva: {
        id: 'res-1',
        espacio: 'SUM',
        fecha: new Date('2026-11-20T15:00:00Z'),
      },
      proveedor: {
        razonSocial: 'Plomería Rosario SRL',
        cuit: '30-71234567-9',
      },
    })
  })
})
