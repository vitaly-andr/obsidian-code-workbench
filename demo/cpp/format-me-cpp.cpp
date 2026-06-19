// Mis-formatted on purpose. Run "Format code file".
#include <iostream>
#include <vector>
#include <algorithm>
class User{public:User(std::string n,std::vector<std::string> r):name_(n),roles_(r){}
bool isAdmin()const{return std::find(roles_.begin(),roles_.end(),"admin")!=roles_.end();}
private:std::string name_;std::vector<std::string> roles_;};
int sumEven(const std::vector<int>&v){int t=0;for(int n:v)if(n%2==0)t+=n;return t;}
int main(){User a{"Ada",{"admin"}};std::cout<<a.isAdmin()<<" "<<sumEven({1,2,3,4})<<"\n";}
