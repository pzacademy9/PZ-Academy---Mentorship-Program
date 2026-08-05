import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
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
  			pz: {
  				// Primary greens
  				deep:       '#0F3D22', // hero/dark backgrounds
  				forest:     '#194B32', // primary brand green
  				mid:        '#196432', // headers, section accents
  				bright:     '#7ED957', // CTAs, highlights
  				pale:       '#C8F0A0', // tints, light accents
  				offwhite:   '#F7FAF5', // light page background

  				// Legacy aliases (keep dashboard components working)
  				pine:       '#0F3D22', // → deep
  				sage:       '#196432', // → mid
  				lime:       '#7ED957', // → bright
  				mint:       '#C8F0A0', // → pale
  				frost:      '#F7FAF5', // → offwhite

  				// Academy Gold accent
  				gold:       '#C9960A',
  				'gold-light': '#E8B84B',

  				// Maroon (accent only — use sparingly)
  				maroon:     '#3D0A0A',

  				// UI
  				ink:        '#1A2E1F', // body text
  				muted:      '#4D6B54', // muted text
  				border:     '#D4EACC', // borders
  				success:    '#10B981',
  				warning:    '#F59E0B',
  				danger:     '#EF4444',

  				// PharmaZyme Academy design-system tokens (from Stitch, verbatim names).
  				// Namespaced under pz-* to avoid clobbering shadcn's primary/secondary/background/etc.
  				// Ports Stitch class names 1:1 by just adding a `pz-` prefix, e.g. bg-primary-container -> bg-pz-primary-container.
  				primary:                     '#246d00',
  				'on-primary':                '#ffffff',
  				'primary-container':         '#7ed957',
  				'on-primary-container':      '#1d5d00',
  				'primary-fixed':             '#9cf973',
  				'primary-fixed-dim':         '#81dc5a',
  				'on-primary-fixed':          '#062100',
  				'on-primary-fixed-variant':  '#195200',
  				secondary:                   '#7a5900',
  				'on-secondary':              '#ffffff',
  				'secondary-container':       '#ffc644',
  				'on-secondary-container':    '#715300',
  				'secondary-fixed':           '#ffdea1',
  				'secondary-fixed-dim':       '#f6be3b',
  				'on-secondary-fixed':        '#261900',
  				'on-secondary-fixed-variant':'#5c4300',
  				tertiary:                    '#3b6849',
  				'on-tertiary':               '#ffffff',
  				'tertiary-container':        '#9fcfa9',
  				'on-tertiary-container':     '#2d593c',
  				'tertiary-fixed':            '#bdeec7',
  				'tertiary-fixed-dim':        '#a2d2ac',
  				'on-tertiary-fixed':         '#00210e',
  				'on-tertiary-fixed-variant': '#234f33',
  				'academy-background':        '#f9f9f9',
  				'on-background':             '#1a1c1c',
  				surface:                     '#f9f9f9',
  				'on-surface':                '#1a1c1c',
  				'surface-variant':           '#e2e2e2',
  				'on-surface-variant':        '#404a3a',
  				'surface-dim':               '#dadada',
  				'surface-bright':            '#f9f9f9',
  				'surface-tint':              '#246d00',
  				'surface-container-lowest':  '#ffffff',
  				'surface-container-low':     '#f3f3f4',
  				'surface-container':         '#eeeeee',
  				'surface-container-high':    '#e8e8e8',
  				'surface-container-highest': '#e2e2e2',
  				outline:                     '#707a68',
  				'outline-variant':           '#bfcab5',
  				'inverse-surface':           '#2f3131',
  				'inverse-on-surface':        '#f0f1f1',
  				'inverse-primary':           '#81dc5a',
  				'academy-error':             '#ba1a1a',
  				'on-error':                  '#ffffff',
  				'error-container':           '#ffdad6',
  				'on-error-container':        '#93000a',
  			},
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
  plugins: [require("tailwindcss-animate")],
};
export default config;
