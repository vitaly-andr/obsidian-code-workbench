// User roles demo
case class User(name: String, roles: List[String]) {
  def isAdmin: Boolean = roles.contains("admin")
}

object Sample {
  def describe(user: User): String =
    s"${user.name} has ${user.roles.length} roles"

  def sumEven(nums: List[Int]): Int =
    nums.filter(_ % 2 == 0).sum

  def main(args: Array[String]): Unit = {
    val users = List(User("Ada", List("admin", "editor")), User("Bob", List("viewer")))
    println(describe(users.head) + " admin=" + users.head.isAdmin)
    println("evenSum: " + sumEven(List(1, 2, 3, 4)))
  }
}
