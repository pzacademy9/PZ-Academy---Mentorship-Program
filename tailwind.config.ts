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
  		},
  		boxShadow: {
  			card:    '0 4px 24px rgba(25,75,50,.10)',
  			'card-lg': '0 16px 48px rgba(25,75,50,.18)',
  			gold:    '0 4px 20px rgba(201,150,10,.25)',
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
