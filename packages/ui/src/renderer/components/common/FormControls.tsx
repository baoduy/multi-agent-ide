import React from "react";

import { colors } from "../../utils/colors";

type FormLabelProps = {
  htmlFor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/** Uppercase form field label consistent across all dialogs. */
export function FormLabel({ htmlFor, children, style }: FormLabelProps): React.ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 600,
        color: colors.textSecondary,
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        ...style,
      }}
    >
      {children}
    </label>
  );
}

type FormInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  error?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
};

/** Styled text input with error border state and focus highlight. */
export function FormInput({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
  error = false,
  inputRef,
}: FormInputProps): React.ReactElement {
  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "8px 12px",
        fontSize: 13,
        border: `1px solid ${error ? colors.error : colors.border}`,
        borderRadius: 6,
        outline: "none",
        background: colors.bgSurface,
        color: colors.text,
        fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
        boxSizing: "border-box",
        transition: "border-color 0.15s",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = error ? colors.error : colors.primary;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? colors.error : colors.border;
      }}
    />
  );
}

type SectionHeaderProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/** Uppercase section header used for grouping content (e.g. "Changed files", "Local merge"). */
export function SectionHeader({ children, style }: SectionHeaderProps): React.ReactElement {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: colors.textTertiary,
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type FormErrorProps = {
  message: string | null | undefined;
};

/** Inline error message below a form field. */
export function FormError({ message }: FormErrorProps): React.ReactElement | null {
  if (!message) return null;
  return (
    <p style={{ fontSize: 11, color: colors.error, margin: "6px 0 0", fontWeight: 500 }}>
      {message}
    </p>
  );
}
