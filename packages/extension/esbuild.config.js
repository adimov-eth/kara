import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const watch = process.argv.includes('--watch')

// Ensure dist directory exists
const distDir = resolve(__dirname, 'dist')
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

// Copy static files
const staticFiles = ['manifest.json', 'popup.html']
for (const file of staticFiles) {
  const src = resolve(__dirname, file)
  const dest = resolve(distDir, file)
  if (existsSync(src)) {
    copyFileSync(src, dest)
  }
}

// Copy icons directory
const iconsDir = resolve(__dirname, 'icons')
const distIconsDir = resolve(distDir, 'icons')
if (!existsSync(distIconsDir)) {
  mkdirSync(distIconsDir, { recursive: true })
}
const iconFiles = ['icon-16.png', 'icon-48.png', 'icon-128.png']
for (const file of iconFiles) {
  const src = resolve(iconsDir, file)
  const dest = resolve(distIconsDir, file)
  if (existsSync(src)) {
    copyFileSync(src, dest)
  }
}

// Build configuration
const buildOptions = {
  entryPoints: [
    resolve(__dirname, 'src/background.ts'),
    resolve(__dirname, 'src/content.ts'),
    resolve(__dirname, 'src/popup.ts'),
  ],
  bundle: true,
  outdir: distDir,
  format: 'esm',
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch,
}

if (watch) {
  const ctx = await esbuild.context(buildOptions)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(buildOptions)
  console.log('Build complete!')
}
