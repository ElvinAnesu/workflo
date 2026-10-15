"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction,
  updateUserAction,
} from "@/app/(app)/users/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import {
  CheckboxField,
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import { RecordSelect } from "@/components/hr/record-select";
import type { RoleSelectOption, UserListRow } from "@/components/users/user.types";

type UserFormDialogProps = {
  user?: UserListRow | null;
  roles: RoleSelectOption[];
  onClose: () => void;
};

const MIN_PASSWORD_LENGTH = 8;

export function UserFormDialog({ user, roles, onClose }: UserFormDialogProps) {
  const isUpdate = Boolean(user);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [roleId, setRoleId] = useState(
    user?.roleId ? String(user.roleId) : "",
  );
  const [isSuperUser, setIsSuperUser] = useState(user?.isSuperUser ?? false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const roleOptions = useMemo(() => {
    const options = roles.map((role) => ({
      id: String(role.id),
      label: role.name,
    }));
    if (
      user?.roleId &&
      !options.some((option) => option.id === String(user.roleId))
    ) {
      options.push({
        id: String(user.roleId),
        label: user.roleName || `Role ${user.roleId}`,
      });
    }
    return options;
  }, [roles, user]);

  async function handleSubmit() {
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    const selectedRoleId = Number(roleId);
    if (!Number.isInteger(selectedRoleId) || selectedRoleId < 1) {
      setError("Role is required.");
      return;
    }
    if (!isUpdate || password) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    const ok = await confirm({
      title: isUpdate ? "Update user" : "Create user",
      message: isUpdate
        ? `Save changes to ${username.trim()}?`
        : `Create ${username.trim()}?`,
      confirmLabel: isUpdate ? "Save" : "Create",
    });
    if (!ok) {
      return;
    }

    setPending(true);
    setError("");
    const input = {
      username,
      email,
      fullName,
      roleId: selectedRoleId,
      isSuperUser,
      password: password || undefined,
    };
    const result = user
      ? await updateUserAction(user.id, input)
      : await createUserAction(input);
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <FormDialogFrame
      title={isUpdate ? "Update user" : "Add user"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <FormSectionStrip title="User details" />
      <div className={sectionGridClass}>
        <FormField label="Username">
          <input
            autoComplete="off"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Email">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Full name">
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Role">
          <RecordSelect
            options={roleOptions}
            value={roleId}
            onChange={setRoleId}
            emptyHint={{ text: "No active roles. Add them first", href: "/roles" }}
          />
        </FormField>
        <CheckboxField
          label="Super user"
          checked={isSuperUser}
          onChange={setIsSuperUser}
        />
        <FormField
          label={isUpdate ? "New password" : "Password"}
          hint={
            isUpdate
              ? "Leave blank to keep the current password"
              : `At least ${MIN_PASSWORD_LENGTH} characters`
          }
        >
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label={isUpdate ? "Confirm new password" : "Confirm password"}>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={formControlClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
