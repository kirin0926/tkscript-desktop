import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Shared alias configuration
const aliases = {
  '@/app': resolve(__dirname, 'app'),
  '@/lib': resolve(__dirname, 'lib'),
  '@/resources': resolve(__dirname, 'resources'),
}

/**
 * 将迁移文件从源码目录复制到构建输出目录
 */
const copyMigrations = (): void => {
  const src = resolve(__dirname, 'lib', 'main', 'db', 'migrations')
  const dest = resolve(__dirname, 'out', 'main', 'migrations')

  const copyRecursive = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from)) {
      const srcPath = join(from, entry)
      const destPath = join(to, entry)
      if (statSync(srcPath).isDirectory()) {
        copyRecursive(srcPath, destPath)
      } else {
        copyFileSync(srcPath, destPath)
      }
    }
  }

  copyRecursive(src, dest)
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'lib/main/main.ts'),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'copy-migrations',
        closeBundle: copyMigrations,
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'lib/preload/preload.ts'),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: './app',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'app/index.html'),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
    plugins: [tailwindcss(), react()],
  },
})