import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// El SVG es un cuadrado a sangre con el símbolo dentro de la zona segura,
// así que ni el icono maskable ni el de Apple necesitan relleno extra.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0 },
    apple: { ...minimal2023Preset.apple, padding: 0 },
  },
  images: ['src/web/public/icon.svg'],
})
