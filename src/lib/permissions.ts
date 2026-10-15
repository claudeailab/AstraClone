export const ROLES = [
  { key: "administrator", label: "Administrator", description: "Admin area: GitHub accounts, repositories and synchronizations" },
  { key: "user", label: "User", description: "User area: list of synchronizations with their status and details" },
] as const;

export type Role = typeof ROLES[number]["key"];
export const ROLE_KEYS = ROLES.map(r => r.key) as [Role, ...Role[]];

export function roleFromPermissions(raw: string | null | undefined): Role | null {
  let perms: unknown = [];
  try { perms = JSON.parse(raw || "[]"); } catch { return null; }
  if (!Array.isArray(perms)) return null;
  if (perms.includes("administrator")) return "administrator";
  if (perms.includes("user")) return "user";
  return null;
}

export function homeForRole(role: Role) {
  return role === "administrator" ? "/admin" : "/user";
}
