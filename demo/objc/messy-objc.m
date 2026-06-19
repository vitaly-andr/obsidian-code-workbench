// error: the @implementation is missing its closing @end
#import <Foundation/Foundation.h>
@implementation User
- (BOOL)isAdmin {
    return [self.roles containsObject:@"admin"];
}

int main(void) { return 0; }
