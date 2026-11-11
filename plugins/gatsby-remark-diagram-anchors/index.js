// Give the initial HTML the same fragment destination as the enhanced diagram.
module.exports = function diagramAnchors({ markdownAST }) {
  const ids = new Set()

  function visit(node) {
    if (node.type === "image" && !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(node.url)) {
      const match = node.url.split(/[?#]/, 1)[0].match(/(?:^|\/)([^/]+)\.svg$/i)
      if (match) {
        node.data ??= {}
        const props = (node.data.hProperties ??= {})
        const base = props.id || `diagram-${match[1]}`
        let id = base
        for (let suffix = 2; ids.has(id); suffix++) id = `${base}-${suffix}`
        ids.add(id)
        props.id = id
      }
    }
    node.children?.forEach(visit)
  }

  visit(markdownAST)
}
