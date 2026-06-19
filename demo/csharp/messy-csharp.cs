// error: class Program is missing its closing brace }
static class Program
{
    static int SumEven(int[] nums)
    {
        int total = 0;
        foreach (var n in nums) total += n;
        return total;
    }
