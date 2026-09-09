/**
 * Regla propia: prohibe la aritmetica de punto flotante sobre importes.
 *
 * Medida 4 de contencion de §14.1 y Principio II: TypeScript no tiene decimal
 * nativo, asi que el dinero viaja en `Prisma.Decimal`. Todo operador aritmetico
 * sobre un `Decimal` es un `NaN` esperando: hay que usar sus metodos
 * (`plus`, `minus`, `times`, `div`).
 *
 * Necesita informacion de tipos (`parserOptions.projectService`).
 */

const OPERADORES = new Set(['+', '-', '*', '/', '%'])
const ASIGNACIONES = new Set(['+=', '-=', '*=', '/=', '%='])
const UNARIOS = new Set(['-', '+'])

const METODO = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'div', '%': 'mod' }

function esDecimal(servicios, checker, nodo) {
  const nodoTs = servicios.esTreeNodeToTSNodeMap.get(nodo)
  if (!nodoTs) return false
  const tipo = checker.getTypeAtLocation(nodoTs)
  const nombres = [tipo.getSymbol()?.getName(), tipo.aliasSymbol?.getName()]
  if (nombres.includes('Decimal')) return true
  // Uniones y tipos con nombre: `Decimal | null`, `Prisma.Decimal`.
  return /\bDecimal\b/.test(checker.typeToString(tipo))
}

const reglaSinAritmeticaMonetaria = {
  meta: {
    type: 'problem',
    docs: { description: 'Prohibe operadores aritmeticos sobre valores Decimal (dinero).' },
    schema: [],
    messages: {
      prohibido:
        'Aritmetica de punto flotante sobre un Decimal (dinero). Usar {{metodo}}() en su lugar: el redondeo solo va al final de cada importe unitario.',
    },
  },
  create(context) {
    const servicios = context.sourceCode.parserServices
    if (!servicios?.program) return {}
    const checker = servicios.program.getTypeChecker()

    const reportar = (nodo, operador) =>
      context.report({
        node: nodo,
        messageId: 'prohibido',
        data: { metodo: METODO[operador.replace('=', '')] ?? 'los metodos de Decimal' },
      })

    return {
      BinaryExpression(nodo) {
        if (!OPERADORES.has(nodo.operator)) return
        if (esDecimal(servicios, checker, nodo.left) || esDecimal(servicios, checker, nodo.right)) {
          reportar(nodo, nodo.operator)
        }
      },
      AssignmentExpression(nodo) {
        if (!ASIGNACIONES.has(nodo.operator)) return
        if (esDecimal(servicios, checker, nodo.left) || esDecimal(servicios, checker, nodo.right)) {
          reportar(nodo, nodo.operator)
        }
      },
      UnaryExpression(nodo) {
        if (!UNARIOS.has(nodo.operator)) return
        if (esDecimal(servicios, checker, nodo.argument)) reportar(nodo, nodo.operator)
      },
    }
  },
}

export default reglaSinAritmeticaMonetaria
