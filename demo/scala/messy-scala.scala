// error: the object body is missing its closing brace }
object Sample {
  def sumEven(nums: List[Int]): Int =
    nums.filter(_ % 2 == 0).sum

  def main(args: Array[String]): Unit = {
    println(sumEven(List(1, 2, 3, 4)))
  }
