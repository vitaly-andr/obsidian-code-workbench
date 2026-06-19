// Mis-formatted on purpose. Run "Format code file".
const GREETING:&str="Hello";struct User{name:String,roles:Vec<String>,}
impl User{fn is_admin(&self)->bool{self.roles.iter().any(|r|r=="admin")}}
fn describe(user:&User)->String{format!("{}, {} has {} roles",GREETING,user.name,user.roles.len())}
fn sum_even(nums:&[i32])->i32{nums.iter().filter(|n|*n%2==0).sum()}
fn main(){let n=sum_even(&[1,2,3,4]);println!("evenSum: {}",n);}
