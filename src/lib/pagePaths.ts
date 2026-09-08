export function pageComponentFromPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  if (!clean) return 'pages/index.vue'

  const segments = clean.split('/').map(segment => {
    if (segment.startsWith(':') && segment.length > 1) {
      return `[${segment.slice(1)}]`
    }
    return segment
  })

  return `pages/${segments.join('/')}.vue`
}
