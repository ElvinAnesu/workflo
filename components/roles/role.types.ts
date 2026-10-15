export type RolePermissionActions = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  run?: boolean;
  approve?: boolean;
};

export type RoleRow = {
  id: string;
  name: string;
  description: string;
  isSuperAdmin: boolean;
  permissions: Record<string, RolePermissionActions>;
};

export type RoleListRow = {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  userCount: number;
  featureCount: number;
  permissions: Record<string, RolePermissionActions>;
};
