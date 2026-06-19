// Mis-formatted on purpose. Run "Format code file".
import java.util.*;
public class Sample{record User(String name,List<String> roles){boolean isAdmin(){return roles.contains("admin");}}
static String describe(User u){return u.name()+" has "+u.roles().size()+" roles";}
static int sumEven(int[] a){int t=0;for(int n:a){if(n%2==0)t+=n;}return t;}
public static void main(String[] args){User ada=new User("Ada",List.of("admin"));System.out.println(describe(ada)+" "+sumEven(new int[]{1,2,3,4}));}}
