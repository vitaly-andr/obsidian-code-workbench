// User roles demo
data class User(val name: String, val roles: List<String>) {
    val isAdmin: Boolean get() = "admin" in roles
}

fun describe(user: User): String =
    "${user.name} has ${user.roles.size} roles"

fun sumEven(nums: List<Int>): Int =
    nums.filter { it % 2 == 0 }.sum()

fun main() {
    val users = listOf(User("Ada", listOf("admin", "editor")), User("Bob", listOf("viewer")))
    println(describe(users[0]) + " admin=" + users[0].isAdmin)
    println("evenSum: " + sumEven(listOf(1, 2, 3, 4)))
}
