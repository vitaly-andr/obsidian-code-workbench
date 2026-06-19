// Mis-formatted on purpose. Run "Format code file".
#include <stdio.h>
#include <string.h>
typedef struct{const char*name;const char*roles[8];int role_count;}User;
int is_admin(const User*u){for(int i=0;i<u->role_count;i++){if(strcmp(u->roles[i],"admin")==0)return 1;}return 0;}
int sum_even(const int*a,int n){int t=0;for(int i=0;i<n;i++){if(a[i]%2==0)t+=a[i];}return t;}
int main(void){User ada={"Ada",{"admin"},1};int nums[]={1,2,3,4};printf("%d %d\n",is_admin(&ada),sum_even(nums,4));return 0;}
