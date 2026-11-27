import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')

function fileFor(specifier) {
  const base = path.join(root, specifier.slice(2))
  if (fs.existsSync(`${base}.ts`)) return `${base}.ts`
  if (fs.existsSync(`${base}.tsx`)) return `${base}.tsx`
  if (fs.existsSync(path.join(base, 'index.ts'))) return path.join(base, 'index.ts')
  return base
}

function withExtension(base) {
  if (fs.existsSync(`${base}.ts`)) return `${base}.ts`
  if (fs.existsSync(`${base}.tsx`)) return `${base}.tsx`
  if (fs.existsSync(path.join(base, 'index.ts'))) return path.join(base, 'index.ts')
  return null
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(pathToFileURL(fileFor(specifier)).href, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !path.extname(specifier)) {
    const resolved = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier))
    if (resolved) return next(pathToFileURL(resolved).href, context)
  }
  return next(specifier, context)
}
