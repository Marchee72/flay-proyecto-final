# Arma los cuatro artboards desde piezas compartidas (barra, lateral, contenido)
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

def barra(con_conmutador, telefono=False):
    pad = '8px 16px' if telefono else '12px 24px'
    enlaces = (f'<a>{ICONO(EDIFICIO)}<span>{"" if telefono else "Consorcios"}</span></a>'
               f'<a>{ICONO(BANDEJA)}<span>{"" if telefono else "Bandeja"}</span></a>')
    conm = conmutador(' conmutador--barra') if con_conmutador else ''
    return f"""  <div style="display: flex; align-items: center; gap: 12px; background: #23272e; color: #e8eaed; padding: {pad}; flex: none">
    <span style="font-weight: 700; font-size: 18px; letter-spacing: 0.04em">FLAY</span>
    {conm}
    <div class="barra__global" style="display: flex; gap: 8px">{enlaces}</div>
    <span class="boton boton--fantasma" style="margin-left: auto{'; padding: 0 16px' if telefono else ''}">Salir</span>
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
    return f"""    <!-- Lateral con su propio scroll: overflow-y auto y min-height 0 -->
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

def escritorio(con_conmutador_en_lateral):
    return (cabeza()
      + '<div style="width: 1440px; height: 720px; overflow: hidden; background: #f4f6f4; display: flex; flex-direction: column">\n'
      + barra(not con_conmutador_en_lateral)
      + '  <div style="display: grid; grid-template-columns: 220px 1fr; flex: 1; min-height: 0; background: #23272e; padding: 0 24px 24px 0">\n'
      + lateral(con_conmutador_en_lateral)
      + contenido()
      + '  </div>\n</div>\n' + PIE)

def telefono(con_conmutador_en_lateral):
    fila = (f'<span style="display: flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; border: 1px solid #4a5158; border-radius: 8px">{ICONO(MENU)}</span>'
            + (conmutador(' conmutador--barra') if con_conmutador_en_lateral else '<span style="font-weight: 700; font-size: 18px">Gastos</span>'))
    inferior = ''.join(f'<a{ACTIVA if t == "Gastos" else ""}>{ICONO(d)}{t}</a>' for t, d in [
        ('Períodos', '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path>'),
        ('Expensas', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path>'),
        ('Gastos', '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>'),
        ('Pagos', '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>'),
        ('Morosidad', '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>'),
    ])
    return (cabeza()
      + '<div style="width: 390px; height: 844px; overflow: hidden; background: #f4f6f4; display: flex; flex-direction: column">\n'
      + barra(not con_conmutador_en_lateral, telefono=True)
      + f'  <div style="display: flex; align-items: center; gap: 12px; background: #23272e; color: #e8eaed; padding: 12px 16px; flex: none">{fila}</div>\n'
      + '  <div style="flex: 1; min-height: 0; display: flex; flex-direction: column">\n'
      + contenido(telefono=True)
      + '  </div>\n'
      + f'  <div class="inferior" style="flex: none; background: #23272e; border-top: 1px solid #4a5158; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr))">{inferior}</div>\n'
      + '</div>\n' + PIE)

(AQUI / 'Main.dc.html').write_text(escritorio(True), encoding='utf-8')
(AQUI / 'Barra.dc.html').write_text(escritorio(False), encoding='utf-8')
(AQUI / 'TelefonoA.dc.html').write_text(telefono(True), encoding='utf-8')
(AQUI / 'TelefonoB.dc.html').write_text(telefono(False), encoding='utf-8')
print('ok')
