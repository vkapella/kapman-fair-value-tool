import { TrendingUp, Calculator, Target, Scale, Sprout, Shield, AlertTriangle, Globe } from "lucide-react";
import { RUBRIC_DEF, CATEGORY_KEYS } from "../lib/rubric.js";

// Exported so a test can assert every CATEGORY_KEYS entry has an explicit
// icon (UI-7): the `|| Target` fallback below is a silent one, so a category
// added to the rubric would otherwise ship wearing the score card's icon.
export const CATEGORY_ICONS = {
  valuation: Scale,
  growthScore: Sprout,
  moat: Shield,
  executionRisk: AlertTriangle,
  economy: Globe,
};

const stripMax = (label) => label.replace(/\s*\/\d+$/, "");

export const MAIN_TABS = [
  { id: "scorecard", label: "Main Score Card", icon: Target },
  { id: "intrinsic", label: "Intrinsic Value", icon: Calculator },
  { id: "allocation", label: "Allocation Signals", icon: TrendingUp },
  ...CATEGORY_KEYS.map((key) => ({
    id: key,
    label: stripMax(RUBRIC_DEF[key].label),
    icon: CATEGORY_ICONS[key] || Target,
  })),
];
