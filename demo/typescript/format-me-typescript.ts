// Mis-formatted on purpose. Run "Format code file" to fix the layout.
const greeting:string="Hello";interface HasRoles{name:string;roles:string[];}
class User implements HasRoles{constructor(public name:string,public roles:string[]){}
get isAdmin():boolean{return this.roles.includes("admin");}}
function describe(user:HasRoles):string{return `${greeting}, ${user.name} has ${user.roles.length} roles`;}
const sumEven=(nums:number[]):number=>nums.filter((n)=>n%2===0).reduce((a,b)=>a+b,0);
const users:User[]=[new User("Ada",["admin","editor"]),new User("Bob",["viewer"])];console.log(describe(users[0]),sumEven([1,2,3,4]));
