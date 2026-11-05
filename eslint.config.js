import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist', 'dev-dist', 'drizzle', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/server/**/*.ts', '*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
)
