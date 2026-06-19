// error: the describe() function body is missing its closing brace }
const greeting = "Hello";

function describe(user) {
  return `${greeting}, ${user.name} has ${user.roles.length} roles`;

console.log(describe({ name: "Ada", roles: ["admin"] }));
