/**
 * Curated Lucide icon registry for bcktrck.
 *
 * Each entry is an array of [tagName, attrs] pairs — the same format Lucide
 * exports from the `lucide` package. Icons are thin-line style (24×24 viewBox,
 * stroke-width 2, round caps/joins).
 *
 * Add more icons by importing them from `lucide` and adding to ICON_REGISTRY.
 */

import {
  User, Users, UserPlus, UserCheck, UserCog, UserRound, Contact,
  Building, Building2, Briefcase, Landmark, Factory, Store,
  Network, GitBranch, GitMerge, Share2, Layers, LayoutDashboard,
  Crown, Award, Medal, Star, Trophy,
  Mail, Phone, MessageCircle, MessageSquare, Bell, BellRing, Link, Headset,
  DollarSign, TrendingUp, TrendingDown, PieChart, BarChart, BarChart2, HandCoins,
  Shield, ShieldCheck, ShieldAlert, ShieldHalf, ShieldBan, Lock, Key, Scale, Gavel, Sword, BrickWallFire, BrickWallShield,
  Code, Code2, Terminal, Cpu, Database, Server, Globe, Wifi, Cloud, Cctv, Microscope,
  Palette, Pen, Brush, Blend, Blocks,
  Settings, Settings2, Wrench, Hammer, Zap, Rocket, Goal, Presentation, ListChecks, SquareDashedKanban, Drill,
  ChartLine, ChartBar, ChartPie, Search, Filter,
  Heart, HeartPulse, Stethoscope, Smile, BriefcaseMedical, Bone, PawPrint, Dog,
  FileText, Folder, Book, BookOpen, BookMarked, BookCheck, LibraryBig, Clipboard, ClipboardCheck, FileSearch, FileSearchCorner,
  Flag, MapPin, MapPinned, Home, Target, Crosshair, Compass, Eye, ScanEye, Lightbulb, Group, Balloon, Flame, Accessibility, Shapes, Wine, Beer, BottleWine, Gem,
  IdCard, IdCardLanyard,
  SquareArrowOutUpRight, CircleFadingPlus,
  CheckCircle, XCircle, AlertCircle, Info, HelpCircle,
  Clock, Calendar, Timer,
  Car, Plane, Package, Siren, Banana, Construction, TrafficCone,
  BadgeCheck,
  type IconNode as LucideIconNode
} from 'lucide'
import { intoMap, intoSet } from '@tsfpp/prelude'


// Use Lucide's IconNode type directly for compatibility
/**
 * Lucide icon node tuple format re-exported for local registry typing.
 */
export type IconNode = LucideIconNode

/**
 * Supported icon anchor positions within node bounds.
 */
export type IconPos =
  | 'upper-left'
  | 'upper-right'
  | 'bottom-left'
  | 'bottom-right'

const setFromValues = <T>(values: ReadonlyArray<T>): ReadonlySet<T> => intoSet(values)

const mapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): ReadonlyMap<K, V> => intoMap(entries)

export const ICON_POSITIONS: ReadonlySet<string> = setFromValues<IconPos>([
  'upper-left', 'upper-right',
  'bottom-left', 'bottom-right',
])

export const DEFAULT_ICON_POS: IconPos = 'upper-left'
export const DEFAULT_ICON_SIZE = 14

const ICON_REGISTRY = mapFromEntries<string, IconNode>([
  // People / HR
  ['user', User],
  ['users', Users],
  ['user-plus', UserPlus],
  ['user-check', UserCheck],
  ['user-cog', UserCog],
  ['user-round', UserRound],
  ['contact', Contact],
  // Buildings
  ['building', Building],
  ['building2', Building2],
  ['briefcase', Briefcase],
  ['landmark', Landmark],
  ['factory', Factory],
  ['store', Store],
  // Hierarchy
  ['network', Network],
  ['git-branch', GitBranch],
  ['git-merge', GitMerge],
  ['share2', Share2],
  ['layers', Layers],
  ['layout-dashboard', LayoutDashboard],
  // Leadership
  ['crown', Crown],
  ['award', Award],
  ['medal', Medal],
  ['star', Star],
  ['trophy', Trophy],
  // Communication
  ['mail', Mail],
  ['phone', Phone],
  ['message-circle', MessageCircle],
  ['message-square', MessageSquare],
  ['bell', Bell],
  ['bell-ring', BellRing],
  ['link', Link],
  ['headset', Headset],
  // Finance
  ['dollar-sign', DollarSign],
  ['trending-up', TrendingUp],
  ['trending-down', TrendingDown],
  ['pie-chart', PieChart],
  ['bar-chart', BarChart],
  ['bar-chart2', BarChart2],
  ['hand-coins', HandCoins],
  // Security
  ['shield', Shield],
  ['shield-check', ShieldCheck],
  ['shield-alert', ShieldAlert],
  ['shield-half', ShieldHalf],
  ['shield-ban', ShieldBan],
  ['lock', Lock],
  ['key', Key],
  ['scale', Scale],
  ['gavel', Gavel],
  ['sword', Sword],
  ['brick-wall-fire', BrickWallFire],
  ['brick-wall-shield', BrickWallShield],
  // Tech
  ['code', Code],
  ['code2', Code2],
  ['terminal', Terminal],
  ['cpu', Cpu],
  ['database', Database],
  ['server', Server],
  ['globe', Globe],
  ['wifi', Wifi],
  ['cloud', Cloud],
  ['cctv', Cctv],
  ['microscope', Microscope],
  // Design
  ['palette', Palette],
  ['pen', Pen],
  ['brush', Brush],
  ['blend', Blend],
  ['blocks', Blocks],
  // Operations
  ['settings', Settings],
  ['settings2', Settings2],
  ['wrench', Wrench],
  ['hammer', Hammer],
  ['drill', Drill],
  ['zap', Zap],
  ['rocket', Rocket],
  ['goal', Goal],
  ['presentation', Presentation],
  ['list-checks', ListChecks],
  ['square-dashed-kanban', SquareDashedKanban],
  // Analytics
  ['chart-line', ChartLine],
  ['chart-bar', ChartBar],
  ['chart-pie', ChartPie],
  ['search', Search],
  ['filter', Filter],
  // Health
  ['heart', Heart],
  ['heart-pulse', HeartPulse],
  ['stethoscope', Stethoscope],
  ['smile', Smile],
  ['briefcase-medical', BriefcaseMedical],
  ['bone', Bone],
  ['paw-print', PawPrint],
  ['dog', Dog],
  // Docs
  ['file-text', FileText],
  ['folder', Folder],
  ['book', Book],
  ['book-open', BookOpen],
  ['book-marked', BookMarked],
  ['book-check', BookCheck],
  ['library-big', LibraryBig],
  ['clipboard', Clipboard],
  ['clipboard-check', ClipboardCheck],
  ['file-search', FileSearch],
  ['file-search-corner', FileSearchCorner],
  // Misc
  ['flag', Flag],
  ['map-pin', MapPin],
  ['map-pinned', MapPinned],
  ['home', Home],
  ['target', Target],
  ['crosshair', Crosshair],
  ['compass', Compass],
  ['eye', Eye],
  ['scan-eye', ScanEye],
  ['lightbulb', Lightbulb],
  ['group', Group],
  ['balloon', Balloon],
  ['fire', Flame],
  ['accessibility', Accessibility],
  ['shapes', Shapes],
  ['wine', Wine],
  ['beer', Beer],
  ['bottle-wine', BottleWine],
  ['gem', Gem],
  // Identity / Credential
  ['id-card', IdCard],
  ['id-card-lanyard', IdCardLanyard],
  // Arrows / Indicators
  ['square-arrow-out-up-right', SquareArrowOutUpRight],
  ['circle-fading-plus', CircleFadingPlus],
  // Backward-compatible alias for common misspelling
  ['cirkle-fading-plus', CircleFadingPlus],
  // Status
  ['check-circle', CheckCircle],
  ['x-circle', XCircle],
  ['alert-circle', AlertCircle],
  ['info', Info],
  ['help-circle', HelpCircle],
  // Time
  ['clock', Clock],
  ['calendar', Calendar],
  ['timer', Timer],
  // Transport
  ['car', Car],
  ['plane', Plane],
  ['package', Package],
  ['siren', Siren],
  ['banana', Banana],
  ['construction', Construction],
  ['traffic-cone', TrafficCone],
  // Validation / Credential
  ['badge-check', BadgeCheck],
])

export const getIcon = (name: string): IconNode | undefined => ICON_REGISTRY.get(name)

export const isKnownIcon = (name: string): boolean => ICON_REGISTRY.has(name)

export const listIconNames = (): readonly string[] => [...ICON_REGISTRY.keys()]
