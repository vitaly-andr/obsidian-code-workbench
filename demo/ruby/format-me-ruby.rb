# Mis-formatted on purpose. Run "Format code file".
GREETING="Hello"
class User
attr_reader :name,:roles
def initialize(name,roles)
@name=name;@roles=roles
end
def admin?;roles.include?("admin");end
end
def describe(user); "#{GREETING}, #{user.name} has #{user.roles.size} roles";end
puts describe(User.new("Ada",["admin"]))
