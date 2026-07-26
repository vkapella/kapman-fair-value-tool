import { TrendingUp, Calculator, Target, Scale, Sprout, Shield, AlertTriangle, Globe, ListPlus } from "lucide-react";
import { RUBRIC_DEF, CATEGORY_KEYS } from "../lib/rubric.js";

// One icon per rubric category, keyed by the same CATEGORY_KEYS the rubric
// and factor index use — new categories in RUBRIC_DEF fall back to Target
// rather than breaking the tab bar.
const CATEGORY_ICONS = {
  valuation: Scale,
  growthScore: Sprout,
  moat: Shield,
  executionRisk: AlertTriangle,
  economy: Globe,
};

// Category labels carry their point cap ("Moat /20") for the score card
// column header; the maintenance tab just needs the plain name.
const stripMax = (label) => label.replace(/\s*\/\d+$/, "");

export const PRIMARY_TABS = [
  { id: "scorecard", label: "Main Score Card", icon: Target },
  { id: "intrinsic", label: "Intrinsic Value", icon: Calculator },
  { id: "allocation", label: "Allocation Signals", icon: TrendingUp },
  ...CATEGORY_KEYS.map((key, i) => ({
    id: key,
    label: stripMax(RUBRIC_DEF[key].label),
    icon: CATEGORY_ICONS[key] || Target,
    separator: i === 0, // divider before the first category tab
  })),
  { id: "import", label: "Ticker Import", icon: ListPlus, separator: true },
];
