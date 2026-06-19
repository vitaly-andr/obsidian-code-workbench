// error: the interface body is missing its closing brace }
interface HasRoles {
  name: string;
  roles: string[];

function describe(user: HasRoles): string {
  return `${user.name} has ${user.roles.length} roles`;
}
