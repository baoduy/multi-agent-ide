import React from "react";
import { colors } from "../../utils/colors";

type ScanProgressProps = {
  scanned: number;
  total: number;
  currentDir: string;
};

export function ScanProgress({ scanned, total, currentDir }: ScanProgressProps): React.ReactElement {
  const denominator = total > 0 ? total : Math.max(scanned, 1);
  const percent = Math.min(100, Math.round((scanned / denominator) * 100));

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>
        Scanning: {currentDir}
      </div>
      <div style={{ width: "100%", height: 6, borderRadius: 999, background: colors.border }}>
        <div
          style={{
            width: `${percent}%`,
            height: 6,
            borderRadius: 999,
            background: colors.info,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: colors.textTertiary }}>
        {scanned} scanned{total > 0 ? ` / ${total}` : ""}
      </div>
    </div>
  );
}
