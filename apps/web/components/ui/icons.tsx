// Every icon the dashboard uses, re-exported from one module.
//
// lucide-react is the first icon dependency in this app. The seven hand-drawn
// SVGs that already exist are chess art (see components/chess/piecePaths.ts for
// why those are hand-drawn — font glyph coverage), which is a different problem
// from UI chrome: this screen needs ~25 icons at a consistent stroke weight and
// optical size, which is exactly what hand-rolling gets wrong one icon at a
// time. Lucide tree-shakes per import and renders in server components.
//
// Funnelled through here so size and stroke are set once, and so swapping the
// set later is one file rather than forty import sites.
export {
  Activity,
  BookOpen,
  Check,
  Layers,
  Link2,
  List,
  SlidersHorizontal,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Menu,
  Package,
  Percent,
  Play,
  Puzzle,
  Search,
  Download,
  Folder,
  FolderOpen,
  FileText as FileIcon,
  MoreVertical,
  Upload,
  Pencil,
  Trash2,
  FolderInput,
  Eye,
  EyeOff,
  ChevronRight,
  Plus,
  Radio,
  School,
  Settings,
  Swords,
  Trophy,
  User,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";

export type { LucideIcon } from "lucide-react";

/** House defaults: 18px, 1.75 stroke — matches the weight of the text beside it. */
export const ICON_PROPS = { size: 18, strokeWidth: 1.75 } as const;

/** Slightly heavier, for the coloured circle on a stat card. */
export const STAT_ICON_PROPS = { size: 18, strokeWidth: 2 } as const;
