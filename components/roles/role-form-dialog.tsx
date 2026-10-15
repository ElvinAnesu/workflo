"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createRoleAction,
  updateRoleAction,
} from "@/app/(app)/roles/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import {
  emptyPermissionActions,
  emptyPermissions,
  PERMISSION_FEATURES,
  PERMISSION_GROUPS,
  SUPER_ADMIN_PROTECTED_KEYS,
  type PermissionFeature,
  type PermissionGroup,
} from "@/components/roles/permission-features";
import type {
  RolePermissionActions,
  RoleRow,
} from "@/components/roles/role.types";

type RoleFormDialogProps = {
  role?: RoleRow | null;
  onClose: () => void;
};

type RoleFormState = {
  name: string;
  description: string;
  isSuperAdmin: boolean;
  permissions: Record<string, RolePermissionActions>;
};

const sectionGridClass = "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";

function createEmptyForm(): RoleFormState {
  return {
    name: "",
    description: "",
    isSuperAdmin: false,
    permissions: emptyPermissions(),
  };
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {label}
      {children}
    </label>
  );
}

function isProtectedKey(key: string, isSuperAdmin: boolean) {
  return (
    isSuperAdmin &&
    SUPER_ADMIN_PROTECTED_KEYS.includes(
      key as (typeof SUPER_ADMIN_PROTECTED_KEYS)[number],
    )
  );
}

function featureIsFullyOn(feature: PermissionFeature, actions: RolePermissionActions) {
  const runOk = feature.hasRun ? Boolean(actions.run) : true;
  const approveOk = feature.hasApprove ? Boolean(actions.approve) : true;
  return (
    actions.view &&
    actions.create &&
    actions.edit &&
    actions.delete &&
    runOk &&
    approveOk
  );
}

export function RoleFormDialog({ role, onClose }: RoleFormDialogProps) {
  const isUpdate = Boolean(role);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [form, setForm] = useState<RoleFormState>(() =>
    role
      ? {
          name: role.name,
          description: role.description,
          isSuperAdmin: role.isSuperAdmin,
          permissions: {
            ...emptyPermissions(),
            ...role.permissions,
          },
        }
      : createEmptyForm(),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function updateField(key: "name" | "description", value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setFeatureActions(key: string, next: RolePermissionActions) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: next,
      },
    }));
  }

  function toggleAction(
    feature: PermissionFeature,
    action: keyof RolePermissionActions,
    checked: boolean,
  ) {
    const current =
      form.permissions[feature.key] ?? emptyPermissionActions(feature.hasRun, feature.hasApprove);
    const protectedView = isProtectedKey(feature.key, form.isSuperAdmin);

    if (action === "view") {
      if (protectedView && !checked) {
        return;
      }
      if (!checked) {
        setFeatureActions(feature.key, emptyPermissionActions(feature.hasRun, feature.hasApprove));
        return;
      }
      setFeatureActions(feature.key, { ...current, view: true });
      return;
    }

    if (!current.view) {
      return;
    }

    setFeatureActions(feature.key, { ...current, [action]: checked });
  }

  function toggleGroup(group: PermissionGroup, turnOn: boolean) {
    setForm((current) => {
      const next = { ...current.permissions };

      for (const feature of PERMISSION_FEATURES) {
        if (feature.group !== group) {
          continue;
        }

        const protectedView = isProtectedKey(feature.key, current.isSuperAdmin);

        if (turnOn) {
          next[feature.key] = {
            view: true,
            create: true,
            edit: true,
            delete: true,
            ...(feature.hasRun ? { run: true } : {}),
            ...(feature.hasApprove ? { approve: true } : {}),
          };
        } else if (protectedView) {
          next[feature.key] = {
            view: true,
            create: false,
            edit: false,
            delete: false,
          };
        } else {
          next[feature.key] = emptyPermissionActions(feature.hasRun, feature.hasApprove);
        }
      }

      return { ...current, permissions: next };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Enter a role name.");
      return;
    }
    if (!Object.values(form.permissions).some((actions) => actions.view)) {
      setError("Give this role access to at least one feature.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update role" : "Create role",
      message: isUpdate
        ? `Save changes to ${name}?`
        : `Create ${name}?`,
      confirmLabel: isUpdate ? "Save" : "Create",
    });
    if (!ok) {
      return;
    }

    setPending(true);
    setError("");
    const input = {
      name,
      description: form.description.trim(),
      permissions: form.permissions,
    };
    const result = role
      ? await updateRoleAction(Number(role.id), input)
      : await createRoleAction(input);
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-800">
          {isUpdate ? "Update role" : "Add role"}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className={sectionGridClass}>
          <FormField label="Role name *">
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className={formControlClass}
            />
          </FormField>
          <FormField label="Description">
            <input
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              className={formControlClass}
            />
          </FormField>
        </div>
        <FormSectionStrip title="Permissions" />
        <div className="p-4">
          <table className="w-full border-collapse text-xs text-zinc-700">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-1.5 pr-2 font-semibold">Feature</th>
                <th className="w-14 py-1.5 text-center font-semibold">Read</th>
                <th className="w-14 py-1.5 text-center font-semibold">Insert</th>
                <th className="w-14 py-1.5 text-center font-semibold">Update</th>
                <th className="w-14 py-1.5 text-center font-semibold">Delete</th>
                <th className="w-14 py-1.5 text-center font-semibold">Run</th>
                <th className="w-14 py-1.5 text-center font-semibold">Approve</th>
              </tr>
            </thead>
            {PERMISSION_GROUPS.map((group) => {
              const features = PERMISSION_FEATURES.filter(
                (feature) => feature.group === group,
              );
              const groupAllOn = features.every((feature) =>
                featureIsFullyOn(
                  feature,
                  form.permissions[feature.key] ??
                    emptyPermissionActions(feature.hasRun, feature.hasApprove),
                ),
              );

              return (
                <tbody key={group}>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <td className="py-1.5 pr-2 font-semibold text-zinc-800" colSpan={7}>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={groupAllOn}
                          onChange={() => toggleGroup(group, !groupAllOn)}
                        />
                        {group}
                      </label>
                    </td>
                  </tr>
                  {features.map((feature) => {
                    const actions =
                      form.permissions[feature.key] ??
                      emptyPermissionActions(feature.hasRun, feature.hasApprove);
                    const viewOff = !actions.view;
                    const protectView = isProtectedKey(
                      feature.key,
                      form.isSuperAdmin,
                    );

                    return (
                      <tr key={feature.key} className="border-b border-zinc-100">
                        <td className="py-1 pr-2">{feature.label}</td>
                        <td className="py-1 text-center">
                          <input
                            type="checkbox"
                            checked={actions.view}
                            disabled={protectView}
                            onChange={(event) =>
                              toggleAction(feature, "view", event.target.checked)
                            }
                          />
                        </td>
                        <td className="py-1 text-center">
                          <input
                            type="checkbox"
                            checked={actions.create}
                            disabled={viewOff}
                            onChange={(event) =>
                              toggleAction(
                                feature,
                                "create",
                                event.target.checked,
                              )
                            }
                          />
                        </td>
                        <td className="py-1 text-center">
                          <input
                            type="checkbox"
                            checked={actions.edit}
                            disabled={viewOff}
                            onChange={(event) =>
                              toggleAction(feature, "edit", event.target.checked)
                            }
                          />
                        </td>
                        <td className="py-1 text-center">
                          <input
                            type="checkbox"
                            checked={actions.delete}
                            disabled={viewOff}
                            onChange={(event) =>
                              toggleAction(
                                feature,
                                "delete",
                                event.target.checked,
                              )
                            }
                          />
                        </td>
                        <td className="py-1 text-center">
                          {feature.hasRun ? (
                            <input
                              type="checkbox"
                              checked={Boolean(actions.run)}
                              disabled={viewOff}
                              onChange={(event) =>
                                toggleAction(
                                  feature,
                                  "run",
                                  event.target.checked,
                                )
                              }
                            />
                          ) : null}
                        </td>
                        <td className="py-1 text-center">
                          {feature.hasApprove ? (
                            <input
                              type="checkbox"
                              checked={Boolean(actions.approve)}
                              disabled={viewOff}
                              onChange={(event) =>
                                toggleAction(
                                  feature,
                                  "approve",
                                  event.target.checked,
                                )
                              }
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        {error ? <p className="mr-auto text-xs text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          {pending ? "Saving…" : isUpdate ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
