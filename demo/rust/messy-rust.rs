// error: the main() function body is missing its closing brace }
fn sum_even(nums: &[i32]) -> i32 {
    nums.iter().filter(|n| *n % 2 == 0).sum()
}

fn main() {
    println!("{}", sum_even(&[1, 2, 3, 4]));
