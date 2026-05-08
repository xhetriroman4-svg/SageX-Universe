'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Menu,
  X,
  ShoppingCart,
  Brain,
  Gamepad2,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Star,
  Zap,
  Globe,
  Shield,
  Cpu,
  Layers,
} from 'lucide-react'

/* ───────────────────────── shared animation helpers ───────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

/* ───────────────────────── SVG Decorations ───────────────────────── */

function HeroGlowOrb({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 600 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="orb-grad-1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.25" />
            <stop offset="60%" stopColor="#7b2ff7" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="300" cy="300" r="300" fill="url(#orb-grad-1)" />
      </svg>
    </div>
  )
}

function FloatingHexagons() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Hex 1 */}
      <motion.div
        className="absolute top-[15%] left-[8%] opacity-20"
        animate={{ y: [0, -18, 0], rotate: [0, 8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="80" height="92" viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 0L80 23V69L40 92L0 69V23L40 0Z" stroke="#00f2ff" strokeWidth="1" fill="none" />
        </svg>
      </motion.div>

      {/* Hex 2 */}
      <motion.div
        className="absolute top-[55%] right-[6%] opacity-15"
        animate={{ y: [0, 22, 0], rotate: [0, -12, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="60" height="70" viewBox="0 0 60 70" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M30 0L60 17.5V52.5L30 70L0 52.5V17.5L30 0Z" stroke="#7b2ff7" strokeWidth="1" fill="none" />
        </svg>
      </motion.div>

      {/* Dot grid */}
      <motion.div
        className="absolute bottom-[10%] left-[20%] opacity-10"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="120" height="60" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 24 }).map((_, i) => (
            <circle
              key={i}
              cx={10 + (i % 8) * 15}
              cy={10 + Math.floor(i / 8) * 20}
              r="2"
              fill="#00f2ff"
            />
          ))}
        </svg>
      </motion.div>

      {/* Circle ring */}
      <motion.div
        className="absolute top-[30%] right-[22%] opacity-15"
        animate={{ y: [0, -14, 0], rotate: [0, 20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" stroke="#00f2ff" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="35" stroke="#7b2ff7" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="25" stroke="#00f2ff" strokeWidth="0.5" strokeDasharray="4 4" />
        </svg>
      </motion.div>

      {/* Abstract lines */}
      <motion.div
        className="absolute bottom-[25%] right-[30%] opacity-10"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="160" height="80" viewBox="0 0 160 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 40 L40 20 L80 50 L120 10 L160 40" stroke="#7b2ff7" strokeWidth="1" />
          <path d="M0 60 L40 45 L80 65 L120 30 L160 55" stroke="#00f2ff" strokeWidth="0.5" />
        </svg>
      </motion.div>
    </div>
  )
}

/* ─── Feature Card SVG Illustrations ─── */

function ShoppingSVG() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shop-grad" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7b2ff7" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect x="8" y="24" width="48" height="32" rx="4" stroke="url(#shop-grad)" strokeWidth="2" fill="none" />
      <path d="M20 24V18a12 12 0 0124 0v6" stroke="url(#shop-grad)" strokeWidth="2" fill="none" />
      <circle cx="24" cy="40" r="3" fill="#00f2ff" />
      <circle cx="40" cy="40" r="3" fill="#7b2ff7" />
      <line x1="8" y1="32" x2="56" y2="32" stroke="url(#shop-grad)" strokeWidth="1" opacity="0.4" />
    </svg>
  )
}

function NeuralSVG() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="neural-grad" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7b2ff7" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Nodes */}
      <circle cx="32" cy="12" r="5" stroke="url(#neural-grad)" strokeWidth="2" fill="none" />
      <circle cx="14" cy="32" r="5" stroke="url(#neural-grad)" strokeWidth="2" fill="none" />
      <circle cx="50" cy="32" r="5" stroke="url(#neural-grad)" strokeWidth="2" fill="none" />
      <circle cx="22" cy="52" r="5" stroke="url(#neural-grad)" strokeWidth="2" fill="none" />
      <circle cx="42" cy="52" r="5" stroke="url(#neural-grad)" strokeWidth="2" fill="none" />
      {/* Connections */}
      <line x1="32" y1="17" x2="14" y2="27" stroke="#00f2ff" strokeWidth="1" opacity="0.5" />
      <line x1="32" y1="17" x2="50" y2="27" stroke="#00f2ff" strokeWidth="1" opacity="0.5" />
      <line x1="14" y1="37" x2="22" y2="47" stroke="#7b2ff7" strokeWidth="1" opacity="0.5" />
      <line x1="50" y1="37" x2="42" y2="47" stroke="#7b2ff7" strokeWidth="1" opacity="0.5" />
      <line x1="22" y1="52" x2="42" y2="52" stroke="#00f2ff" strokeWidth="1" opacity="0.3" />
    </svg>
  )
}

function EntertainmentSVG() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ent-grad" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7b2ff7" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Play button / diamond shape */}
      <polygon points="32,6 58,32 32,58 6,32" stroke="url(#ent-grad)" strokeWidth="2" fill="none" />
      <polygon points="28,20 46,32 28,44" fill="url(#ent-grad)" opacity="0.5" />
      <circle cx="32" cy="32" r="28" stroke="url(#ent-grad)" strokeWidth="1" fill="none" opacity="0.3" strokeDasharray="4 3" />
    </svg>
  )
}

/* ─── Dashboard Showcase SVG ─── */

function DashboardSVG() {
  return (
    <svg viewBox="0 0 520 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      <defs>
        <linearGradient id="dash-grad-1" x1="0" y1="0" x2="520" y2="320">
          <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7b2ff7" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="dash-grad-2" x1="0" y1="0" x2="200" y2="200">
          <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7b2ff7" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Main frame */}
      <rect x="10" y="10" width="500" height="300" rx="16" stroke="#ffffff20" strokeWidth="1" fill="#ffffff05" />

      {/* Top bar */}
      <rect x="10" y="10" width="500" height="40" rx="16" fill="#ffffff08" />
      <rect x="10" y="34" width="500" height="16" fill="#ffffff08" />
      <circle cx="30" cy="30" r="5" fill="#ff5f57" opacity="0.6" />
      <circle cx="46" cy="30" r="5" fill="#ffbd2e" opacity="0.6" />
      <circle cx="62" cy="30" r="5" fill="#28c840" opacity="0.6" />

      {/* Sidebar */}
      <rect x="10" y="50" width="90" height="260" fill="#ffffff05" />
      {['Dashboard', 'Analytics', 'Tools', 'Store', 'Settings'].map((_, i) => (
        <rect key={i} x="22" y={66 + i * 32} width="66" height="8" rx="4" fill={i === 0 ? '#00f2ff' : '#ffffff15'} opacity={i === 0 ? 0.6 : 0.4} />
      ))}

      {/* Main content area */}
      {/* Stat cards */}
      <rect x="115" y="60" width="120" height="60" rx="8" stroke="#ffffff15" strokeWidth="1" fill="#ffffff05" />
      <rect x="124" y="72" width="50" height="6" rx="3" fill="#ffffff25" />
      <rect x="124" y="88" width="30" height="12" rx="4" fill="#00f2ff" opacity="0.4" />

      <rect x="245" y="60" width="120" height="60" rx="8" stroke="#ffffff15" strokeWidth="1" fill="#ffffff05" />
      <rect x="254" y="72" width="60" height="6" rx="3" fill="#ffffff25" />
      <rect x="254" y="88" width="36" height="12" rx="4" fill="#7b2ff7" opacity="0.4" />

      <rect x="375" y="60" width="120" height="60" rx="8" stroke="#ffffff15" strokeWidth="1" fill="#ffffff05" />
      <rect x="384" y="72" width="45" height="6" rx="3" fill="#ffffff25" />
      <rect x="384" y="88" width="28" height="12" rx="4" fill="#00f2ff" opacity="0.4" />

      {/* Chart area */}
      <rect x="115" y="132" width="250" height="170" rx="8" stroke="#ffffff15" strokeWidth="1" fill="#ffffff05" />
      <rect x="128" y="144" width="70" height="6" rx="3" fill="#ffffff25" />

      {/* Chart bars */}
      {[0.6, 0.8, 0.45, 0.9, 0.7, 0.55, 0.85].map((h, i) => (
        <rect key={i} x={140 + i * 30} y={280 - h * 120} width="16" height={h * 120} rx="4" fill="url(#dash-grad-2)" opacity="0.5" />
      ))}

      {/* Right panel */}
      <rect x="375" y="132" width="120" height="170" rx="8" stroke="#ffffff15" strokeWidth="1" fill="#ffffff05" />
      <rect x="388" y="144" width="50" height="6" rx="3" fill="#ffffff25" />

      {/* List items */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx="396" cy={172 + i * 30} r="8" fill="#ffffff10" />
          <rect x="412" y={168 + i * 30} width="65" height="5" rx="2.5" fill="#ffffff18" />
          <rect x="412" y={178 + i * 30} width="40" height="4" rx="2" fill="#ffffff10" />
        </g>
      ))}

      {/* Glow effect */}
      <circle cx="260" cy="200" r="140" fill="url(#orb-grad-1)" opacity="0.15" />
    </svg>
  )
}

/* ──────────────────────────── Navbar ──────────────────────────── */

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = ['Shop', 'AI Tools', 'Entertainment', 'Pricing', 'Blog']

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-black/80 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group">
          <Sparkles className="h-6 w-6 text-cyan-400 group-hover:drop-shadow-[0_0_8px_rgba(0,242,255,0.6)] transition-all" />
          <span className="text-xl font-bold text-white tracking-tight">
            Sage<span className="text-cyan-400 drop-shadow-[0_0_12px_rgba(0,242,255,0.5)]">X</span>
          </span>
        </a>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <li key={l}>
              <a
                href={`#${l.toLowerCase().replace(/\s/g, '-')}`}
                className="text-sm text-white/60 hover:text-white transition-colors duration-200"
              >
                {l}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="hidden md:block">
          <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:shadow-[0_0_24px_rgba(255,255,255,0.25)] transition-all duration-300 hover:scale-105 active:scale-95">
            Get Started
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/80 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-black/90 backdrop-blur-xl border-t border-white/5 px-6 pb-6"
        >
          <ul className="flex flex-col gap-4 pt-4">
            {links.map((l) => (
              <li key={l}>
                <a
                  href={`#${l.toLowerCase().replace(/\s/g, '-')}`}
                  className="text-sm text-white/70 hover:text-white transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {l}
                </a>
              </li>
            ))}
          </ul>
          <button className="mt-4 w-full rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">
            Get Started
          </button>
        </motion.div>
      )}
    </motion.header>
  )
}

/* ──────────────────────────── Hero ──────────────────────────── */

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background glows */}
      <HeroGlowOrb className="absolute -top-40 -left-40 w-[700px] h-[700px] pointer-events-none" />
      <HeroGlowOrb className="absolute -bottom-60 -right-40 w-[500px] h-[500px] pointer-events-none rotate-180" />

      <FloatingHexagons />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-6"
        >
          {/* Pill badge */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-4 py-1.5 text-xs font-medium text-cyan-400">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Universe
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.1] tracking-tight text-white"
          >
            The Future of{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              Digital Experience
            </span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="max-w-2xl text-base sm:text-lg text-white/50 leading-relaxed"
          >
            Discover AI-powered shopping, neural tools, and immersive entertainment — all in one unified platform that redefines how you interact with the digital world.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="flex flex-wrap items-center justify-center gap-4 mt-2">
            <button className="group flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-black hover:shadow-[0_0_32px_rgba(255,255,255,0.2)] transition-all duration-300 hover:scale-105 active:scale-95">
              Explore Universe
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button className="flex items-center gap-2 rounded-full border border-white/20 px-7 py-3 text-sm font-semibold text-white/80 hover:border-white/40 hover:text-white transition-all duration-300 hover:scale-105 active:scale-95 backdrop-blur-sm">
              Learn More
              <ChevronRight className="h-4 w-4" />
            </button>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-5 h-8 rounded-full border border-white/20 flex justify-center pt-1.5">
          <div className="w-1 h-2 rounded-full bg-white/40" />
        </div>
      </motion.div>
    </section>
  )
}

/* ──────────────────────────── Features ──────────────────────────── */

const features = [
  {
    Icon: ShoppingCart,
    SVG: ShoppingSVG,
    title: 'AI-Powered Shopping',
    description:
      'Smart product recommendations that learn your preferences. Find exactly what you need before you even search for it.',
    accent: 'cyan',
  },
  {
    Icon: Brain,
    SVG: NeuralSVG,
    title: 'Neural Tools Suite',
    description:
      'Advanced AI tools for every task — from content generation to data analysis. Supercharge your workflow effortlessly.',
    accent: 'purple',
  },
  {
    Icon: Gamepad2,
    SVG: EntertainmentSVG,
    title: 'Entertainment Hub',
    description:
      'Immersive experiences, interactive games, and creative playgrounds powered by cutting-edge AI technology.',
    accent: 'cyan',
  },
]

function FeaturesSection() {
  return (
    <section id="ai-tools" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.span
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60 mb-6"
          >
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
            Core Features
          </motion.span>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white"
          >
            Everything You Need,{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              Powered by AI
            </span>
          </motion.h2>
        </motion.div>

        {/* Cards — horizontal scroll on mobile */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={staggerContainer}
          className="flex gap-6 overflow-x-auto sm:overflow-visible pb-4 sm:pb-0 snap-x snap-mandatory sm:grid sm:grid-cols-3"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="min-w-[280px] sm:min-w-0 snap-center group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 transition-all duration-300 hover:border-cyan-400/30 hover:shadow-[0_0_40px_rgba(0,242,255,0.06)] hover:scale-[1.03]"
            >
              {/* SVG illustration */}
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <f.SVG />
              </div>

              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-white/45 leading-relaxed">{f.description}</p>

              <div className="mt-5 flex items-center gap-1 text-xs font-medium text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                Learn more <ArrowRight className="h-3 w-3" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ──────────────────────────── Showcase ──────────────────────────── */

function ShowcaseSection() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [60, -60])

  return (
    <section id="entertainment" ref={ref} className="relative py-24 sm:py-32 overflow-hidden">
      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none">
        <svg viewBox="0 0 600 600" className="w-full h-full">
          <defs>
            <radialGradient id="show-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="300" cy="300" r="300" fill="url(#show-glow)" />
        </svg>
      </div>

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.span
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60 mb-6"
          >
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            Platform Preview
          </motion.span>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white"
          >
            Experience the{' '}
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Universe
            </span>
          </motion.h2>
        </motion.div>

        {/* Dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ y }}
          className="relative group"
        >
          {/* Glow border effect */}
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-cyan-400/20 via-purple-500/20 to-cyan-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />

          <div className="relative rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-3 sm:p-5 transition-transform duration-500 group-hover:[transform:perspective(1200px)_rotateX(2deg)_rotateY(-2deg)_scale(1.01)]">
            <DashboardSVG />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ──────────────────────────── Pricing ──────────────────────────── */

const plans = [
  {
    name: 'Explorer',
    price: 'Free',
    description: 'Perfect for getting started with AI tools.',
    features: ['5 AI tool uses / day', 'Basic recommendations', 'Community access', 'Standard support'],
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/mo',
    description: 'For power users who need unlimited access.',
    features: ['Unlimited AI tools', 'Advanced recommendations', 'Priority support', 'Custom workflows', 'API access'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$49',
    period: '/mo',
    description: 'For teams that demand the very best.',
    features: ['Everything in Pro', 'Team collaboration', 'Dedicated manager', 'Custom integrations', 'SLA guarantee'],
    highlighted: false,
  },
]

function PricingSection() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.span
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60 mb-6"
          >
            <Star className="h-3.5 w-3.5 text-cyan-400" />
            Pricing
          </motion.span>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white"
          >
            Simple,{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              Transparent Pricing
            </span>
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={staggerContainer}
          className="grid gap-6 sm:grid-cols-3 max-w-5xl mx-auto"
        >
          {plans.map((p) => (
            <motion.div
              key={p.name}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className={`relative rounded-2xl border p-6 sm:p-8 transition-all duration-300 hover:scale-[1.03] ${
                p.highlighted
                  ? 'border-cyan-400/40 bg-white/[0.06] shadow-[0_0_60px_rgba(0,242,255,0.08)]'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {p.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400 px-3 py-0.5 text-xs font-semibold text-black">
                  Most Popular
                </span>
              )}

              <h3 className="text-lg font-semibold text-white">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">{p.price}</span>
                {p.period && <span className="text-sm text-white/40">{p.period}</span>}
              </div>
              <p className="mt-2 text-sm text-white/40">{p.description}</p>

              <ul className="mt-6 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                    <Shield className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`mt-8 w-full rounded-full py-2.5 text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95 ${
                  p.highlighted
                    ? 'bg-white text-black hover:shadow-[0_0_24px_rgba(255,255,255,0.2)]'
                    : 'border border-white/20 text-white/80 hover:border-white/40 hover:text-white'
                }`}
              >
                Get Started
              </button>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ──────────────────────────── Stats Bar ──────────────────────────── */

function StatsSection() {
  const stats = [
    { label: 'Active Users', value: '120K+', Icon: Globe },
    { label: 'AI Models', value: '50+', Icon: Cpu },
    { label: 'Products', value: '10K+', Icon: ShoppingCart },
    { label: 'Uptime', value: '99.9%', Icon: Zap },
  ]

  return (
    <section className="py-16 sm:py-20 border-y border-white/5">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        variants={staggerContainer}
        className="mx-auto max-w-5xl px-6 grid grid-cols-2 sm:grid-cols-4 gap-8"
      >
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <s.Icon className="h-5 w-5 text-cyan-400 mx-auto mb-2" />
            <div className="text-2xl sm:text-3xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-white/40 mt-1">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

/* ──────────────────────────── Footer ──────────────────────────── */

function FooterSection() {
  const links = {
    Product: ['Shop', 'AI Tools', 'Entertainment', 'Pricing'],
    Company: ['About', 'Blog', 'Careers', 'Contact'],
    Legal: ['Privacy', 'Terms', 'Security'],
  }

  return (
    <footer className="border-t border-white/5 bg-black">
      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              <span className="text-lg font-bold text-white">
                Sage<span className="text-cyan-400">X</span>
              </span>
            </div>
            <p className="text-sm text-white/35 leading-relaxed max-w-xs">
              The AI-powered universe where shopping, tools, and entertainment converge into one seamless experience.
            </p>
          </div>

          {/* Link groups */}
          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white/70 mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-white/35 hover:text-white transition-colors duration-200">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-white/25">&copy; {new Date().getFullYear()} SageX AI Universe. All rights reserved.</span>

          <div className="flex items-center gap-4">
            {[
              { label: 'Twitter', path: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z' },
              { label: 'GitHub', path: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22' },
              { label: 'LinkedIn', path: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z' },
            ].map((social) => (
              <a
                key={social.label}
                href="#"
                aria-label={social.label}
                className="text-white/25 hover:text-cyan-400 transition-colors duration-200"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ──────────────────────────── Page ──────────────────────────── */

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <ShowcaseSection />
      <PricingSection />
      <FooterSection />
    </div>
  )
}
