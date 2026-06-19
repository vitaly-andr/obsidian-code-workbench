// Sample Dart: classes, generics, collections
const String greeting = 'Hello';

class User {
  final String name;
  final List<String> roles;

  User(this.name, this.roles);

  bool get isAdmin => roles.contains('admin');
}

String describe(User user) {
  // string interpolation
  return '$greeting, ${user.name} has ${user.roles.length} roles';
}

int sumEven(List<int> numbers) =>
    numbers.where((n) => n % 2 == 0).fold(0, (a, b) => a + b);

void main() {
  final users = <User>[
    User('Ada', ['admin', 'editor']),
    User('Bob', ['viewer']),
  ];
  final counts = <String, int>{'a': 1, 'b': 2};
  final admins = users.where((u) => u.isAdmin).map((u) => u.name).toList();
  print(describe(users[0]));
  print('admins: $admins, evenSum ${sumEven([1, 2, 3, 4])}, counts ${counts.length}');
}
