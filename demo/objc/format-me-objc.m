// Mis-formatted on purpose. Run "Format code file".
#import <Foundation/Foundation.h>
@interface User:NSObject
@property(nonatomic,copy)NSString*name;
@property(nonatomic,copy)NSArray<NSString*>*roles;
-(BOOL)isAdmin;
@end
@implementation User
-(BOOL)isAdmin{return [self.roles containsObject:@"admin"];}
@end
int main(int argc,const char*argv[]){@autoreleasepool{User*a=[[User alloc]init];a.roles=@[@"admin"];NSLog(@"%d",[a isAdmin]);}return 0;}
