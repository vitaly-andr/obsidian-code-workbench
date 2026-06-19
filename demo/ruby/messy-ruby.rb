# error: the describe method is missing its closing "end"
def describe(user)
  "#{user.name} has #{user.roles.size} roles"

puts describe(nil)
