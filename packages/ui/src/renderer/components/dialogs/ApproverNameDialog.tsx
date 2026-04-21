import React, { useCallback, useEffect, useRef, useState } from "react";
import { UserCircle } from "lucide-react";

import { colors } from "../../utils/colors";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError } from "../common/FormControls";

type ApproverNameDialogProps = {
  /** Prefilled value (e.g. an existing fallback the user may want to edit). */
  initialValue?: string;
  /** Called with the trimmed name when the user saves. */
  onSubmit: (name: string) => void;
  /** Called when the user cancels or closes the dialog. */
  onCancel: () => void;
};

/**
 * Prompts the user for an approver name when no git `user.name` / `user.email`
 * is configured. The caller persists the returned name to the app config as a
 * fallback and then continues the approval flow.
 */
export function ApproverNameDialog({
  initialValue = "",
  onSubmit,
  onCancel,
}: ApproverNameDialogProps): React.ReactElement {
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;

  const handleSubmit = useCallback(() => {
    if (isEmpty) {
      setError("Name cannot be empty.");
      return;
    }
    onSubmit(trimmed);
  }, [isEmpty, onSubmit, trimmed]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <BaseDialog
      title="Enter approver name"
      icon={<UserCircle size={16} color={colors.primary} strokeWidth={2} />}
      width={420}
      onClose={onCancel}
      footer={
        <>
          <CancelButton onClick={onCancel} />
          <PrimaryButton onClick={handleSubmit} disabled={isEmpty} color={colors.success}>
            Save & Approve
          </PrimaryButton>
        </>
      }
    >
      <p style={{ 
        //fontSize: 11, 
        color: colors.textMuted, margin: "0 0 8px", lineHeight: 1.5 }}>
        No git <code>user.name</code> or <code>user.email</code> was found for this repo.
        Enter a name to stamp on the approval — it will be saved as a fallback and
        reused for future approvals in repos without a git identity.
      </p>

      <FormLabel htmlFor="approver-name">Approver name</FormLabel>

      <FormInput
        id="approver-name"
        inputRef={inputRef}
        value={name}
        onChange={(v) => { setName(v); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder="e.g. Jane Doe"
        error={!!error}
      />

      <FormError message={error} />
    </BaseDialog>
  );
}
