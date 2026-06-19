// Mis-formatted on purpose. Run "Format code file".
package main
import ("fmt";"strings")
type User struct{Name string;Roles []string}
func (u User) IsAdmin() bool{for _,r:=range u.Roles{if r=="admin"{return true}};return false}
func describe(u User) string{return fmt.Sprintf("%s has %d roles",u.Name,len(u.Roles))}
func main(){u:=User{"Ada",[]string{"admin"}};fmt.Println(describe(u),strings.Join(u.Roles,","))}
