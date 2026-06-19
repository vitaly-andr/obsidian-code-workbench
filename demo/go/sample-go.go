// User roles demo
package main

import (
	"fmt"
	"strings"
)

type User struct {
	Name  string
	Roles []string
}

func (u User) IsAdmin() bool {
	for _, r := range u.Roles {
		if r == "admin" {
			return true
		}
	}
	return false
}

func describe(u User) string {
	return fmt.Sprintf("%s has %d roles", u.Name, len(u.Roles))
}

func sumEven(nums []int) int {
	total := 0
	for _, n := range nums {
		if n%2 == 0 {
			total += n
		}
	}
	return total
}

func main() {
	users := []User{{"Ada", []string{"admin", "editor"}}, {"Bob", []string{"viewer"}}}
	fmt.Println(describe(users[0]), strings.Join(users[0].Roles, ","))
	fmt.Println("evenSum:", sumEven([]int{1, 2, 3, 4}))
}
