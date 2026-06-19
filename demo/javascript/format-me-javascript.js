// Mis-formatted on purpose. Run "Format code file" to fix the layout.
const greeting="Hello";class User{constructor(name,roles){this.name=name;this.roles=roles;}
get isAdmin(){return this.roles.includes("admin");}}
function describe(user){return `${greeting}, ${user.name} has ${user.roles.length} roles`;}
const sumEven=(nums)=>nums.filter((n)=>n%2===0).reduce((a,b)=>a+b,0);
const users=[new User("Ada",["admin","editor"]),new User("Bob",["viewer"])];console.log(describe(users[0]));console.log("evenSum:",sumEven([1,2,3,4]));
