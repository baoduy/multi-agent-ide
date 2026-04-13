import React, { useMemo } from "react";
import { Shield, Zap, ShieldOff } from "lucide-react";

import { SelectDropdown, type SelectOption } from "./SelectDropdown";
import { colors } from "../../utils/colors";

/* ── Permission options ── */

const PERMISSION_OPTIONS: readonly SelectOption[] = [
  {
    value: "default",
    label: "Default",
    description: "Asks before file edits",
    icon: <Shield size={14} color={colors.textSecondary} strokeWidth={1.8} />,
  },
  {
    value: "auto",
    label: "Auto",
    description: "Auto-accepts safe actions",
    icon: <Zap size={14} color={colors.textSecondary} strokeWidth={1.8} />,
  },
  {
    value: "bypassPermissions",
    label: "Bypass",
    description: "Skips all permission checks",
    icon: <ShieldOff size={14} color={colors.error} strokeWidth={1.8} />,
  },
];

/* ── Component ── */

type PermissionDropdownProps = {
  value: string;
  onChange: (value: string) => void;
};

function PermissionDropdownComponent({ value, onChange }: PermissionDropdownProps): React.ReactElement {
  return (
    <SelectDropdown
      options={PERMISSION_OPTIONS}
      value={value}
      onChange={onChange}
      placeholder="Permission"
      align="end"
      minWidth={220}
    />
  );
}

export const PermissionDropdown = React.memo(PermissionDropdownComponent);
