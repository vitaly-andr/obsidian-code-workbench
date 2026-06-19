// error: the main function body is missing its closing brace }
fun sumEven(nums: List<Int>): Int = nums.filter { it % 2 == 0 }.sum()

fun main() {
    println(sumEven(listOf(1, 2, 3, 4)))
