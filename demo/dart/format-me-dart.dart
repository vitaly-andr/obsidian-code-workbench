// Deliberately mis-formatted Dart. Run "Format code file" to fix the layout.
class User{final String name;final List<String> roles;User(this.name,this.roles);bool get isAdmin=>roles.contains('admin');}
String describe(User u){return '${u.name} has ${u.roles.length} roles';}
void main(){final users=[User('Ada',['admin','editor']),User('Bob',['viewer'])];for(var u in users){print(describe(u));}}
