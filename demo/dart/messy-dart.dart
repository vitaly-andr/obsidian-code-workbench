// error: the User class body is missing its closing brace }
class User {
  final String name;
  final List<String> roles;
  User(this.name, this.roles);
  bool get isAdmin => roles.contains('admin');

void main() {
  print(User('Ada', ['admin']).isAdmin);
}
