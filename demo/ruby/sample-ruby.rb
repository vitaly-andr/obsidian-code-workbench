# User roles demo
GREETING = "Hello"

class User
  attr_reader :name, :roles

  def initialize(name, roles)
    @name = name
    @roles = roles
  end

  def admin?
    roles.include?("admin")
  end
end

def describe(user)
  "#{GREETING}, #{user.name} has #{user.roles.size} roles"
end

def sum_even(nums)
  nums.select { |n| n.even? }.sum
end

users = [User.new("Ada", ["admin", "editor"]), User.new("Bob", ["viewer"])]
puts describe(users.first)
puts "evenSum: #{sum_even([1, 2, 3, 4])}"
