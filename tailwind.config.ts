import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { buildPzCss, pzTailwindColors } from "./src/lib/theme/pz-tokens";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		keyframes: {
  			shimmer: { "100%": { transform: "translateX(100%)" } },
  		},
  		animation: {
  			shimmer: "shimmer 1.6s infinite",
  		},
  		fontFamily: {
  			// Brand fonts (Montserrat + Poppins + Fredoka One)
  			montserrat: ['var(--font-montserrat)', 'sans-serif'],
  			poppins:    ['var(--font-poppins)', 'sans-serif'],
  			fredoka:    ['var(--font-fredoka)', 'sans-serif'],
  			handlee:    ['var(--font-handlee)', 'cursive'],
  			// PharmaZyme Academy semantic aliases (match Stitch export class names 1:1)
  			headline:   ['var(--font-montserrat)', 'sans-serif'],
  			display:    ['var(--font-montserrat)', 'sans-serif'],
  			body:       ['var(--font-fredoka)', 'sans-serif'],
  			label:      ['var(--font-handlee)', 'cursive'],
  			// Mentorship section only
  			allura:     ['var(--font-allura)', 'cursive'],
  		},
  		boxShadow: {
  			card:    '0 4px 24px rgba(25,75,50,.10)',
  			'card-lg': '0 16px 48px rgba(25,75,50,.18)',
  			gold:    '0 4px 20px rgba(201,150,10,.25)',
  			// Mentorship section only
  			'gold-sm': '0 0 12px rgba(201,168,76,0.25)',
  			'gold-md': '0 0 20px 4px rgba(201,168,76,0.35)',
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic':  'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
  		},
  		borderRadius: {
  			xl: '16px',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  		},
  		colors: {
  			// Mentorship section only — do not use elsewhere, use colors.pz instead
  			brand: {
  				green:       '#1A4D2E',
  				'green-mid': '#2E7D52',
  				gold:        '#C9A84C',
  				'gold-light':'#E8C97A',
  				black:       '#0D0D0D',
  				'near-black':'#0D0D0D',
  				'off-white': '#F8F6F1',
  				'gray-text': '#6B7280',
  				'card-border':'#E5E1D8',
  			},
  			pz: pzTailwindColors(),
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))',
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))',
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))',
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))',
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))',
  			},
  			destructive: 'hsl(var(--destructive))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))',
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))',
  			},
  		},
  	},
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(({ addBase }) => {
      const { root, dark } = buildPzCss();
      addBase({ ":root": root, ".dark": dark });
    }),
  ],
};
export default config;
