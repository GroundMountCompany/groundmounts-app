import type { Config } from "tailwindcss";
import type { PluginAPI } from "tailwindcss/types/config";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      textShadow: {
        lg: '0 2px 4px rgba(0,0,0,0.5)',
        sm: '0 1px 2px rgba(0,0,0,0.5)',
        xl: '0 4px 8px rgba(0,0,0,0.5)'
      },
      container: {
        center: true,
        padding: '1rem'
      },
      colors: {
        'custom-black': 'var(--foreground-rgb)',
        'custom-primary': 'var(--primary-color)',
        'custom-primary-light': 'var(--primary-light)',
        'custom-secondary': 'var(--secondary-color)',
        'custom-secondary-dark': 'var(--secondary-dark)',
        'primary-100': '#E2F7FF',
        'primary-200': '#426CAF',
        'primary-300': '#214A8B',
        'primary-400': '#002868',
        'primary-500': '#00245F',
        'primary-600': '#002155',
        'primary-700': '#001D4C',
        'primary-800': '#001942',
        'blue-100': '#E2F7FF',
        'blue-200': '#D5F1FC',
        'blue-300': '#C8EBF9',
        'blue-400': '#BBE5F6',
        'blue-500': '#AEE0F4',
        'blue-600': '#A1DAF1',
        'blue-700': '#94D4EE',
        'blue-800': '#87CEEB',
        'neutral-100': '#FFFFFF',
        'neutral-200': '#E9EAEB',
        'neutral-300': '#D3D4D6',
        'neutral-400': '#707476',
        'neutral-500': '#212833',
        'neutral-600': '#1A2029',
        'neutral-700': '#11141A',
        'neutral-800': '#000501',
      },
      maxWidth: {
        '7xl': '1440px'
      },
      fontSize: {
        '4xl': '32px'
      },
      screens: {
        'max-2xl': '1441px'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [
    function({ matchUtilities, theme }: PluginAPI) {
      matchUtilities(
        {
          'text-shadow': (value: string) => ({
            textShadow: value,
          }),
        },
        { values: theme('textShadow') }
      )
    },
      require("tailwindcss-animate")
],
};

export default config;
