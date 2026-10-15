export type UserRow = {
  id: string;
  username: string;
  email: string;
  roleId: string;
};

export type UserListRow = {
  id: number;
  username: string;
  email: string;
  fullName: string;
  roleId: number | null;
  roleName: string;
  isSuperUser: boolean;
  isActive: boolean;
};

export type RoleSelectOption = {
  id: number;
  name: string;
};
