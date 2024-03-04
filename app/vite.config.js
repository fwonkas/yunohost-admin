import { fileURLToPath, URL } from 'url'
import { defineConfig, loadEnv } from 'vite'
import fs from 'fs'
import createVuePlugin from '@vitejs/plugin-vue'

import supportedLocales from './src/i18n/supportedLocales'

const supportedDatefnsLocales = Object.entries(supportedLocales).map(
  ([locale, { dateFnsLocale }]) => {
    return dateFnsLocale || locale
  },
)

export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd())

  const config = {
    define: {
      // fake process.env for some deps
      'process.env': {},
    },
    resolve: {
      alias: [
        { find: 'vue', replacement: '@vue/compat' },
        // this is required for the SCSS modules imports with `~` (node_modules)
        { find: /^~(.*)$/, replacement: '$1' },
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
      ],
    },
    css: {
      preprocessorOptions: {
        scss: {
          // To auto inject scss variables into componentns scope
          additionalData: `
            @import "@/scss/_variables.scss";
          `,
        },
      },
    },
    plugins: [
      createVuePlugin({
        template: {
          compilerOptions: {
            compatConfig: {
              MODE: 2,
            },
          },
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Circular import problems, this will merge vue/vuex/etc. and api together
            if (!id.includes('node_modules') && id.includes('api/')) {
              return 'core'
            }
            // Translations
            if (id.includes('locales')) {
              const match = /.*\/i18n\/locales\/([\w-]+)\.json/.exec(id)
              return `locales/${match[1]}/translations`
            }
            // Split date-fns locales
            if (id.includes('date-fns')) {
              const match = /.*\/date-fns\/esm\/locale\/([\w-]+)\/.*\.js/.exec(
                id,
              )
              if (match) {
                if (supportedDatefnsLocales.includes(match[1])) {
                  return `locales/${match[1]}/date-fns`
                } else {
                  // FIXME: currently difficult to cherry pick only needed locales,
                  // hopefully this chunk should not be fetched.
                  return 'locales/not-used'
                }
              } else {
                return 'date-fns'
              }
            }
          },
        },
      },
    },
  }

  if (mode === 'production') {
    return {
      ...config,
      base: '/yunohost/admin',
    }
  } else if (mode === 'development') {
    return {
      ...config,
      server: {
        port: 8080,
        host: env.VITE_IP,
        https: {
          // Use already created cert from yunohost instance
          key: fs.readFileSync('/etc/yunohost/certs/yunohost.org/key.pem'),
          cert: fs.readFileSync('/etc/yunohost/certs/yunohost.org/crt.pem'),
        },
        fs: {
          // Needed for special ynh-dev context where node_modules is symlinked
          allow: [
            '/ynh-dev/yunohost-admin/app',
            '/var/cache/ynh-dev/yunohost-admin/node_modules',
          ],
        },
        proxy: {
          '/yunohost': {
            target: `https://${env.VITE_IP}`,
            ws: true,
            logLevel: 'info',
            secure: false,
          },
        },
      },
    }
  }
})
