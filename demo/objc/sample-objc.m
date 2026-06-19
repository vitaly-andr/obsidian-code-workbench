// User roles demo
#import <Foundation/Foundation.h>

@interface User : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSArray<NSString *> *roles;
- (BOOL)isAdmin;
@end

@implementation User
- (BOOL)isAdmin {
    return [self.roles containsObject:@"admin"];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        User *ada = [[User alloc] init];
        ada.name = @"Ada";
        ada.roles = @[ @"admin", @"editor" ];
        NSLog(@"%@ admin=%d", ada.name, [ada isAdmin]);
    }
    return 0;
}
