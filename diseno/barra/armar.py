# Barra superior: marca a la izquierda y mas grande, Consorcios y Bandeja al centro.
# Arma los dos artboards desde piezas compartidas (barra, lateral, contenido)
# para que las dos opciones difieran solo en lo que se compara. Valores
# literales de src/app/globals.css.
from pathlib import Path

AQUI = Path(__file__).parent

ICONO = lambda d, extra='': f'<svg class="icono"{extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
EDIFICIO = '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>'
BANDEJA = '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>'
CHEVRON = '<path d="m6 9 6 6 6-6"></path>'
CASA = '<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path>'
MENU = '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>'
SALIR = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" x2="9" y1="12" y2="12"></line>'
CHEVRONES = '<path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path>'

ESTILO = """
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6f4; color: #1a1d21; font: 15px/1.5 Poppins, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    a { color: #1a1d21; text-decoration: none; }
    a:hover { color: #2e7d32; }
    h1, h2 { margin: 0; font-weight: 600; }
    h1 { font-size: 28px; }
    .cifra { font-variant-numeric: tabular-nums; }
    .apagado { color: #4a5158; }
    .icono { width: 20px; height: 20px; flex: none; }
    .boton { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 24px; border-radius: 999px; font: 700 15px/1 inherit; border: 2px solid transparent; cursor: pointer; text-decoration: none; }
    .boton--primario { background: #7cb342; color: #23272e; }
    .boton--fantasma { background: #ffffff; border-color: #23272e; color: #23272e; }
    .barra__global a { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; border-radius: 8px; color: #e8eaed; font-size: 13px; }
    /* Scroll del lateral: fino, oscuro y sin pista; solo el pulgar sobre el grafito. */
    .lateral { scrollbar-width: thin; scrollbar-color: #4a5158 transparent; }
    .lateral a { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 0 12px; border-radius: 8px; color: #e8eaed; font-size: 15px; }
    .lateral a.activa { font-weight: 700; color: #9ccc65; background: #2e333b; }
    .lateral h2 { margin: 12px 12px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9ccc65; }
    .campo label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .control { display: flex; align-items: center; width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid #767e76; border-radius: 8px; background: #ffffff; font-size: 15px; }
    th { text-align: left; padding: 12px 16px; background: #ecefec; color: #4a5158; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e6ea; height: 44px; position: sticky; top: 0; }
    td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #e2e6ea; font-size: 15px; height: 44px; }
    .numero { text-align: right; }
    /* El conmutador de consorcio: un solo control, con el nombre como titulo. */
    .conmutador { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 8px; color: #e8eaed; font-weight: 700; font-size: 18px; cursor: pointer; }
    .conmutador .icono { color: #9ccc65; }
    .conmutador .flecha { color: #767e76; margin-left: auto; width: 16px; height: 16px; }
    .conmutador--barra { font-size: 15px; border: 1px solid #4a5158; min-height: 44px; padding: 0 12px; gap: 8px; }
    .conmutador--barra .flecha { margin-left: 0; }
    /* Telefono: la tabla se vuelve lista (una fila por registro, sin scroll a lo ancho). */
    .fila { display: grid; grid-template-columns: minmax(0, 1fr) auto 20px; align-items: center; gap: 12px; min-height: 60px; padding: 8px 16px; border-bottom: 1px solid #e2e6ea; color: #1a1d21; }
    .fila:last-child { border-bottom: 0; }
    .fila__principal { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fila__secundaria { font-size: 13px; color: #4a5158; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fila__cifra { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 15px; text-align: right; }
    .fila .flecha { color: #767e76; }
    .etiqueta { display: inline-block; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
    .etiqueta--vencido { color: #b3261e; background: #fdecea; }
    .etiqueta--pendiente { color: #4a5158; background: #ecefec; }
    .chip { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px 0 16px; border-radius: 999px; border: 1px solid #767e76; background: #ffffff; font-size: 13px; font-weight: 600; }
    .chip .icono { width: 16px; height: 16px; }
    .definiciones { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 12px 0 0; }
    .definiciones dt { font-weight: 600; color: #4a5158; }
    .definiciones dd { margin: 0; }
    .campo { margin-top: 12px; }
    .inferior a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 56px; padding: 4px; color: #e8eaed; font-size: 12px; font-weight: 600; text-align: center; }
    .inferior a.activa { color: #9ccc65; box-shadow: inset 0 4px 0 #9ccc65; }
"""

def cabeza():
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
  <style>{ESTILO}  </style>
</helmet>
"""

PIE = """</x-dc>
</body>
</html>
"""

FLECHA = ' class="icono flecha"'

def conmutador(clase=''):
    return f'<div class="conmutador{clase}" role="button" aria-label="Cambiar de consorcio">{ICONO(EDIFICIO)}<span>Mitre 456</span>{ICONO(CHEVRONES, FLECHA)}</div>'

def barra(telefono=False):
    """Tres columnas: la marca a la izquierda un escalon mas grande (t-titulo1
    en escritorio, t-titulo2 en telefono), la navegacion global centrada de
    verdad (1fr auto 1fr) y Salir cerrando por derecha."""
    pad = '8px 16px' if telefono else '12px 24px'
    enlaces = (f'<a>{ICONO(EDIFICIO)}<span>{"" if telefono else "Consorcios"}</span></a>'
               f'<a>{ICONO(BANDEJA)}<span>{"" if telefono else "Bandeja"}</span></a>')
    # Salir solo icono: el mismo circulo de 44 px que Cerrar, el nombre en aria-label.
    salir = f'<span class="boton boton--fantasma" role="button" aria-label="Salir" style="padding: 0; min-width: 44px; border-radius: 999px">{ICONO(SALIR)}</span>'
    marca = f'<span style="font-weight: 700; font-size: {22 if telefono else 28}px; letter-spacing: 0.04em">FLAY</span>'
    izq, der = marca, salir
    return f"""  <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; background: #23272e; color: #e8eaed; padding: {pad}; flex: none">
    <div style="display: flex; align-items: center; gap: 12px">{izq}</div>
    <div class="barra__global" style="display: flex; gap: 8px">{enlaces}</div>
    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 16px">{der}</div>
  </div>
"""

GRUPOS = [
    ('Dinero', ['Períodos', 'Expensas', 'Gastos', 'Pagos', 'Morosidad']),
    ('Convivencia', ['Reclamos', 'Reservas', 'Espacios', 'Novedades']),
    ('Análisis', ['Documentación', 'Indicadores']),
    ('Administración', ['Unidades', 'Proveedores', 'Usuarios']),
]

ACTIVA = ' class="activa"'

def secciones():
    salida = [f'<a>{ICONO(CASA)}Resumen</a>']
    for titulo, items in GRUPOS:
        salida.append(f'<h2>{titulo}</h2>')
        for i in items:
            salida.append(f'<a{ACTIVA if i == "Gastos" else ""}>{i}</a>')
    return '\n      '.join(salida)

def lateral(con_conmutador):
    cabecera = conmutador() + '\n      <div style="height: 1px; background: #2e333b; margin: 4px 0 8px"></div>' if con_conmutador else ''
    return f"""    <!-- Lateral con su propio scroll, y hasta el borde inferior de la ventana: la grilla no lleva relleno abajo -->
    <div class="lateral" style="padding: 12px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; background: #23272e">
      {cabecera}
      {secciones()}
    </div>
"""

FILAS = [
    ('05/09/2026', 'Limpieza', 'Limpiezas del Sur SRL', 'Servicio mensual', '$ 184.320,75'),
    ('03/09/2026', 'Energía', 'Edesur', 'Factura 0925', '$ 62.410,00'),
    ('01/09/2026', 'Ascensor', 'Ascensores Rosario', 'Abono', '$ 98.000,00'),
    ('28/08/2026', 'Seguro', 'La Segunda', 'Póliza integral', '$ 41.250,30'),
    ('26/08/2026', 'Agua', 'Aguas Santafesinas', 'Consumo agosto', '$ 23.980,00'),
    ('20/08/2026', 'Gas', 'Litoral Gas', 'Consumo agosto', '$ 15.400,20'),
    ('14/08/2026', 'Mantenimiento', 'Plomería Ruiz', 'Arreglo tanque', '$ 78.000,00'),
    ('11/08/2026', 'Honorarios', 'Grupo Delta SRL', 'Administración agosto', '$ 120.000,00'),
    ('08/08/2026', 'Limpieza', 'Limpiezas del Sur SRL', 'Servicio mensual', '$ 184.320,75'),
    ('05/08/2026', 'Energía', 'Edesur', 'Factura 0825', '$ 59.870,10'),
    ('01/08/2026', 'Ascensor', 'Ascensores Rosario', 'Abono', '$ 98.000,00'),
    ('29/07/2026', 'Seguro', 'La Segunda', 'Póliza integral', '$ 41.250,30'),
]

def contenido(telefono=False):
    filas = '\n'.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td><td class="numero cifra">{e}</td></tr>' for a, b, c, d, e in FILAS)
    pad = '16px' if not telefono else '16px'
    return f"""    <!-- Contenido con su propio scroll: la barra y el lateral no se mueven -->
    <div style="background: #f4f6f4; border-top-left-radius: {'0' if telefono else '10px'}; padding: {pad}; min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px">
      <h1>Gastos</h1>
      <p class="apagado" style="margin: 0">Lo que el consorcio pagó, por período y rubro.</p>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0">
        <span class="boton boton--primario">Nuevo gasto</span>
        <span class="boton boton--fantasma">Carga asistida</span>
        <span class="boton boton--fantasma">Exportar</span>
      </div>
      <div style="border: 1px solid #c9cfc9; border-radius: 10px; background: #ffffff; overflow: {'auto' if telefono else 'hidden'}">
        <table style="width: 100%; border-collapse: collapse; min-width: 560px">
          <thead><tr><th>Fecha</th><th>Rubro</th><th>Proveedor</th><th>Detalle</th><th class="numero">Importe</th></tr></thead>
          <tbody>{filas}</tbody>
        </table>
      </div>
    </div>
"""

def escritorio():
    return (cabeza()
      + '<div style="width: 1440px; height: 720px; overflow: hidden; background: #f4f6f4; display: flex; flex-direction: column">\n'
      + barra()
      + '  <div style="display: grid; grid-template-columns: 220px 1fr; flex: 1; min-height: 0; background: #23272e">\n'
      + lateral(True)
      + contenido()
      + '  </div>\n</div>\n' + PIE)

def telefono():
    fila = (f'<span style="display: flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; border: 1px solid #4a5158; border-radius: 8px">{ICONO(MENU)}</span>'
            + conmutador(' conmutador--barra'))
    inferior = ''.join(f'<a{ACTIVA if t == "Gastos" else ""}>{ICONO(d)}{t}</a>' for t, d in [
        ('Períodos', '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path>'),
        ('Expensas', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path>'),
        ('Gastos', '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>'),
        ('Pagos', '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>'),
        ('Morosidad', '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>'),
    ])
    return (cabeza()
      + '<div style="width: 390px; height: 844px; overflow: hidden; background: #f4f6f4; display: flex; flex-direction: column">\n'
      + barra(telefono=True)
      + f'  <div style="display: flex; align-items: center; gap: 12px; background: #23272e; color: #e8eaed; padding: 12px 16px; flex: none">{fila}</div>\n'
      + '  <div style="flex: 1; min-height: 0; display: flex; flex-direction: column">\n'
      + contenido(telefono=True)
      + '  </div>\n'
      + f'  <div class="inferior" style="flex: none; background: #23272e; border-top: 1px solid #4a5158; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr))">{inferior}</div>\n'
      + '</div>\n' + PIE)


# --- Telefono ---------------------------------------------------------------

CHEVRON_DER = '<path d="m9 18 6-6-6-6"></path>'
MAS = '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>'
FILTRO = '<line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y1="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line><line x1="14" x2="14" y1="2" y2="6"></line><line x1="8" x2="8" y1="10" y2="14"></line><line x1="16" x2="16" y1="18" y2="22"></line>'
CRUZ = '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
VOLVER = '<path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path>'
IZQ = '<path d="m15 18-6-6 6-6"></path>'
SUBIR = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line>'
ALERTA = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>'

SECCIONES_INFERIOR = [
    ('Períodos', '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path>'),
    ('Expensas', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path>'),
    ('Gastos', '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>'),
    ('Pagos', '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>'),
    ('Morosidad', ALERTA),
]

def inferior(activa):
    return ''.join(f'<a{ACTIVA if t == activa else ""}>{ICONO(d)}{t}</a>' for t, d in SECCIONES_INFERIOR)

def circulo(icono, etiqueta, fondo='#ffffff', borde='#23272e'):
    return f'<span class="boton" role="button" aria-label="{etiqueta}" style="padding: 0; min-width: 44px; border-radius: 999px; background: {fondo}; border-color: {borde}; color: #23272e">{ICONO(icono)}</span>'

def marco(contenido, hoja='', activa='Gastos'):
    """Armazon de telefono: barra, fila de consorcio + menu, contenido con su
    scroll, barra inferior. `hoja` es una hoja inferior opcional encima."""
    fila = (f'<span style="display: flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; border: 1px solid #4a5158; border-radius: 8px">{ICONO(MENU)}</span>'
            + conmutador(' conmutador--barra'))
    return (cabeza()
      + '<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: #f4f6f4; display: flex; flex-direction: column">\n'
      + barra(telefono=True)
      + f'  <div style="display: flex; align-items: center; gap: 12px; background: #23272e; color: #e8eaed; padding: 12px 16px; flex: none">{fila}</div>\n'
      + '  <div style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 4px">\n'
      + contenido
      + '  </div>\n'
      + f'  <div class="inferior" style="flex: none; background: #23272e; border-top: 1px solid #4a5158; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr))">{inferior(activa)}</div>\n'
      + hoja
      + '</div>\n' + PIE)

def fila_gasto(fecha, rubro, proveedor, detalle, importe):
    return (f'<a class="fila" href="#">'
            f'<span style="display: grid; gap: 2px; min-width: 0"><span class="fila__principal">{detalle}</span>'
            f'<span class="fila__secundaria">{fecha[:5]} · {rubro} · {proveedor}</span></span>'
            f'<span class="fila__cifra cifra">{importe}</span>{ICONO(CHEVRON_DER, FLECHA)}</a>')

def lista_gastos():
    filas = '\n        '.join(fila_gasto(*f) for f in FILAS[:9])
    return f"""    <h1>Gastos</h1>
    <p class="apagado" style="margin: 0">Lo que el consorcio pagó, por período y rubro.</p>
    <!-- Una accion primaria a todo el ancho; las secundarias (carga asistida, exportar) detras de «Mas». -->
    <div style="display: flex; gap: 8px; margin: 16px 0 12px">
      <span class="boton boton--primario" style="flex: 1">Nuevo gasto</span>
      {circulo(MAS, 'Más acciones')}
    </div>
    <!-- Filtros: un boton que abre la hoja, y lo aplicado como chip que se quita con la cruz. -->
    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px">
      <span class="chip" role="button">{ICONO(FILTRO)}Filtros</span>
      <span class="chip" role="button" aria-label="Quitar filtro Septiembre 2026" style="border-color: #23272e; background: #ecefec">Septiembre 2026 {ICONO(CRUZ)}</span>
    </div>
    <div style="border: 1px solid #c9cfc9; border-radius: 10px; background: #ffffff; overflow: hidden">
      <div style="padding: 8px 16px; font-size: 13px; color: #4a5158; border-bottom: 1px solid #e2e6ea">12 gastos · página 1 de 2</div>
      <div style="display: flex; flex-direction: column">
        {filas}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #ecefec; border-top: 2px solid #c9cfc9; font-weight: 700"><span>Total del filtro</span><span class="cifra">$ 1.006.802,40</span></div>
    </div>
    <div style="display: flex; justify-content: center; gap: 8px; margin: 16px 0">
      <span class="boton boton--fantasma" role="button" aria-label="Anterior" style="padding: 0; min-width: 44px; border-radius: 8px; border-width: 1px; border-color: #767e76; opacity: 0.5">{ICONO(IZQ)}</span>
      <span class="boton" style="min-width: 44px; padding: 0 12px; border-radius: 8px; background: #23272e; color: #e8eaed; font-size: 13px">1</span>
      <span class="boton boton--fantasma" style="min-width: 44px; padding: 0 12px; border-radius: 8px; border-width: 1px; border-color: #767e76; font-size: 13px">2</span>
      <span class="boton boton--fantasma" role="button" aria-label="Siguiente" style="padding: 0; min-width: 44px; border-radius: 8px; border-width: 1px; border-color: #767e76">{ICONO(CHEVRON_DER)}</span>
    </div>
"""

def hoja(titulo, cuerpo, acciones, alta=False):
    """Hoja inferior: reemplaza al dialogo centrado en telefono. Asa arriba,
    titulo + cerrar, cuerpo con scroll y acciones fijas al pie."""
    return f"""  <div style="position: absolute; inset: 0; background: rgba(35, 39, 46, 0.55); display: flex; flex-direction: column; justify-content: flex-end">
    <div role="dialog" aria-label="{titulo}" style="background: #ffffff; border-radius: 16px 16px 0 0; max-height: {'92%' if alta else '80%'}; display: flex; flex-direction: column; box-shadow: 0 -8px 24px rgba(26, 29, 33, 0.18)">
      <div style="width: 40px; height: 4px; border-radius: 999px; background: #c9cfc9; margin: 8px auto 0"></div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 16px 12px; border-bottom: 1px solid #e2e6ea">
        <h2 style="font-size: 22px">{titulo}</h2>
        {circulo(CRUZ, 'Cerrar', fondo='#ecefec', borde='#ecefec')}
      </div>
      <div style="padding: 4px 16px 16px; overflow-y: auto; min-height: 0; display: flex; flex-direction: column">
        {cuerpo}
      </div>
      <div style="display: flex; gap: 8px; padding: 12px 16px 16px; border-top: 1px solid #e2e6ea; background: #ffffff">
        {acciones}
      </div>
    </div>
  </div>
"""

def campo(etiqueta, valor, ayuda='', apagado=False):
    return (f'<div class="campo"><label>{etiqueta}</label>'
            f'<div class="control"{" style=\"color: #4a5158\"" if apagado else ""}>{valor}</div>'
            + (f'<p class="apagado" style="margin: 4px 0 0; font-size: 12px">{ayuda}</p>' if ayuda else '') + '</div>')

def select(etiqueta, valor):
    return (f'<div class="campo"><label>{etiqueta}</label>'
            f'<div class="control" style="justify-content: space-between">{valor}{ICONO(CHEVRON)}</div></div>')

HOJA_FILTROS = hoja('Filtros',
    select('Período', 'Septiembre 2026') + select('Rubro', 'Todos'),
    '<span class="boton boton--fantasma" style="flex: 1 1 0; padding: 0 16px">Limpiar</span><span class="boton boton--primario" style="flex: 1 1 0; padding: 0 16px">Aplicar</span>')

HOJA_NUEVO = hoja('Nuevo gasto',
    campo('Fecha', '16/09/2026') + select('Rubro', 'Elegí un rubro') + campo('Proveedor', 'Buscar por razón social o CUIT', apagado=True)
    + campo('Detalle', 'Servicio mensual') + campo('Importe', '$ 0,00', ayuda='Con centavos, como en el comprobante.')
    + f'<div class="campo"><label>Comprobante</label><div style="display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 64px; border: 1px dashed #767e76; border-radius: 8px; font-size: 13px; font-weight: 600">{ICONO(SUBIR)}Elegir archivo o sacar foto</div></div>',
    '<span class="boton boton--fantasma" style="flex: 1 1 0; padding: 0 16px">Descartar</span><span class="boton boton--primario" style="flex: 1 1 0; padding: 0 16px">Registrar</span>',
    alta=True)

def detalle_gasto():
    defs = ''.join(f'<dt>{k}</dt><dd{" class=\"cifra\"" if k == "Importe" else ""}>{v}</dd>' for k, v in [
        ('Fecha', '05/09/2026'), ('Rubro', 'Limpieza'), ('Proveedor', 'Limpiezas del Sur SRL'),
        ('Importe', '$ 184.320,75'), ('Período', 'Septiembre 2026'), ('Cargado por', 'Franco Ferrero · 05/09 14:20')])
    return f"""    <div style="margin: 0 0 12px"><span class="boton boton--fantasma" style="min-height: 44px; padding: 0 16px; border-width: 1px; border-color: #767e76; font-weight: 600">{ICONO(VOLVER)}Gastos</span></div>
    <h1>Servicio mensual</h1>
    <p class="apagado" style="margin: 0">Gasto del 05/09/2026 · Limpieza</p>
    <div style="border: 1px solid #e2e6ea; border-radius: 10px; background: #ffffff; padding: 16px; margin-top: 16px">
      <dl class="definiciones" style="margin: 0">{defs}</dl>
    </div>
    <h2 style="font-size: 18px; margin: 24px 0 8px">Comprobantes</h2>
    <div style="border: 1px solid #c9cfc9; border-radius: 10px; background: #ffffff; overflow: hidden">
      <a class="fila" href="#"><span style="display: grid; gap: 2px; min-width: 0"><span class="fila__principal">Factura B 0004-00012345</span><span class="fila__secundaria">PDF · 212 KB · 05/09 14:20</span></span><span></span>{ICONO(CHEVRON_DER, FLECHA)}</a>
    </div>
    <div style="display: flex; gap: 8px; margin: 24px 0 0">
      <span class="boton boton--fantasma" style="flex: 1 1 0; padding: 0 16px">Editar</span>
      <span class="boton" style="flex: 1 1 0; padding: 0 16px; border-color: #b3261e; color: #b3261e; background: #ffffff">Anular</span>
    </div>
"""

def lista_morosidad():
    deudores = [('2° B', 'Ana Suárez', 3, '$ 412.180,00', 'vencido'), ('5° A', 'Jorge Peralta', 2, '$ 268.700,50', 'vencido'),
                ('PB 1', 'Consorcio local', 1, '$ 96.412,10', 'pendiente'), ('4° C', 'M. Fernández', 1, '$ 91.008,00', 'pendiente')]
    filas = '\n        '.join(
        f'<a class="fila" href="#"><span style="display: grid; gap: 2px; min-width: 0"><span class="fila__principal">{u} · {n}</span>'
        f'<span class="fila__secundaria">{p} período{"s" if p > 1 else ""} vencido{"s" if p > 1 else ""}</span></span>'
        f'<span style="display: grid; gap: 4px; justify-items: end"><span class="fila__cifra cifra">{d}</span><span class="etiqueta etiqueta--{e}">{"En mora" if e == "vencido" else "Intimado"}</span></span>{ICONO(CHEVRON_DER, FLECHA)}</a>'
        for u, n, p, d, e in deudores)
    return f"""    <h1>Morosidad</h1>
    <p class="apagado" style="margin: 0">Quién debe, cuánto y desde cuándo.</p>
    <div style="background: #23272e; border-radius: 10px; padding: 12px 16px; display: flex; gap: 12px; align-items: center; margin: 16px 0 12px; color: #e8eaed">
      <span style="width: 40px; height: 40px; border-radius: 8px; background: #9ccc65; color: #23272e; display: flex; align-items: center; justify-content: center; flex: none">{ICONO(ALERTA)}</span>
      <span style="display: grid; gap: 2px"><span style="font-size: 10px; letter-spacing: 0.06em; color: #9ccc65; font-weight: 600; text-transform: uppercase">Deuda total</span><span class="cifra" style="font-family: Inter, Poppins, sans-serif; font-size: 22px; font-weight: 700; color: #ffffff">$ 868.300,60</span><span style="font-size: 12px">4 de 12 unidades</span></span>
    </div>
    <div style="border: 1px solid #c9cfc9; border-radius: 10px; background: #ffffff; overflow: hidden">
      <div style="display: flex; flex-direction: column">
        {filas}
      </div>
    </div>
"""

(AQUI / 'Main.dc.html').write_text(escritorio(), encoding='utf-8')
(AQUI / 'Telefono.dc.html').write_text(marco(lista_gastos()), encoding='utf-8')
(AQUI / 'TelefonoFiltros.dc.html').write_text(marco(lista_gastos(), HOJA_FILTROS), encoding='utf-8')
(AQUI / 'TelefonoNuevo.dc.html').write_text(marco(lista_gastos(), HOJA_NUEVO), encoding='utf-8')
(AQUI / 'TelefonoGasto.dc.html').write_text(marco(detalle_gasto()), encoding='utf-8')
(AQUI / 'TelefonoMorosidad.dc.html').write_text(marco(lista_morosidad(), activa='Morosidad'), encoding='utf-8')
print('ok')
